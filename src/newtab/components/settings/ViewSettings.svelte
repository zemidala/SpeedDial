<script lang="ts">
  import {background} from '../../../lib/background.svelte';
  import {pickFile} from '../../../lib/files';
  import {LANGUAGE_NAMES, LANGUAGES, t} from '../../../lib/i18n/index.svelte';
  import {icons} from '../../../lib/icons.svelte';
  import {LOGO_SERVICES} from '../../../lib/logoServices';
  import {showNotice} from '../../../lib/notice.svelte';
  import {BING_ACCESS, SITE_ACCESS} from '../../../lib/permissionSets';
  import {permissions} from '../../../lib/permissions.svelte';
  import {
    type Background,
    type Contrast,
    FONT_SIZES,
    type FontSize,
    type IconStyle,
    type LanguageSetting,
    type LogoService,
    RANGES,
    type Theme,
    TITLE_ALIGNS,
    TITLE_SIZES,
    type TitleAlign,
    type TitlePosition,
    type TitleSize,
  } from '../../../lib/settings/schema';
  import {settings} from '../../../lib/settings/store.svelte';
  import {isWebUrl, normalizeUrl} from '../../../lib/url';
  import ColorRow from './ColorRow.svelte';
  import FontRow from './FontRow.svelte';
  import IconChoiceRow from './IconChoiceRow.svelte';
  import RangeRow from './RangeRow.svelte';
  import SelectRow from './SelectRow.svelte';
  import SettingRow from './SettingRow.svelte';
  import SettingsGroup from './SettingsGroup.svelte';
  import SwitchRow from './SwitchRow.svelte';
  import ToolChoice from './ToolChoice.svelte';
  import ToolToggle from './ToolToggle.svelte';
  import ThemePicker from './ThemePicker.svelte';

  const current = $derived(settings.current);

  const ALIGN_ICONS = {left: 'alignLeft', center: 'alignCenter', right: 'alignRight'} as const;
  /** The "A" on the name size buttons grows with the size */
  const TITLE_SIZE_SAMPLES = {s: '0.8125rem', m: '1rem', l: '1.25rem'} as const;

  const logoServiceHint = $derived.by(() => {
    const base = t.view.logoServiceHint;
    const service = current.logoService;
    return service === 'none' || service === 'custom' ? base : `${base}.\n${t.view.logoServiceHints[service]}`;
  });

  const columnOptions = Array.from({length: RANGES.columns.max}, (_, i) => ({value: String(i + 1), label: String(i + 1)}));

  async function toggleSiteIcons(enabled: boolean) {
    if (enabled) {
      // Request the permission first, while the user's click still counts as a gesture
      if (permissions.siteAccess || await permissions.request(SITE_ACCESS)) settings.update({siteIcons: true});
    } else {
      settings.update({siteIcons: false});
      await icons.clearSiteIcons();
    }
  }

  async function reloadSiteIcons() {
    await icons.refetchSiteIcons();
    showNotice(t.view.siteIconsReloading, 'info');
  }

  async function changeBackground(value: Background) {
    // The Bing image of the day needs access to Bing — ask first, while the choice still counts as a gesture
    if (value === 'bing' && !permissions.bing && !(await permissions.request(BING_ACCESS))) return;
    settings.update({background: value});
  }

  // A picture from a link: saved when the field is left; the picture is tried first, so a mistyped address is noticed
  let backgroundUrlText = $state(settings.current.backgroundUrl);
  let backgroundUrlError = $state('');

  async function saveBackgroundUrl() {
    const url = normalizeUrl(backgroundUrlText);
    backgroundUrlError = '';
    if (!url || !isWebUrl(url)) {
      if (backgroundUrlText.trim()) backgroundUrlError = t.view.backgroundUrlFailed;
      return;
    }
    backgroundUrlText = url;
    const loads = await new Promise<boolean>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
    });
    if (!loads) {
      backgroundUrlError = t.view.backgroundUrlFailed;
      return;
    }
    settings.update({backgroundUrl: url});
  }

  async function chooseBackgroundImage() {
    const file = await pickFile('image/*');
    if (file) await background.setImage(file);
  }
</script>

<SettingsGroup title={t.settings.groups.languageTheme}>
  <SelectRow
    label={t.view.language}
    value={current.language}
    setting="language"
    options={[
      {value: 'auto', label: t.view.languageAuto},
      ...LANGUAGES.map((language) => ({value: language, label: LANGUAGE_NAMES[language]})),
    ]}
    onchange={(value) => settings.update({language: value as LanguageSetting})}
  />
  <SelectRow
    label={t.view.theme}
    value={current.theme}
    setting="theme"
    options={[
      {value: 'auto', label: t.view.themeAuto},
      {value: 'light', label: t.view.themeLight},
      {value: 'dark', label: t.view.themeDark},
    ]}
    onchange={(value) => settings.update({theme: value as Theme})}
  />
  <SelectRow
    label={t.view.contrast}
    hint={t.view.contrastHint}
    value={current.contrast}
    setting="contrast"
    options={[
      {value: 'auto', label: t.view.contrastAuto},
      {value: 'normal', label: t.view.contrastNormal},
      {value: 'high', label: t.view.contrastHigh},
    ]}
    onchange={(value) => settings.update({contrast: value as Contrast})}
  />
  <SettingRow label={t.view.preset} hint={t.view.presetHint} stacked setting="themePreset">
    <ThemePicker/>
  </SettingRow>
  <RangeRow key="lightDimming" label={t.view.lightDimming} hint={t.view.lightDimmingHint} unit="%"/>
  {#if current.themePreset === 'custom'}
    <ColorRow key="customAccent" label={t.view.accent} hint={t.view.accentHint}/>
    <ColorRow key="customTint" label={t.view.tint} hint={t.view.tintHint}/>
  {/if}
</SettingsGroup>

<SettingsGroup title={t.settings.groups.tiles}>
  <SelectRow
    label={t.view.columns}
    value={current.columns}
    setting="columns"
    options={columnOptions}
    onchange={(value) => settings.update({columns: Number(value)})}
  />
  <RangeRow key="containerWidth" label={t.view.containerWidth} unit="%"/>
  <SwitchRow key="verticalCenter" label={t.view.verticalCenter}/>
  <ColorRow key="tileColor" label={t.view.tileColor}/>
  <ColorRow key="folderColor" label={t.view.folderColor}/>
</SettingsGroup>

<SettingsGroup title={t.settings.groups.names}>
  <SwitchRow key="showTitles" label={t.view.showTitles}/>
  <IconChoiceRow
    label={t.view.titlePosition}
    value={current.titlePosition}
    setting="titlePosition"
    options={[
      {value: 'top-outside', label: t.view.titleTopOutside, icon: 'titleTopOutside'},
      {value: 'top-inside', label: t.view.titleTopInside, icon: 'titleTopInside'},
      {value: 'bottom-inside', label: t.view.titleBottomInside, icon: 'titleBottomInside'},
      {value: 'bottom-outside', label: t.view.titleBottomOutside, icon: 'titleBottomOutside'},
    ]}
    onchange={(value) => settings.update({titlePosition: value as TitlePosition})}
  />
  <!-- Size, bold and alignment in one row, like the formatting buttons in Word -->
  <SettingRow label={t.view.titleText} setting={['titleSize', 'boldTitles', 'titleAlign']}>
    <div class="toolbar">
      <ToolChoice
        label={t.view.titleSize}
        value={current.titleSize}
        options={TITLE_SIZES.map((size) => ({
          value: size,
          label: t.view.titleSizes[size],
          text: 'A',
          textSize: TITLE_SIZE_SAMPLES[size],
        }))}
        onchange={(value) => settings.update({titleSize: value as TitleSize})}
      />
      <span class="toolbar__separator"></span>
      <ToolToggle key="boldTitles" label={t.view.boldTitles} text={t.view.boldLetter}/>
      <span class="toolbar__separator"></span>
      <ToolChoice
        label={t.view.titleAlign}
        value={current.titleAlign}
        options={TITLE_ALIGNS.map((align) => ({value: align, label: t.view.titleAligns[align], icon: ALIGN_ICONS[align]}))}
        onchange={(value) => settings.update({titleAlign: value as TitleAlign})}
      />
    </div>
  </SettingRow>
  <SwitchRow key="showTitleIcons" label={t.view.showTitleIcons} disabled={!current.showTitles}/>
</SettingsGroup>

<SettingsGroup title={t.settings.groups.font}>
  <SelectRow
    label={t.view.fontSize}
    hint={t.view.fontSizeHint}
    value={current.fontSize}
    setting="fontSize"
    options={FONT_SIZES.map((size) => ({value: size, label: t.view.fontSizes[size]}))}
    onchange={(value) => settings.update({fontSize: value as FontSize})}
  />
  <FontRow/>
</SettingsGroup>

<SettingsGroup title={t.settings.groups.icons}>
  <SelectRow
    label={t.view.iconStyle}
    hint={t.view.iconStyleHint}
    value={current.iconStyle}
    setting="iconStyle"
    options={[
      {value: 'plate', label: t.view.iconPlate},
      {value: 'fill', label: t.view.iconFill},
    ]}
    onchange={(value) => settings.update({iconStyle: value as IconStyle})}
  />
  <RangeRow key="iconScale" label={t.view.iconScale} hint={t.view.iconScaleHint} unit="%"/>
  <SwitchRow key="iconTint" label={t.view.iconTint}/>
  <SwitchRow
    label={t.view.siteIcons}
    hint={t.view.siteIconsHint}
    checked={icons.siteIconsEnabled}
    setting="siteIcons"
    onchange={(enabled) => toggleSiteIcons(enabled)}
  />
  {#if icons.siteIconsEnabled}
    <!-- Every browser keeps its own icon cache; starting over makes them pick icons by the same rules again -->
    <SettingRow label={t.view.reloadSiteIcons} hint={t.view.reloadSiteIconsHint}>
      <button type="button" class="button" onclick={reloadSiteIcons}>{t.view.reloadSiteIconsButton}</button>
    </SettingRow>
  {/if}
  <SelectRow
    label={t.view.logoService}
    hint={logoServiceHint}
    value={current.logoService}
    setting="logoService"
    options={[
      {value: 'none', label: t.view.logoServiceNone},
      ...Object.entries(LOGO_SERVICES).map(([value, service]) => ({value, label: service.name})),
      {value: 'custom', label: t.view.logoServiceCustom},
    ]}
    onchange={(value) => settings.update({logoService: value as LogoService})}
  />
  {#if current.logoService === 'logodev'}
    <SettingRow label={t.view.logoDevToken} hint={t.view.logoDevTokenHint} setting="logoDevToken">
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
    <SettingRow label={t.view.customLogoUrl} hint={t.view.customLogoUrlHint} setting="externalLogoUrl">
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
</SettingsGroup>

<SettingsGroup title={t.settings.groups.pageElements}>
  <SwitchRow key="showToolbar" label={t.view.showToolbar}/>
  <SwitchRow key="autofocusSearch" label={t.view.autofocusSearch} disabled={!current.showToolbar}/>
  <SwitchRow key="showSettingsButton" label={t.view.showSettingsButton} hint={t.view.showSettingsButtonHint}/>
  <SwitchRow key="showBackTile" label={t.view.showBackTile}/>
  <SwitchRow key="showAddTile" label={t.view.showAddTile}/>
</SettingsGroup>

<SettingsGroup title={t.settings.groups.background}>
  <SelectRow
    label={t.view.background}
    value={current.background}
    setting="background"
    options={[
      {value: 'none', label: t.view.backgroundNone},
      {value: 'color', label: t.view.backgroundColor},
      {value: 'image', label: t.view.backgroundImage},
      {value: 'url', label: t.view.backgroundUrl},
      {value: 'bing', label: t.view.backgroundBing},
    ]}
    onchange={(value) => changeBackground(value as Background)}
  />
  {#if current.background === 'color'}
    <ColorRow key="backgroundColor" label={t.view.backgroundColorLabel}/>
  {:else if current.background === 'url'}
    <SettingRow label={t.view.backgroundUrlLabel} hint={backgroundUrlError || t.view.backgroundUrlHint} stacked setting="backgroundUrl">
      {#snippet children(id)}
        <input
          {id}
          class="input"
          type="url"
          placeholder="https://example.com/picture.jpg"
          aria-invalid={backgroundUrlError ? true : undefined}
          bind:value={backgroundUrlText}
          onchange={saveBackgroundUrl}
        >
      {/snippet}
    </SettingRow>
  {:else if current.background === 'image'}
    <SettingRow label={t.view.backgroundImageLabel} hint={t.view.backgroundImageHint}>
      <button type="button" class="button" onclick={chooseBackgroundImage}>{t.view.chooseFile}</button>
      {#if background.imageUrl}
        <button type="button" class="button" onclick={() => background.clear()}>{t.common.remove}</button>
      {/if}
    </SettingRow>
  {:else if current.background === 'bing' && !permissions.bing}
    <!-- Settings sync across devices but permissions don't: Bing access isn't granted on this device yet -->
    <SettingRow label={t.view.bingAccess} hint={t.view.bingAccessHint}>
      <button type="button" class="button" onclick={() => permissions.request(BING_ACCESS)}>{t.common.allow}</button>
    </SettingRow>
  {/if}
  {#if current.background === 'image' || current.background === 'url' || current.background === 'bing'}
    <RangeRow key="backgroundBlur" label={t.view.backgroundBlur} hint={t.view.backgroundBlurHint} unit={t.view.pixels}/>
    <RangeRow key="backgroundDim" label={t.view.backgroundDim} unit="%"/>
  {/if}
</SettingsGroup>
