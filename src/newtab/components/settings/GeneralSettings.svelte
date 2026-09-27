<script lang="ts">
  import {onMount} from 'svelte';
  import {bookmarks, enabledVirtualFolders} from '../../../lib/bookmarks.svelte';
  import {BOOKMARKS_BAR_ID, ROOT_FOLDER_ID} from '../../../lib/constants';
  import {type FolderOption, getFolderOptions} from '../../../lib/folders';
  import {t} from '../../../lib/i18n/index.svelte';
  import {permissions} from '../../../lib/permissions.svelte';
  import {searchEngineName} from '../../../lib/search';
  import {formatServices, parseServices} from '../../../lib/services';
  import {SITE_ACCESS, SUGGEST_ACCESS} from '../../../lib/permissionSets';
  import {searchHistory} from '../../../lib/searchHistory.svelte';
  import {
    AUTO_CAPTURES,
    type AutoCapture,
    FOLDER_PREVIEW_GRIDS,
    type FolderPreviewGrid,
    SEARCH_ENGINES,
    type SearchEngine,
    SORT_ORDERS,
    SUBFOLDER_STYLES,
    type SubfolderStyle,
    type SortOrder,
    TYPE_ORDERS,
    type TypeOrder,
  } from '../../../lib/settings/schema';
  import {settings} from '../../../lib/settings/store.svelte';
  import {openDuplicates, openLinkCheck} from '../../../lib/ui.svelte';
  import {
    MOST_VISITED_ID,
    RECENTLY_CLOSED_ID,
    VIRTUAL_FOLDER_PERMISSIONS,
    type VirtualFolderId,
  } from '../../../lib/virtualFolders';
  import IconChoiceRow from './IconChoiceRow.svelte';
  import RangeRow from './RangeRow.svelte';
  import SelectRow from './SelectRow.svelte';
  import SettingRow from './SettingRow.svelte';
  import SettingsGroup from './SettingsGroup.svelte';
  import SwitchRow from './SwitchRow.svelte';

  const current = $derived(settings.current);

  let folders = $state.raw<FolderOption[]>([]);
  onMount(() => {
    getFolderOptions().then((result) => (folders = result)).catch(() => undefined);
  });
  const folderOptions = $derived([
    {value: ROOT_FOLDER_ID, label: t.common.home},
    ...folders.map((folder) => ({
      value: folder.id,
      label: `${'\u00a0\u00a0\u00a0'.repeat(folder.depth)}${folder.title} (${folder.bookmarkCount})`,
    })),
    ...enabledVirtualFolders().map((folder) => ({value: folder.id, label: folder.title})),
  ]);

  // The default setting means "the bookmarks bar" whatever its id is here (Home if there's none); choosing the bar keeps
  // that meaning
  const startFolderValue = $derived(current.defaultFolderId === BOOKMARKS_BAR_ID
    ? bookmarks.barId ?? ROOT_FOLDER_ID
    : current.defaultFolderId);

  /** Turning a virtual folder on asks for its permission first, while the click still counts as a gesture */
  async function toggleVirtualFolder(id: VirtualFolderId, enabled: boolean) {
    const key = id === MOST_VISITED_ID ? 'showMostVisited' : 'showRecentlyClosed';
    if (enabled && !(await permissions.request(VIRTUAL_FOLDER_PERMISSIONS[id]))) return;
    if (!enabled) await permissions.remove(VIRTUAL_FOLDER_PERMISSIONS[id]);
    settings.update({[key]: enabled});
  }

  /** Screenshots need access to sites — asked right in the change handler, while it still counts as a gesture */
  async function changeAutoCapture(mode: AutoCapture) {
    if (mode !== 'off' && !permissions.siteAccess && !(await permissions.request(SITE_ACCESS))) return;
    settings.update({autoCapture: mode});
  }

  /** Suggestions send the query to the search engine: its permission is asked first, while the click still counts */
  async function toggleSuggestions(enabled: boolean) {
    if (enabled && !permissions.suggest && !(await permissions.request(SUGGEST_ACCESS))) return;
    settings.update({searchSuggestions: enabled});
  }

  /** Turned off — what was remembered goes too */
  function toggleSearchHistory(enabled: boolean) {
    if (!enabled) searchHistory.clear();
    settings.update({searchHistory: enabled});
  }

  // Services are edited as text and saved when the field loses focus
  let servicesText = $state(formatServices(settings.current.services));

  function saveServices() {
    const services = parseServices(servicesText);
    settings.update({services});
    servicesText = formatServices(services);
  }
</script>

<SettingsGroup title={t.settings.groups.folders}>
  <SelectRow
    label={t.general.defaultFolder}
    hint={t.general.defaultFolderHint}
    value={startFolderValue}
    setting="defaultFolderId"
    options={folderOptions}
    placeholder={t.common.chooseFolder}
    onchange={(value) => settings.update({defaultFolderId: value === bookmarks.barId ? BOOKMARKS_BAR_ID : value})}
  />
  <SwitchRow key="rememberLastFolder" label={t.general.rememberLastFolder}/>
  <SwitchRow key="folderPreview" label={t.general.folderPreview} hint={t.general.folderPreviewHint}/>
  {#if current.folderPreview}
    <IconChoiceRow
      label={t.general.folderPreviewGrid}
      hint={t.general.folderPreviewGridHint}
      value={current.folderPreviewGrid}
      setting="folderPreviewGrid"
      options={FOLDER_PREVIEW_GRIDS.map((grid) => ({value: grid, label: grid.replace('x', ' × '), icon: `grid${grid}` as const}))}
      onchange={(value) => settings.update({folderPreviewGrid: value as FolderPreviewGrid})}
    />
    <SelectRow
      label={t.general.subfolderStyle}
      hint={t.general.subfolderStyleHint}
      value={current.subfolderStyle}
      setting="subfolderStyle"
      options={SUBFOLDER_STYLES.map((style) => ({value: style, label: t.general.subfolderStyles[style]}))}
      onchange={(value) => settings.update({subfolderStyle: value as SubfolderStyle})}
    />
  {/if}
  <SwitchRow
    label={t.general.showMostVisited}
    hint={t.general.showMostVisitedHint}
    checked={current.showMostVisited && permissions.topSites}
    setting="showMostVisited"
    onchange={(enabled) => toggleVirtualFolder(MOST_VISITED_ID, enabled)}
  />
  <SwitchRow
    label={t.general.showRecentlyClosed}
    hint={t.general.showRecentlyClosedHint}
    checked={current.showRecentlyClosed && permissions.sessions}
    setting="showRecentlyClosed"
    onchange={(enabled) => toggleVirtualFolder(RECENTLY_CLOSED_ID, enabled)}
  />
</SettingsGroup>

<SettingsGroup title={t.settings.groups.search}>
  <SelectRow
    label={t.general.searchEngine}
    value={current.searchEngine}
    setting="searchEngine"
    options={SEARCH_ENGINES.map((engine) => ({value: engine, label: searchEngineName(engine)}))}
    onchange={(value) => settings.update({searchEngine: value as SearchEngine})}
  />
  {#if current.searchEngine === 'custom'}
    <SettingRow label={t.general.customSearchUrl} hint={t.general.customSearchUrlHint} setting="customSearchUrl">
      {#snippet children(id)}
        <input
          {id}
          class="input"
          type="url"
          placeholder="https://example.com/search?q=%s"
          value={current.customSearchUrl}
          oninput={(event) => settings.update({customSearchUrl: event.currentTarget.value})}
        >
      {/snippet}
    </SettingRow>
  {/if}
  <SwitchRow
    label={t.general.searchSuggestions}
    hint={current.searchEngine === 'custom'
      ? t.general.searchSuggestionsCustom
      : t.general.searchSuggestionsHint(searchEngineName(current.searchEngine))}
    checked={current.searchSuggestions && permissions.suggest && current.searchEngine !== 'custom'}
    disabled={current.searchEngine === 'custom'}
    setting="searchSuggestions"
    onchange={toggleSuggestions}
  />
  <SwitchRow
    label={t.general.searchHistory}
    hint={t.general.searchHistoryHint}
    checked={current.searchHistory}
    setting="searchHistory"
    onchange={toggleSearchHistory}
  />
  {#if current.searchHistory && searchHistory.entries.length > 0}
    <SettingRow label={t.general.searchHistoryCount(searchHistory.entries.length)}>
      <button type="button" class="button" onclick={() => searchHistory.clear()}>{t.general.clearSearchHistory}</button>
    </SettingRow>
  {/if}
  <SwitchRow key="showServices" label={t.general.showServices} hint={t.general.showServicesHint}/>
  {#if current.showServices}
    <SettingRow label={t.general.services} hint={t.general.servicesHint} stacked setting="services">
      {#snippet children(id)}
        <textarea {id} class="textarea" rows="6" bind:value={servicesText} onchange={saveServices}></textarea>
      {/snippet}
    </SettingRow>
  {/if}
</SettingsGroup>

<SettingsGroup title={t.settings.groups.bookmarks}>
  <SwitchRow key="openInNewTab" label={t.general.openInNewTab}/>
  <SwitchRow key="newBookmarksFirst" label={t.general.newBookmarksFirst}/>
  <SwitchRow
    label={t.advanced.confirmDelete}
    hint={t.advanced.confirmDeleteHint}
    checked={current.confirmDelete}
    setting="confirmDelete"
    onchange={(confirmDelete) => settings.update({confirmDelete})}
  />
  <SwitchRow key="dragAndDrop" label={t.general.dragAndDrop}/>
  <SettingRow label={t.duplicates.settingsRow} hint={t.duplicates.settingsHint}>
    <button type="button" class="button" onclick={openDuplicates}>{t.duplicates.find}</button>
  </SettingRow>
  <SettingRow label={t.linkCheck.settingsRow} hint={t.linkCheck.settingsHint}>
    <button type="button" class="button" onclick={() => openLinkCheck()}>{t.linkCheck.menuAll}</button>
  </SettingRow>
  <SelectRow
    label={t.general.sortOrder}
    hint={t.general.sortHint}
    value={current.sortOrder}
    setting="sortOrder"
    options={SORT_ORDERS.map((order) => ({value: order, label: t.sort.orders[order]}))}
    onchange={(value) => settings.update({sortOrder: value as SortOrder})}
  />
  <SelectRow
    label={t.general.typeOrder}
    hint={t.general.sortHint}
    value={current.typeOrder}
    setting="typeOrder"
    options={TYPE_ORDERS.map((order) => ({value: order, label: t.sort.typeOrders[order]}))}
    onchange={(value) => settings.update({typeOrder: value as TypeOrder})}
  />
</SettingsGroup>

<SettingsGroup title={t.settings.groups.thumbnails}>
  <SelectRow
    label={t.general.autoCapture}
    hint={t.general.autoCaptureHint}
    value={current.autoCapture}
    setting="autoCapture"
    options={AUTO_CAPTURES.map((mode) => ({value: mode, label: t.general.autoCaptureModes[mode]}))}
    onchange={(value) => changeAutoCapture(value as AutoCapture)}
  />
  {#if current.autoCapture !== 'off' && !permissions.siteAccess}
    <SettingRow label={t.general.autoCaptureAccess} hint={t.general.autoCaptureAccessHint}>
      <button type="button" class="button" onclick={() => permissions.request(SITE_ACCESS)}>{t.common.allow}</button>
    </SettingRow>
  {/if}
  <SwitchRow
    key="showThumbnailRefresh"
    label={t.general.showThumbnailRefresh}
    hint={t.general.showThumbnailRefreshHint}
  />
  <SwitchRow key="captureOnCreate" label={t.general.captureOnCreate}/>
  <RangeRow
    key="captureDelay"
    label={t.general.captureDelay}
    hint={t.general.captureDelayHint}
    unit={t.general.seconds}
  />
  <SwitchRow
    key="refreshIncludesSubfolders"
    label={t.general.refreshIncludesSubfolders}
    hint={t.general.refreshIncludesSubfoldersHint}
  />
</SettingsGroup>

<SettingsGroup title={t.settings.groups.browserMenu}>
  <SwitchRow key="browserContextMenu" label={t.general.browserContextMenu} hint={t.general.browserContextMenuHint}/>
  <SwitchRow
    key="closeTabAfterAdd"
    label={t.general.closeTabAfterAdd}
    hint={t.general.closeTabAfterAddHint}
    disabled={!current.browserContextMenu}
  />
</SettingsGroup>

<SettingsGroup title={t.settings.groups.sync}>
  <SwitchRow key="syncEnabled" label={t.general.syncEnabled} hint={t.general.syncEnabledHint}/>
</SettingsGroup>
