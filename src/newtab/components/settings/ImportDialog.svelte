<script lang="ts">
  import {onMount} from 'svelte';
  import {existingLinks, planImport, runImport} from '../../../lib/bookmarkImport';
  import type {HtmlBookmark} from '../../../lib/bookmarksHtml';
  import {BOOKMARKS_BAR_ID} from '../../../lib/constants';
  import {type FolderOption, flattenFolders} from '../../../lib/folders';
  import {t} from '../../../lib/i18n/index.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import Modal from '../ui/Modal.svelte';

  // Importing a browser's bookmarks file: where to put it and whether to skip bookmarks that already exist
  let {fileName, nodes, onimported, onclose}: {
    fileName: string;
    nodes: HtmlBookmark[];
    onimported: (message: string) => void;
    onclose: () => void;
  } = $props();

  const formId = $props.id();
  let folders = $state.raw<FolderOption[]>([]);
  let existing = $state.raw<Set<string>>(new Set());
  let parentId = $state('');
  let intoNewFolder = $state(true);
  let folderTitle = $state(t.importHtml.defaultFolder);
  let skipDuplicates = $state(true);
  let progress = $state<number | null>(null);
  let error = $state('');

  const plan = $derived(planImport(nodes, skipDuplicates ? existing : null));

  onMount(() => {
    chrome.bookmarks.getTree()
      .then(([root]) => {
        folders = flattenFolders(root);
        existing = existingLinks([root]);
        const preferred = settings.current.defaultFolderId;
        parentId = folders.some((folder) => folder.id === preferred) ? preferred : BOOKMARKS_BAR_ID;
      })
      .catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    progress = 0;
    try {
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
        <option value={folder.id}>{' '.repeat(folder.depth)}{folder.title}</option>
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
      disabled={progress !== null || plan.bookmarks === 0 || !parentId}
    >
      {progress === null ? t.importHtml.submit : t.importHtml.progress(progress, plan.bookmarks)}
    </button>
  {/snippet}
</Modal>

<style>
  .import-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
