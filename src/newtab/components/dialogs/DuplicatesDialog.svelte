<script lang="ts">
  import {onMount} from 'svelte';
  import {SvelteSet} from 'svelte/reactivity';
  import {removeNodes, restoreNodes} from '../../../lib/bookmarkActions';
  import {bookmarks} from '../../../lib/bookmarks.svelte';
  import {type BookmarkEntry, defaultSelection, type DuplicateGroup, findDuplicates} from '../../../lib/duplicates';
  import {t} from '../../../lib/i18n/index.svelte';
  import {icons} from '../../../lib/icons.svelte';
  import {showNotice} from '../../../lib/notice.svelte';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import SiteIcon from '../grid/SiteIcon.svelte';
  import Modal from '../ui/Modal.svelte';

  // Bookmarks of the same page in different folders: the extra copies are marked for deletion, the first one stays
  let {onclose}: {onclose: () => void} = $props();

  let groups = $state.raw<DuplicateGroup[] | null>(null);
  const marked = new SvelteSet<string>();
  let busy = $state(false);
  let error = $state('');

  const extra = $derived(groups?.reduce((sum, group) => sum + group.entries.length - 1, 0) ?? 0);

  async function load() {
    const [root] = await chrome.bookmarks.getTree();
    groups = findDuplicates(root);
    marked.clear();
    defaultSelection(groups).forEach((id) => marked.add(id));
  }

  onMount(() => {
    load().catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });

  function toggle(id: string, checked: boolean) {
    if (checked) marked.add(id);
    else marked.delete(id);
  }

  const folderPath = (entry: BookmarkEntry) => entry.path.join(' › ');

  /** Deleting every copy of a page is allowed, but it's worth a glance — the group is highlighted */
  const allMarked = (group: DuplicateGroup) => group.entries.every((entry) => marked.has(entry.id));

  async function removeMarked() {
    busy = true;
    error = '';
    try {
      const removed = await removeNodes([...marked].map((id) => ({id})));
      const saved = new Map(removed.flatMap((item) => [...item.thumbnails]));
      await load();
      showNotice(t.duplicates.removed(removed.length), 'info', {
        label: t.common.undo,
        run: async () => {
          await thumbnails.restore(saved, await restoreNodes(removed));
          await load();
        },
      });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function openFolder(entry: BookmarkEntry) {
    bookmarks.navigate(entry.parentId);
    onclose();
  }
</script>

<Modal title={t.duplicates.title} size="large" {onclose}>
  {#if groups === null}
    <p class="duplicates__summary">{t.common.loading}</p>
  {:else if groups.length === 0}
    <p class="duplicates__summary" role="status">{t.duplicates.none}</p>
  {:else}
    <p class="duplicates__summary" role="status">{t.duplicates.summary(groups.length, extra)}</p>
    <ul class="duplicates">
      {#each groups as group (group.key)}
        {@const first = group.entries[0]}
        <li class="duplicates__group" class:duplicates__group--all={allMarked(group)}>
          <div class="duplicates__page">
            <SiteIcon entry={icons.get(first.url)} appearance="mini"/>
            <span class="duplicates__url" title={first.url}>{first.url}</span>
            {#if allMarked(group)}
              <span class="duplicates__warning">{t.duplicates.allMarked}</span>
            {/if}
          </div>
          <ul class="duplicates__entries">
            {#each group.entries as entry (entry.id)}
              <li class="duplicates__entry">
                <input
                  type="checkbox"
                  aria-label={t.duplicates.mark(entry.title, folderPath(entry))}
                  checked={marked.has(entry.id)}
                  onchange={(event) => toggle(entry.id, event.currentTarget.checked)}
                >
                <span class="duplicates__title" title={entry.url}>{entry.title || entry.url}</span>
                <button
                  type="button"
                  class="duplicates__folder"
                  title={t.duplicates.openFolder}
                  onclick={() => openFolder(entry)}
                >{folderPath(entry)}</button>
              </li>
            {/each}
          </ul>
        </li>
      {/each}
    </ul>
  {/if}
  {#if error}
    <p class="duplicates__error" role="alert">{error}</p>
  {/if}

  {#snippet footer()}
    <button type="button" class="button" onclick={onclose}>{t.common.close}</button>
    {#if groups && groups.length > 0}
      <button
        type="button"
        class="button button--danger"
        disabled={busy || marked.size === 0}
        onclick={removeMarked}
      >{t.duplicates.removeMarked(marked.size)}</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .duplicates__summary {
    margin: 0 0 12px;
  }

  .duplicates {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .duplicates__group {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    background: var(--field-bg);
  }

  .duplicates__group--all {
    border-color: var(--danger);
  }

  .duplicates__page {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin-bottom: 6px;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .duplicates__url {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .duplicates__warning {
    flex-shrink: 0;
    margin-left: auto;
    color: var(--danger);
  }

  .duplicates__entries {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .duplicates__entry {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, auto);
    align-items: center;
    gap: 10px;
    padding: 4px 0;
  }

  .duplicates__entry input {
    accent-color: var(--danger);
  }

  .duplicates__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .duplicates__folder {
    overflow: hidden;
    max-width: 280px;
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

  .duplicates__folder:hover {
    color: var(--accent);
  }

  .duplicates__error {
    margin: 12px 0 0;
    color: var(--danger);
    font-size: 0.8125rem;
  }
</style>
