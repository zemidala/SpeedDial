<script lang="ts">
  import {onMount} from 'svelte';
  import {type FolderOption, getFolderOptions} from '../../../lib/folders';
  import {SEARCH_ENGINE_NAMES} from '../../../lib/search';
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
  import {SORT_ORDER_NAMES, TYPE_ORDER_NAMES} from '../../../lib/sorting';
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
  label="Папка по умолчанию"
  hint="Открывается в новой вкладке. Не синхронизируется"
  value={current.defaultFolderId}
  options={folderOptions}
  onchange={(value) => settings.update({defaultFolderId: value})}
/>
<SwitchRow key="rememberLastFolder" label="Открывать последнюю открытую папку"/>
<SelectRow
  label="Поисковая система"
  value={current.searchEngine}
  options={SEARCH_ENGINES.map((engine) => ({value: engine, label: SEARCH_ENGINE_NAMES[engine]}))}
  onchange={(value) => settings.update({searchEngine: value as SearchEngine})}
/>
{#if current.searchEngine === 'custom'}
  <SettingRow label="Адрес поиска" hint="%s заменяется поисковым запросом">
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
  label="Панель быстрого доступа к сервисам"
  hint="Меню ссылок на часто используемые сервисы"
/>
{#if current.showServices}
  <SettingRow label="Сервисы" hint="По одному на строку: «Название | адрес»" stacked>
    {#snippet children(id)}
      <textarea {id} class="textarea" rows="6" bind:value={servicesText} onchange={saveServices}></textarea>
    {/snippet}
  </SettingRow>
{/if}
<SwitchRow
  key="folderPreview"
  label="Миниатюры сайтов на папке"
  hint="Иконки первых закладок папки вместо значка папки"
/>

<SwitchRow
  key="showThumbnailRefresh"
  label="Кнопка обновления миниатюр"
  hint="Делает снимки страниц всех закладок открытой папки. Понадобится доступ к сайтам"
/>
<SwitchRow key="captureOnCreate" label="Снимок страницы при создании закладки"/>
<RangeRow
  key="captureDelay"
  label="Задержка перед снимком"
  hint="Пригодится, если страница долго загружается. Чем больше задержка, тем дольше ожидание"
  unit=" с"
/>
<SwitchRow
  key="refreshIncludesSubfolders"
  label="Включая подпапки"
  hint="Кнопка обновления миниатюр обходит и вложенные папки"
/>

<SwitchRow key="openInNewTab" label="Открывать закладки и поиск в новой вкладке"/>
<SwitchRow key="newBookmarksFirst" label="Добавлять новые закладки в начало папки"/>
<SwitchRow key="dragAndDrop" label="Включить перетаскивание"/>
<div class="settings-group">
  <SelectRow
    label="Сортировать"
    hint="Пока выбрана сортировка, перетаскивание не работает"
    value={current.sortOrder}
    options={SORT_ORDERS.map((order) => ({value: order, label: SORT_ORDER_NAMES[order]}))}
    onchange={(value) => settings.update({sortOrder: value as SortOrder})}
  />
  <SelectRow
    label="Папки и закладки"
    hint="Пока выбрана сортировка, перетаскивание не работает"
    value={current.typeOrder}
    options={TYPE_ORDERS.map((order) => ({value: order, label: TYPE_ORDER_NAMES[order]}))}
    onchange={(value) => settings.update({typeOrder: value as TypeOrder})}
  />
</div>

<SwitchRow
  key="browserContextMenu"
  label="Показывать в контекстном меню браузера"
  hint="Пункт «Добавить в SpeedDial» на страницах и ссылках"
/>
<SwitchRow
  key="closeTabAfterAdd"
  label="Закрывать вкладку после добавления"
  hint="Только при добавлении страницы через контекстное меню браузера"
  disabled={!current.browserContextMenu}
/>
<SwitchRow
  key="syncEnabled"
  label="Включить синхронизацию"
  hint="Настройки хранятся в аккаунте браузера и одинаковы на всех устройствах"
/>

<style>
  .settings-group {
    margin: 8px 0;
    padding: 0 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
</style>
