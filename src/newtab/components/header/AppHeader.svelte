<script lang="ts">
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
    {#if settings.current.showThumbnailRefresh}
      <ThumbnailRefreshButton/>
    {/if}
    <ThemeToggle/>
    {#if settings.current.showSettingsButton}
      <button type="button" class="icon-button" aria-label="Настройки" title="Настройки" onclick={openSettings}>
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
