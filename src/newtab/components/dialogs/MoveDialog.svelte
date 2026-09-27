<script lang="ts">
  import {onMount} from 'svelte';
  import {moveNodes} from '../../../lib/bookmarkActions';
  import type {BookmarkNode} from '../../../lib/bookmarks.svelte';
  import {bookmarks} from '../../../lib/bookmarks.svelte';
  import {type FolderOption, getFolderOptions} from '../../../lib/folders';
  import {t} from '../../../lib/i18n/index.svelte';
  import {showNotice} from '../../../lib/notice.svelte';
  import {selection} from '../../../lib/selection.svelte';
  import Modal from '../ui/Modal.svelte';

  // Moving the selected bookmarks and folders to another folder
  let {nodes, onclose}: {nodes: BookmarkNode[]; onclose: () => void} = $props();

  const formId = $props.id();
  let folders = $state.raw<FolderOption[]>([]);
  let folderId = $state('');
  let error = $state('');
  let moving = $state(false);

  /** A folder can't be moved into itself or its subfolders — such options aren't shown */
  function allowedFolders(options: FolderOption[]): FolderOption[] {
    const moved = new Set(nodes.filter((node) => !node.url).map((node) => node.id));
    const result: FolderOption[] = [];
    let skipDeeperThan: number | null = null;
    for (const option of options) {
      if (skipDeeperThan !== null && option.depth > skipDeeperThan) continue;
      skipDeeperThan = null;
      if (moved.has(option.id)) {
        skipDeeperThan = option.depth;
        continue;
      }
      result.push(option);
    }
    return result;
  }

  onMount(() => {
    getFolderOptions()
      .then((options) => {
        folders = allowedFolders(options);
        folderId = folders.find((folder) => folder.id !== bookmarks.folderId)?.id ?? folders[0]?.id ?? '';
      })
      .catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    moving = true;
    error = '';
    try {
      await moveNodes(nodes.map((node) => node.id), folderId);
      const folder = folders.find((item) => item.id === folderId);
      selection.clear();
      showNotice(t.selection.moved(nodes.length, folder?.title ?? ''), 'info');
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      moving = false;
    }
  }
</script>

<Modal title={t.selection.moveTitle(nodes.length)} {onclose}>
  <form id={formId} class="move-form" {onsubmit}>
    <label class="move-form__label" for="{formId}-folder">{t.selection.folder}</label>
    <select id="{formId}-folder" class="input" bind:value={folderId}>
      {#each folders as folder (folder.id)}
        <option value={folder.id}>{'\u00a0\u00a0\u00a0'.repeat(folder.depth)}{folder.title}</option>
      {/each}
    </select>
    {#if error}
      <p class="move-form__error" role="alert">{error}</p>
    {/if}
  </form>

  {#snippet footer()}
    <button type="button" class="button" onclick={onclose}>{t.common.cancel}</button>
    <button type="submit" class="button button--primary" form={formId} disabled={moving || !folderId}>
      {t.selection.moveSubmit}
    </button>
  {/snippet}
</Modal>

<style>
  .move-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .move-form__label {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .move-form__error {
    margin: 0;
    color: var(--danger);
    font-size: 0.8125rem;
  }
</style>
