<script lang="ts">
  import {bookmarks, enabledVirtualFolders} from '../../../lib/bookmarks.svelte';
  import {ROOT_FOLDER_ID} from '../../../lib/constants';
  import {type FolderOption, getFolderOptions} from '../../../lib/folders';
  import {t} from '../../../lib/i18n/index.svelte';

  let options = $state.raw<FolderOption[] | null>(null);

  // The folder list updates together with the bookmarks
  $effect(() => {
    void bookmarks.items;
    let cancelled = false;
    getFolderOptions()
      .then((result) => {
        if (!cancelled) options = result;
      })
      .catch((error) => console.error('Failed to load folders', error));
    return () => {
      cancelled = true;
    };
  });

  // The open place isn't in the list (it's gone, or the browser has no folders) — the list asks for a choice
  const known = $derived(
    bookmarks.folderId === ROOT_FOLDER_ID
      || options?.some((option) => option.id === bookmarks.folderId)
      || enabledVirtualFolders().some((folder) => folder.id === bookmarks.folderId),
  );
  const emptyHome = $derived(bookmarks.folderId === ROOT_FOLDER_ID && !bookmarks.items.some((item) => !item.url));
  const missing = $derived(options !== null && bookmarks.loaded && (!known || emptyHome));
</script>

<select
  class="folder-select input"
  aria-label={t.header.folder}
  aria-invalid={missing || undefined}
  title={missing ? t.common.chooseFolder : undefined}
  value={missing ? '' : bookmarks.folderId}
  onchange={(event) => bookmarks.navigate(event.currentTarget.value)}
>
  {#if missing}
    <option value="" disabled>{t.common.chooseFolder}</option>
  {/if}
  <option value={ROOT_FOLDER_ID}>{t.common.home}</option>
  {#each options ?? [] as option (option.id)}
    <option value={option.id}>{' '.repeat(option.depth)}{option.title} ({option.bookmarkCount})</option>
  {/each}
  {#each enabledVirtualFolders() as folder (folder.id)}
    <option value={folder.id}>{folder.title}</option>
  {/each}
</select>

<style>
  .folder-select {
    width: auto;
    max-width: 40%;
    padding-block: 10px;
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
</style>
