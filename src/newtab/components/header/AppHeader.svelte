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
  <div class="app-header__row">
    <Breadcrumbs/>
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
    <div class="app-header__row">
      <SearchBar/>
      <FolderSelect/>
    </div>
  {/if}
</header>

<style>
  .app-header {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .app-header__row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
</style>
