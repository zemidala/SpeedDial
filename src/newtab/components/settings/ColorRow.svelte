<script lang="ts">
  import {MediaQuery} from 'svelte/reactivity';
  import {t} from '../../../lib/i18n/index.svelte';
  import {type ColorSettingKey, DEFAULT_SETTINGS} from '../../../lib/settings/schema';
  import {settings} from '../../../lib/settings/store.svelte';
  import {isDarkTheme} from '../../../lib/settings/theme';
  import {resolvePreset} from '../../../lib/themes/current';
  import SettingRow from './SettingRow.svelte';

  let {label, hint, key}: {label: string; hint?: string; key: ColorSettingKey} = $props();

  const systemDark = new MediaQuery('(prefers-color-scheme: dark)');
  const value = $derived(settings.current[key]);
  const isDefault = $derived(value === DEFAULT_SETTINGS[key]);

  // Для палитры нужен конкретный цвет, даже когда выбран цвет «по теме» — берём его из темы оформления
  const pickerValue = $derived.by(() => {
    if (value) return value;
    const preset = resolvePreset(settings.current);
    const palette = isDarkTheme(settings.current.theme, systemDark.current) ? preset.dark : preset.light;
    if (key === 'tileColor') return palette.tile;
    if (key === 'folderColor') return palette.folder;
    return DEFAULT_SETTINGS[key] || palette.pageFrom;
  });
</script>

<SettingRow {label} {hint}>
  {#snippet children(id)}
    <input
      {id}
      class="color-row__picker"
      type="color"
      value={pickerValue}
      oninput={(event) => settings.update({[key]: event.currentTarget.value})}
    >
    <span class="color-row__value">{value || t.view.colorByTheme}</span>
    <button
      type="button"
      class="button"
      disabled={isDefault}
      onclick={() => settings.update({[key]: DEFAULT_SETTINGS[key]})}
    >{t.common.reset}</button>
  {/snippet}
</SettingRow>

<style>
  .color-row__picker {
    flex-shrink: 0;
    width: 40px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    background: none;
    cursor: pointer;
  }

  .color-row__value {
    flex: 1;
    color: var(--text-muted);
    font-family: ui-monospace, monospace;
    font-size: 13px;
  }
</style>
