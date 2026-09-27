<script lang="ts">
  import {onMount} from 'svelte';
  import {addFromBrowser, loadRecentFolders} from '../lib/addToFolder';
  import {existingFolder, type FolderOption, getFolderOptions} from '../lib/folders';
  import {currentLanguage, t} from '../lib/i18n/index.svelte';
  import {sendMessage} from '../lib/messages';
  import {loadSettings} from '../lib/settings/storage';
  import {displayHost} from '../lib/url';

  // Any folder for a page or link from the browser's context menu; the name can be adjusted.
  // The folder offered first: the last one used from the menu, else the default folder
  let {url, title, isLink, tabId}: {url: string; title: string; isLink: boolean; tabId?: number} = $props();

  const formId = $props.id();
  // The initial name only; the field is edited from here on
  // svelte-ignore state_referenced_locally
  let name = $state(title);
  let folders = $state.raw<FolderOption[]>([]);
  let folderId = $state('');
  let busy = $state(false);
  let error = $state('');

  onMount(async () => {
    document.documentElement.lang = currentLanguage();
    document.title = t.addToFolder.title;
    const [options, recent, settings] = await Promise.all([getFolderOptions(), loadRecentFolders(), loadSettings()]);
    folders = options;
    const preferred = [...recent, settings.defaultFolderId];
    folderId = preferred.find((id) => options.some((folder) => folder.id === id)) ?? options[0]?.id ?? '';
  });

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!folderId || busy) return;
    busy = true;
    error = '';
    try {
      const folder = await existingFolder(folderId);
      if (!folder) throw new Error(t.addToFolder.folderGone);
      // The screenshot is made by the service worker
      const capture = (id: string, pageUrl: string) => sendMessage({type: 'capture-thumbnails', items: [{id, url: pageUrl}]});
      await addFromBrowser({url, title: name, folderId, tabId, isLink, remember: true}, capture);
      window.close();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      busy = false;
    }
  }
</script>

<main class="add-folder">
  <h1 class="add-folder__heading">{isLink ? t.addToFolder.linkHeading : t.addToFolder.pageHeading}</h1>
  <p class="add-folder__url" title={url}>{displayHost(url)}</p>

  <form class="add-folder__form" {onsubmit}>
    <label class="add-folder__label" for="{formId}-name">{t.bookmark.title}</label>
    <input
      id="{formId}-name"
      class="input"
      type="text"
      placeholder={displayHost(url)}
      bind:value={name}
    >

    <label class="add-folder__label" for="{formId}-folder">{t.header.folder}</label>
    <!-- Folders of the whole tree; nesting shown by indentation (non-breaking spaces: a list drops plain ones) -->
    <select id="{formId}-folder" class="input" size="10" bind:value={folderId}>
      {#each folders as folder (folder.id)}
        <option value={folder.id}>{'\u00a0\u00a0\u00a0'.repeat(folder.depth)}{folder.title || t.addToFolder.untitled}</option>
      {/each}
    </select>

    {#if error}
      <p class="add-folder__error" role="alert">{error}</p>
    {/if}

    <div class="add-folder__actions">
      <button type="button" class="button" onclick={() => window.close()}>{t.common.cancel}</button>
      <button type="submit" class="button button--primary" disabled={busy || !folderId}>{t.addToFolder.add}</button>
    </div>
  </form>
</main>

<style>
  .add-folder {
    display: flex;
    flex-direction: column;
    gap: 6px;
    /* The page's own padding (base.css) frames the window; this fills the rest */
    height: 100%;
  }

  .add-folder__heading {
    margin: 0;
    font-size: 1.125rem;
  }

  .add-folder__url {
    margin: 0;
    overflow: hidden;
    color: var(--text-muted);
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .add-folder__form {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    margin-top: 8px;
  }

  .add-folder__label {
    font-weight: 600;
  }

  .add-folder__label:not(:first-child) {
    margin-top: 6px;
  }

  .add-folder__form select {
    flex: 1;
    min-height: 0;
  }

  .add-folder__error {
    margin: 0;
    color: var(--danger);
  }

  .add-folder__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
</style>
