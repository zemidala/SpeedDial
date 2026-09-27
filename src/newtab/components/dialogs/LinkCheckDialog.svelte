<script lang="ts">
  import {onDestroy, onMount} from 'svelte';
  import {SvelteSet} from 'svelte/reactivity';
  import {removeNodes, restoreNodes} from '../../../lib/bookmarkActions';
  import {bookmarks} from '../../../lib/bookmarks.svelte';
  import {brokenLinks, describeProblem} from '../../../lib/brokenLinks.svelte';
  import {ROOT_FOLDER_ID} from '../../../lib/constants';
  import {type BookmarkEntry, bookmarkEntries} from '../../../lib/duplicates';
  import {t} from '../../../lib/i18n/index.svelte';
  import {icons} from '../../../lib/icons.svelte';
  import {type LinkCheck, RECHECK_TIMEOUT, runPool} from '../../../lib/linkCheck';
  import {requestLinkCheck} from '../../../lib/messages';
  import {showNotice} from '../../../lib/notice.svelte';
  import {SITE_ACCESS} from '../../../lib/permissionSets';
  import {permissions} from '../../../lib/permissions.svelte';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import type {LinkCheckScope} from '../../../lib/ui.svelte';
  import {isWebUrl} from '../../../lib/url';
  import SiteIcon from '../grid/SiteIcon.svelte';
  import Modal from '../ui/Modal.svelte';

  // Checks web bookmarks — all of them, one folder with subfolders or one bookmark: does the site answer and is
  // the page still there. Found ones can be deleted, or marked — the tile then shows a "doesn't work" placeholder
  let {scope, onclose}: {scope?: LinkCheckScope; onclose: () => void} = $props();

  const title = $derived(scope?.kind === 'folder'
    ? t.linkCheck.titleFolder(scope.title)
    : scope?.kind === 'bookmark' ? t.linkCheck.titleBookmark(scope.title) : t.linkCheck.title);
  const single = $derived(scope?.kind === 'bookmark');

  /** Requests at once: fast enough, and doesn't flood one site with requests */
  const CONCURRENCY = 6;
  /** The second try for sites that didn't answer: few at a time, so none is slowed down by the others */
  const RECHECK_CONCURRENCY = 2;

  interface Problem {
    entry: BookmarkEntry;
    check: LinkCheck & {problem: NonNullable<LinkCheck['problem']>};
  }

  let entries = $state.raw<BookmarkEntry[]>([]);
  let phase = $state<'idle' | 'running' | 'done'>('idle');
  let checked = $state(0);
  let stopped = $state(false);
  /** Sites that didn't answer, still being asked again */
  let rechecking = $state(0);
  let problems = $state<Problem[]>([]);
  const selected = new SvelteSet<string>();
  let busy = $state(false);
  let error = $state('');
  let controller: AbortController | null = null;

  /** Folder names from the top down to folderId, for the folder chips */
  async function pathTo(folderId: string | undefined): Promise<string[]> {
    const titles: string[] = [];
    while (folderId && folderId !== ROOT_FOLDER_ID) {
      const [folder] = await chrome.bookmarks.get(folderId);
      titles.unshift(folder.title);
      folderId = folder.parentId;
    }
    return titles;
  }

  async function loadEntries(): Promise<BookmarkEntry[]> {
    if (scope?.kind === 'bookmark') {
      const [node] = await chrome.bookmarks.get(scope.id);
      if (!node.url) return [];
      return [{id: node.id, parentId: node.parentId!, title: node.title, url: node.url, path: await pathTo(node.parentId)}];
    }
    const [root] = scope ? await chrome.bookmarks.getSubTree(scope.id) : await chrome.bookmarks.getTree();
    return bookmarkEntries(root, scope ? await pathTo(scope.id) : []);
  }

  onMount(() => {
    loadEntries()
      .then((result) => {
        entries = result.filter((entry) => isWebUrl(entry.url));
        // One bookmark — nothing to confirm, the check starts at once (the menu click still counts as a gesture
        // if site access has to be asked for)
        if (single && entries.length > 0) void start();
      })
      .catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });
  onDestroy(() => controller?.abort());

  /** Rejects when the check is stopped: requests already sent to the service worker are simply not waited for */
  const whenStopped = (signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  });

  async function start() {
    error = '';
    // Reading other sites' answers needs access to sites — asked right in the click
    if (!permissions.siteAccess && !(await permissions.request(SITE_ACCESS))) return;
    if (!navigator.onLine) {
      error = t.linkCheck.offline;
      return;
    }

    controller = new AbortController();
    const {signal} = controller;
    phase = 'running';
    checked = 0;
    stopped = false;
    problems = [];
    selected.clear();
    const working: string[] = [];
    const ask = async (entry: BookmarkEntry, timeout?: number): Promise<LinkCheck | null> => {
      try {
        return await Promise.race([requestLinkCheck(entry.url, timeout), whenStopped(signal)]);
      } catch {
        return signal.aborted ? null : {problem: 'unreachable'};
      }
    };

    await runPool(entries, CONCURRENCY, signal, async (entry) => {
      const check = await ask(entry);
      if (!check) return; // Stopped
      checked++;
      if (check.problem) {
        problems.push({entry, check: {...check, problem: check.problem}});
        // Only a page the site says is gone is marked for action by default: a server error is often temporary,
        // and a site that didn't answer the extension may still open in the browser (internal sites, VPN)
        if (check.problem === 'notFound') selected.add(entry.id);
      } else if (brokenLinks.get(entry.id)) {
        working.push(entry.id);
      }
    });

    // Sites that didn't answer get a second, patient try one by one: many just answered slowly while
    // six requests were running at once
    const silent = problems.filter(({check}) => check.problem === 'unreachable').map(({entry}) => entry);
    rechecking = silent.length;
    await runPool(silent, RECHECK_CONCURRENCY, signal, async (entry) => {
      const check = await ask(entry, RECHECK_TIMEOUT);
      if (!check) return;
      rechecking--;
      if (check.problem === 'unreachable') return;
      problems = problems.filter((problem) => problem.entry.id !== entry.id);
      if (check.problem) {
        problems.push({entry, check: {...check, problem: check.problem}});
        if (check.problem === 'notFound') selected.add(entry.id);
      } else if (brokenLinks.get(entry.id)) {
        working.push(entry.id);
      }
    });
    rechecking = 0;

    // Marked earlier but working now — the placeholder goes away
    if (working.length > 0) await brokenLinks.unmark(working);
    // Keep the tree order, not the order answers came in
    const order = new Map(entries.map((entry, index) => [entry.id, index]));
    problems.sort((a, b) => order.get(a.entry.id)! - order.get(b.entry.id)!);
    stopped = signal.aborted;
    controller = null;
    phase = 'done';
  }

  function stop() {
    controller?.abort();
  }

  function toggle(id: string, on: boolean) {
    if (on) selected.add(id);
    else selected.delete(id);
  }

  const folderPath = (entry: BookmarkEntry) => entry.path.join(' › ');

  const reason = ({problem, status}: Problem['check']) => describeProblem(problem, status);

  async function run(action: () => Promise<void>) {
    busy = true;
    error = '';
    try {
      await action();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const markSelected = () => run(async () => {
    const now = Date.now();
    const marks = Object.fromEntries(problems
      .filter(({entry}) => selected.has(entry.id))
      .map(({entry, check}) => [entry.id, {problem: check.problem, status: check.status, checkedAt: now}]));
    await brokenLinks.mark(marks);
    showNotice(t.linkCheck.marked(Object.keys(marks).length), 'info');
  });

  const deleteSelected = () => run(async () => {
    const ids = [...selected];
    const removed = await removeNodes(ids.map((id) => ({id})));
    const saved = new Map(removed.flatMap((item) => [...item.thumbnails]));
    problems = problems.filter(({entry}) => !selected.has(entry.id));
    selected.clear();
    showNotice(t.linkCheck.deleted(removed.length), 'info', {
      label: t.common.undo,
      run: async () => thumbnails.restore(saved, await restoreNodes(removed)),
    });
  });

  function openFolder(entry: BookmarkEntry) {
    bookmarks.navigate(entry.parentId);
    onclose();
  }
</script>

<Modal {title} size="large" {onclose}>
  {#if phase === 'idle'}
    <p class="link-check__text">{t.linkCheck.intro(entries.length)}</p>
  {:else}
    <div class="link-check__progress">
      <p class="link-check__text" role="status">
        {#if phase === 'running' && rechecking > 0}
          {t.linkCheck.rechecking(rechecking)}
        {:else if phase === 'running'}
          {single ? t.linkCheck.checkingOne : t.linkCheck.progress(checked, entries.length, problems.length)}
        {:else if single && !stopped}
          {problems.length === 0 ? t.linkCheck.linkWorks : t.linkCheck.linkBroken}
        {:else if problems.length === 0}
          {stopped ? t.linkCheck.stoppedClean(checked, entries.length) : t.linkCheck.allWork(checked)}
        {:else}
          {stopped ? t.linkCheck.stopped(checked, entries.length, problems.length) : t.linkCheck.found(checked, problems.length)}
        {/if}
      </p>
      {#if phase === 'running'}
        <progress max={entries.length} value={single || rechecking > 0 ? undefined : checked}></progress>
      {/if}
    </div>

    {#if problems.length > 0}
      <ul class="link-check__list">
        {#each problems as {entry, check} (entry.id)}
          <li class="link-check__item">
            <input
              type="checkbox"
              aria-label={t.linkCheck.select(entry.title || entry.url)}
              checked={selected.has(entry.id)}
              disabled={phase === 'running'}
              onchange={(event) => toggle(entry.id, event.currentTarget.checked)}
            >
            <SiteIcon entry={icons.get(entry.url)} appearance="mini"/>
            <span class="link-check__name">
              <span class="link-check__title">{entry.title || entry.url}</span>
              <span class="link-check__url" title={entry.url}>{entry.url}</span>
            </span>
            <span class="link-check__reason link-check__reason--{check.problem}">
              {reason(check)}{#if brokenLinks.get(entry.id)}&nbsp;· {t.linkCheck.alreadyMarked}{/if}
            </span>
            <button type="button" class="link-check__folder" title={t.duplicates.openFolder} onclick={() => openFolder(entry)}>
              {folderPath(entry)}
            </button>
          </li>
        {/each}
      </ul>
      {#if phase === 'done'}
        <p class="link-check__hint">{t.linkCheck.actionsHint}</p>
      {/if}
    {/if}
  {/if}
  {#if error}
    <p class="link-check__error" role="alert">{error}</p>
  {/if}

  {#snippet footer()}
    <button type="button" class="button" onclick={onclose}>{t.common.close}</button>
    {#if phase === 'running'}
      <button type="button" class="button" onclick={stop}>{t.linkCheck.stop}</button>
    {:else if phase === 'done' && problems.length > 0}
      <button type="button" class="button" disabled={busy || selected.size === 0} onclick={markSelected}>
        {t.linkCheck.mark(selected.size)}
      </button>
      <button type="button" class="button button--danger" disabled={busy || selected.size === 0} onclick={deleteSelected}>
        {t.linkCheck.delete(selected.size)}
      </button>
    {:else}
      <button type="button" class="button button--primary" disabled={entries.length === 0} onclick={start}>
        {phase === 'idle' ? t.linkCheck.start : t.linkCheck.again}
      </button>
    {/if}
  {/snippet}
</Modal>

<style>
  .link-check__text {
    margin: 0 0 12px;
    line-height: 1.45;
  }

  .link-check__progress progress {
    width: 100%;
    margin-bottom: 12px;
    accent-color: var(--accent);
  }

  .link-check__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .link-check__item {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto minmax(0, auto);
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    border-top: 1px solid var(--border);
  }

  .link-check__item input {
    accent-color: var(--accent);
  }

  .link-check__name {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .link-check__title,
  .link-check__url {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link-check__url {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .link-check__reason {
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  .link-check__reason--notFound,
  .link-check__reason--unreachable {
    color: var(--danger);
  }

  .link-check__reason--serverError {
    color: var(--text-muted);
  }

  .link-check__folder {
    overflow: hidden;
    max-width: 220px;
    padding: 2px 8px;
    border: 0;
    border-radius: 10px;
    background: var(--surface-hover);
    color: var(--text-muted);
    font-size: 0.75rem;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .link-check__folder:hover {
    color: var(--accent);
  }

  .link-check__hint {
    margin: 12px 0 0;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .link-check__error {
    margin: 12px 0 0;
    color: var(--danger);
    font-size: 0.8125rem;
  }

  @media (max-width: 640px) {
    .link-check__item {
      grid-template-columns: auto auto minmax(0, 1fr);
    }

    .link-check__reason,
    .link-check__folder {
      grid-column: 3;
      justify-self: start;
    }
  }
</style>
