<script lang="ts">
  import {bookmarks} from '../../../lib/bookmarks.svelte';
  import {t} from '../../../lib/i18n/index.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {openSettings} from '../../../lib/ui.svelte';
  import Icon from '../ui/Icon.svelte';
  import Breadcrumbs from './Breadcrumbs.svelte';
  import FolderSelect from './FolderSelect.svelte';
  import SearchBar from './SearchBar.svelte';
  import ServicesMenu from './ServicesMenu.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import ThumbnailRefreshButton from './ThumbnailRefreshButton.svelte';
</script>

<header class="app-header">
  <Breadcrumbs/>
  <div class="app-header__buttons">
    {#if settings.current.showServices}
      <ServicesMenu/>
    {/if}
    <!-- Virtual folders (most visited, recently closed) have no bookmarks to take screenshots of -->
    {#if settings.current.showThumbnailRefresh && !bookmarks.virtual}
      <ThumbnailRefreshButton/>
    {/if}
    <ThemeToggle/>
    {#if settings.current.showSettingsButton}
      <button type="button" class="icon-button" aria-label={t.common.settings} title={t.common.settings} onclick={openSettings}>
        <Icon name="settings"/>
      </button>
    {/if}
  </div>

  {#if settings.current.showToolbar}
    <SearchBar/>
    <FolderSelect/>
  {/if}
</header>

<style>
  /* Two columns: the path and the search stretch; the right column is exactly as wide as the round buttons,
     and the folder list below takes that width — the same in every browser, whatever its font */
  .app-header {
    display: grid;
    /* The right column is at least as wide as all four round buttons: hiding some of them doesn't shrink the folder list */
    grid-template-columns: minmax(0, 1fr) minmax(calc(4 * 40px + 3 * 12px), auto);
    align-items: center;
    gap: 12px;
  }

  .app-header__buttons {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }
</style>
