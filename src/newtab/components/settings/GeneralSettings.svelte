<script lang="ts">
  import {onMount} from 'svelte';
  import {type FolderOption, getFolderOptions} from '../../../lib/folders';
  import {t} from '../../../lib/i18n/index.svelte';
  import {searchEngineName} from '../../../lib/search';
  import {formatServices, parseServices} from '../../../lib/services';
  import {
    SEARCH_ENGINES,
    type SearchEngine,
    SORT_ORDERS,
    type SortOrder,
    TYPE_ORDERS,
    type TypeOrder,
  } from '../../../lib/settings/schema';
  import {settings} from '../../../lib/settings/store.svelte';
  import RangeRow from './RangeRow.svelte';
  import SelectRow from './SelectRow.svelte';
  import SettingRow from './SettingRow.svelte';
  import SwitchRow from './SwitchRow.svelte';

  const current = $derived(settings.current);

  let folders = $state.raw<FolderOption[]>([]);
  onMount(() => {
    getFolderOptions().then((result) => (folders = result)).catch(() => undefined);
  });
  const folderOptions = $derived(folders.map((folder) => ({
    value: folder.id,
    label: `${' '.repeat(folder.depth)}${folder.title} (${folder.bookmarkCount})`,
  })));

  // Сервисы редактируются как текст и сохраняются, когда поле теряет фокус
  let servicesText = $state(formatServices(settings.current.services));

  function saveServices() {
    const services = parseServices(servicesText);
    settings.update({services});
    servicesText = formatServices(services);
  }
</script>

<SelectRow
  label={t.general.defaultFolder}
  hint={t.general.defaultFolderHint}
  value={current.defaultFolderId}
  options={folderOptions}
  onchange={(value) => settings.update({defaultFolderId: value})}
/>
<SwitchRow key="rememberLastFolder" label={t.general.rememberLastFolder}/>
<SelectRow
  label={t.general.searchEngine}
  value={current.searchEngine}
  options={SEARCH_ENGINES.map((engine) => ({value: engine, label: searchEngineName(engine)}))}
  onchange={(value) => settings.update({searchEngine: value as SearchEngine})}
/>
{#if current.searchEngine === 'custom'}
  <SettingRow label={t.general.customSearchUrl} hint={t.general.customSearchUrlHint}>
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
  key="showServices"
  label={t.general.showServices}
  hint={t.general.showServicesHint}
/>
{#if current.showServices}
  <SettingRow label={t.general.services} hint={t.general.servicesHint} stacked>
    {#snippet children(id)}
      <textarea {id} class="textarea" rows="6" bind:value={servicesText} onchange={saveServices}></textarea>
    {/snippet}
  </SettingRow>
{/if}
<SwitchRow
  key="folderPreview"
  label={t.general.folderPreview}
  hint={t.general.folderPreviewHint}
/>

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

<SwitchRow key="openInNewTab" label={t.general.openInNewTab}/>
<SwitchRow key="newBookmarksFirst" label={t.general.newBookmarksFirst}/>
<SwitchRow key="dragAndDrop" label={t.general.dragAndDrop}/>
<div class="settings-group">
  <SelectRow
    label={t.general.sortOrder}
    hint={t.general.sortHint}
    value={current.sortOrder}
    options={SORT_ORDERS.map((order) => ({value: order, label: t.sort.orders[order]}))}
    onchange={(value) => settings.update({sortOrder: value as SortOrder})}
  />
  <SelectRow
    label={t.general.typeOrder}
    hint={t.general.sortHint}
    value={current.typeOrder}
    options={TYPE_ORDERS.map((order) => ({value: order, label: t.sort.typeOrders[order]}))}
    onchange={(value) => settings.update({typeOrder: value as TypeOrder})}
  />
</div>

<SwitchRow
  key="browserContextMenu"
  label={t.general.browserContextMenu}
  hint={t.general.browserContextMenuHint}
/>
<SwitchRow
  key="closeTabAfterAdd"
  label={t.general.closeTabAfterAdd}
  hint={t.general.closeTabAfterAddHint}
  disabled={!current.browserContextMenu}
/>
<SwitchRow
  key="syncEnabled"
  label={t.general.syncEnabled}
  hint={t.general.syncEnabledHint}
/>

<style>
  .settings-group {
    margin: 8px 0;
    padding: 0 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
</style>
