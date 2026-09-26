<script lang="ts">
  import {bookmarks, enabledVirtualFolders} from '../../../lib/bookmarks.svelte';
  import {ROOT_FOLDER_ID} from '../../../lib/constants';
  import {type FolderOption, getFolderOptions} from '../../../lib/folders';
  import {t} from '../../../lib/i18n/index.svelte';

  let options = $state.raw<FolderOption[]>([]);

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
</script>

<select
  class="folder-select input"
  aria-label={t.header.folder}
  value={bookmarks.folderId}
  onchange={(event) => bookmarks.navigate(event.currentTarget.value)}
>
  <option value={ROOT_FOLDER_ID}>{t.common.home}</option>
  {#each options as option (option.id)}
    <option value={option.id}>{' '.repeat(option.depth)}{option.title} ({option.bookmarkCount})</option>
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
