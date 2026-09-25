<script lang="ts">
  import {background} from '../../../lib/background.svelte';
  import {pickFile} from '../../../lib/files';
  import {icons} from '../../../lib/icons.svelte';
  import {LOGO_SERVICES} from '../../../lib/logoServices';
  import {BING_ACCESS, SITE_ACCESS} from '../../../lib/permissionSets';
  import {permissions} from '../../../lib/permissions.svelte';
  import {
    type Background,
    type IconStyle,
    type LogoService,
    RANGES,
    type Theme,
    type TitlePosition,
  } from '../../../lib/settings/schema';
  import {settings} from '../../../lib/settings/store.svelte';
  import ColorRow from './ColorRow.svelte';
  import RangeRow from './RangeRow.svelte';
  import SelectRow from './SelectRow.svelte';
  import SettingRow from './SettingRow.svelte';
  import SwitchRow from './SwitchRow.svelte';

  const current = $derived(settings.current);

  const logoServiceHint = $derived.by(() => {
    const base = 'Запасной источник, если на самом сайте крупной иконки нет. Сервис узнает адреса ваших закладок';
    const service = current.logoService;
    return service === 'none' || service === 'custom' ? base : `${base}.\n${LOGO_SERVICES[service].hint}`;
  });

  const columnOptions = Array.from({length: RANGES.columns.max}, (_, i) => ({value: String(i + 1), label: String(i + 1)}));

  async function toggleSiteIcons(enabled: boolean) {
    if (enabled) {
      // Запрос разрешения — первым делом, пока действует клик пользователя
      if (permissions.siteAccess || await permissions.request(SITE_ACCESS)) settings.update({siteIcons: true});
    } else {
      settings.update({siteIcons: false});
      await icons.clearSiteIcons();
    }
  }

  async function changeBackground(value: Background) {
    // Для картинки дня нужен доступ к Bing — запрашиваем первым делом, пока действует выбор пользователя
    if (value === 'bing' && !permissions.bing && !(await permissions.request(BING_ACCESS))) return;
    settings.update({background: value});
  }

  async function chooseBackgroundImage() {
    const file = await pickFile('image/*');
    if (file) await background.setImage(file);
  }
</script>

<SelectRow
  label="Количество колонок"
  value={current.columns}
  options={columnOptions}
  onchange={(value) => settings.update({columns: Number(value)})}
/>
<RangeRow key="containerWidth" label="Ширина панели" unit="%"/>
<SelectRow
  label="Цветовая тема"
  value={current.theme}
  options={[
    {value: 'auto', label: 'Как в системе'},
    {value: 'light', label: 'Светлая'},
    {value: 'dark', label: 'Тёмная'},
  ]}
  onchange={(value) => settings.update({theme: value as Theme})}
/>
<SwitchRow key="verticalCenter" label="Вертикальное центрирование"/>

<SelectRow
  label="Вид иконок"
  hint="«На весь блок» — иконка крупно, а область вокруг заливается цветом её краёв"
  value={current.iconStyle}
  options={[
    {value: 'plate', label: 'На подложке'},
    {value: 'fill', label: 'На весь блок'},
  ]}
  onchange={(value) => settings.update({iconStyle: value as IconStyle})}
/>
<RangeRow
  key="iconScale"
  label="Размер иконки"
  hint="Иконки не растягиваются больше своего качества — для крупных нужны иконки высокого качества"
  unit="%"
/>
<SwitchRow key="iconTint" label="Подкрашивать плитку цветом иконки"/>
<SwitchRow
  label="Иконки высокого качества"
  hint="Расширение само находит на сайтах закладок SVG, иконки приложений и крупные версии favicon. Понадобится доступ к сайтам"
  checked={icons.siteIconsEnabled}
  onchange={(enabled) => toggleSiteIcons(enabled)}
/>
<SelectRow
  label="Сервис иконок"
  hint={logoServiceHint}
  value={current.logoService}
  options={[
    {value: 'none', label: 'Не использовать'},
    ...Object.entries(LOGO_SERVICES).map(([value, service]) => ({value, label: service.name})),
    {value: 'custom', label: 'Свой адрес'},
  ]}
  onchange={(value) => settings.update({logoService: value as LogoService})}
/>
{#if current.logoService === 'logodev'}
  <SettingRow label="Ключ logo.dev" hint="Публичный ключ (pk_…) из личного кабинета logo.dev">
    {#snippet children(id)}
      <input
        {id}
        class="input"
        type="text"
        spellcheck="false"
        placeholder="pk_…"
        value={current.logoDevToken}
        oninput={(event) => settings.update({logoDevToken: event.currentTarget.value})}
      >
    {/snippet}
  </SettingRow>
{:else if current.logoService === 'custom'}
  <SettingRow label="Адрес иконки" hint={'Подстрока {{website}} заменяется доменом сайта.\nПример: https://example.com/icons/{{website}}.png'}>
    {#snippet children(id)}
      <input
        {id}
        class="input"
        type="url"
        value={current.externalLogoUrl}
        oninput={(event) => settings.update({externalLogoUrl: event.currentTarget.value})}
      >
    {/snippet}
  </SettingRow>
{/if}

<SwitchRow key="showToolbar" label="Показывать панель поиска и выбора папки"/>
<SwitchRow key="autofocusSearch" label="Фокус на строке поиска" disabled={!current.showToolbar}/>
<SwitchRow
  key="showSettingsButton"
  label="Показывать кнопку настроек"
  hint="Настройки всегда можно открыть из контекстного меню страницы"
/>
<SwitchRow key="showBackTile" label="Показывать плитку «Назад» в папках"/>
<SwitchRow key="showAddTile" label="Показывать плитку добавления закладки"/>
<SwitchRow key="showTitles" label="Показывать названия закладок"/>
<SelectRow
  label="Положение названий"
  value={current.titlePosition}
  options={[
    {value: 'bottom-inside', label: 'Снизу, внутри плитки'},
    {value: 'top-inside', label: 'Сверху, внутри плитки'},
    {value: 'bottom-outside', label: 'Под плиткой'},
    {value: 'top-outside', label: 'Над плиткой'},
  ]}
  onchange={(value) => settings.update({titlePosition: value as TitlePosition})}
/>
<SwitchRow key="showTitleIcons" label="Показывать иконки сайтов рядом с названием" disabled={!current.showTitles}/>

<ColorRow key="tileColor" label="Цвет плитки"/>
<ColorRow key="folderColor" label="Цвет папки"/>
<SettingRow label="Шрифт">
  {#snippet children(id)}
    <input
      {id}
      class="input"
      type="text"
      placeholder="Segoe UI, system-ui, sans-serif"
      value={current.fontFamily}
      oninput={(event) => settings.update({fontFamily: event.currentTarget.value})}
    >
  {/snippet}
</SettingRow>

<SelectRow
  label="Фон"
  value={current.background}
  options={[
    {value: 'none', label: 'Без фона'},
    {value: 'color', label: 'Цвет'},
    {value: 'image', label: 'Изображение'},
    {value: 'bing', label: 'Картинка дня Bing'},
  ]}
  onchange={(value) => changeBackground(value as Background)}
/>
{#if current.background === 'color'}
  <ColorRow key="backgroundColor" label="Цвет фона"/>
{:else if current.background === 'image'}
  <SettingRow label="Фоновое изображение" hint="Хранится только на этом устройстве">
    <button type="button" class="button" onclick={chooseBackgroundImage}>Выбрать файл…</button>
    {#if background.imageUrl}
      <button type="button" class="button" onclick={() => background.clear()}>Убрать</button>
    {/if}
  </SettingRow>
{:else if current.background === 'bing' && !permissions.bing}
  <!-- Настройки синхронизируются, а разрешения — нет: на этом устройстве доступ к Bing ещё не выдан -->
  <SettingRow label="Доступ к Bing" hint="Нужен, чтобы загружать картинку дня на этом устройстве">
    <button type="button" class="button" onclick={() => permissions.request(BING_ACCESS)}>Разрешить</button>
  </SettingRow>
{/if}
