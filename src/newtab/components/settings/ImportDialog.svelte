<script lang="ts">
  import {onMount} from 'svelte';
  import {existingLinks, planImport, runImport, withoutUnsupported} from '../../../lib/bookmarkImport';
  import {type ExistingNode, planMerge, runMerge} from '../../../lib/bookmarkMerge';
  import {type HtmlBookmark, htmlMergeRoots} from '../../../lib/bookmarksHtml';
  import {bookmarks} from '../../../lib/bookmarks.svelte';
  import {type FolderOption, flattenFolders} from '../../../lib/folders';
  import {t} from '../../../lib/i18n/index.svelte';
  import {showNotice} from '../../../lib/notice.svelte';
  import Modal from '../ui/Modal.svelte';

  // Importing a browser's bookmarks file. Merging (the default): the bar into the bar, same-named folders merge,
  // a bookmark already in that folder is skipped — for moving bookmarks between browsers and computers.
  // Or everything into one folder as it is, optionally skipping bookmarks that exist anywhere
  let {fileName, nodes, onimported, onclose}: {
    fileName: string;
    nodes: HtmlBookmark[];
    onimported: (message: string) => void;
    onclose: () => void;
  } = $props();

  const formId = $props.id();
  let mode = $state<'merge' | 'separate'>('merge');
  let tree = $state.raw<ExistingNode | null>(null);
  let folders = $state.raw<FolderOption[]>([]);
  let existing = $state.raw<Set<string>>(new Set());
  let parentId = $state('');
  let intoNewFolder = $state(true);
  let folderTitle = $state(t.importHtml.defaultFolder);
  let skipDuplicates = $state(true);
  let progress = $state<number | null>(null);
  let error = $state('');

  const plan = $derived(planImport(nodes, skipDuplicates ? existing : null));
  const mergePlan = $derived(tree ? planMerge(htmlMergeRoots(withoutUnsupported(nodes)), tree) : null);
  const toAdd = $derived(mode === 'merge' ? mergePlan?.bookmarks ?? 0 : plan.bookmarks);

  onMount(() => {
    chrome.bookmarks.getTree()
      .then(([root]) => {
        tree = root;
        folders = flattenFolders(root);
        existing = existingLinks([root]);
        const exists = (id: string | null) => folders.some((folder) => folder.id === id);
        const preferred = bookmarks.startFolder();
        parentId = exists(preferred) ? preferred : exists(bookmarks.barId) ? bookmarks.barId! : folders[0]?.id ?? '';
      })
      .catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });

  /** Merges and says what happened; the notification can undo it — what was added is removed */
  async function merge() {
    if (!mergePlan) return;
    let done = 0;
    const created = await runMerge(mergePlan, chrome.bookmarks, (_id, node) => {
      if (node.url !== undefined) progress = ++done;
    });
    const undo = async () => {
      for (const id of created) await chrome.bookmarks.removeTree(id).catch(() => undefined);
      showNotice(t.importHtml.mergeUndone, 'info');
    };
    // Only the notification, not the line under the settings too: it's the one that can undo
    const message = t.importHtml.merged(mergePlan.bookmarks, mergePlan.duplicates);
    showNotice(message, 'info', created.length > 0 ? {label: t.common.undo, run: undo} : null);
  }

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    progress = 0;
    try {
      if (mode === 'merge') {
        await merge();
        onclose();
        return;
      }
      const title = intoNewFolder ? folderTitle.trim() || t.importHtml.defaultFolder : null;
      await runImport(plan, {parentId, folderTitle: title}, (done) => (progress = done));
      const target = title ?? folders.find((folder) => folder.id === parentId)?.title ?? '';
      onimported(t.importHtml.done(plan.bookmarks, target, plan.duplicates));
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      progress = null;
    }
  }
</script>

<Modal title={t.importHtml.title(fileName)} {onclose}>
  <form id={formId} class="import-form" {onsubmit}>
    <div class="import-form__modes" role="radiogroup" aria-label={t.importHtml.modes}>
      <label class="import-form__mode">
        <input type="radio" name="{formId}-mode" value="merge" bind:group={mode}>
        <span>
          <span class="import-form__mode-label">{t.importHtml.merge}</span>
          <span class="import-form__muted">{t.importHtml.mergeHint}</span>
        </span>
      </label>
      <label class="import-form__mode">
        <input type="radio" name="{formId}-mode" value="separate" bind:group={mode}>
        <span>
          <span class="import-form__mode-label">{t.importHtml.separate}</span>
          <span class="import-form__muted">{t.importHtml.separateHint}</span>
        </span>
      </label>
    </div>

    {#if mode === 'merge'}
      <p class="import-form__summary" role="status">
        {#if !mergePlan}
          {t.common.loading}
        {:else if mergePlan.bookmarks > 0}
          {t.importHtml.mergeSummary(mergePlan.bookmarks, mergePlan.folders)}
        {:else}
          {t.importHtml.nothing}
        {/if}
        {#if mergePlan && mergePlan.mergedFolders > 0}
          <span class="import-form__muted">{t.importHtml.mergedFolders(mergePlan.mergedFolders)}</span>
        {/if}
        {#if mergePlan && mergePlan.duplicates > 0}
          <span class="import-form__muted">{t.importHtml.duplicatesInFolders(mergePlan.duplicates)}</span>
        {/if}
      </p>
    {:else}
      <p class="import-form__summary" role="status">
        {#if plan.bookmarks > 0}
          {t.importHtml.summary(plan.bookmarks, plan.folders)}
        {:else}
          {t.importHtml.nothing}
        {/if}
        {#if plan.duplicates > 0}
          <span class="import-form__muted">{t.importHtml.duplicates(plan.duplicates)}</span>
        {/if}
      </p>

      <label class="import-form__label" for="{formId}-parent">{t.importHtml.parent}</label>
      <select id="{formId}-parent" class="input" bind:value={parentId}>
        {#each folders as folder (folder.id)}
          <option value={folder.id}>{'\u00a0\u00a0\u00a0'.repeat(folder.depth)}{folder.title}</option>
        {/each}
      </select>

      <label class="import-form__check">
        <input type="checkbox" bind:checked={intoNewFolder}>
        {t.importHtml.intoNewFolder}
      </label>
      {#if intoNewFolder}
        <input class="input" aria-label={t.importHtml.folderTitle} bind:value={folderTitle}>
      {/if}

      <label class="import-form__check">
        <input type="checkbox" bind:checked={skipDuplicates}>
        {t.importHtml.skipDuplicates}
      </label>

    {/if}

    {#if error}
      <p class="import-form__error" role="alert">{error}</p>
    {/if}
  </form>

  {#snippet footer()}
    <button type="button" class="button" onclick={onclose}>{t.common.cancel}</button>
    <button
      type="submit"
      class="button button--primary"
      form={formId}
      disabled={progress !== null || toAdd === 0 || (mode === 'separate' && !parentId)}
    >
      {progress === null ? t.importHtml.submit : t.importHtml.progress(progress, toAdd)}
    </button>
  {/snippet}
</Modal>

<style>
  .import-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .import-form__modes {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 8px;
  }

  .import-form__mode {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
  }

  .import-form__mode input {
    margin-top: 3px;
    accent-color: var(--accent);
  }

  .import-form__mode-label {
    display: block;
    font-weight: 600;
  }

  .import-form__summary {
    margin: 0 0 8px;
    line-height: 1.45;
  }

  .import-form__muted {
    display: block;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .import-form__label {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .import-form__check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    cursor: pointer;
  }

  .import-form__check input {
    accent-color: var(--accent);
  }

  .import-form__error {
    margin: 0;
    color: var(--danger);
    font-size: 0.8125rem;
  }
</style>
