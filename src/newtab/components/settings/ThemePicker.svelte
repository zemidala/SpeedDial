<script lang="ts">
  import {MediaQuery} from 'svelte/reactivity';
  import {t} from '../../../lib/i18n/index.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {isDarkTheme} from '../../../lib/settings/theme';
  import {withDimming} from '../../../lib/themes/current';
  import {customPreset, type ThemePalette} from '../../../lib/themes/palette';
  import {THEME_PRESETS} from '../../../lib/themes/presets';

  // Theme gallery: mini previews in each theme's colours for the current mode — light or dark
  const systemDark = new MediaQuery('(prefers-color-scheme: dark)');
  const dark = $derived(isDarkTheme(settings.current.theme, systemDark.current));

  // Previews use the same light theme softening as the page
  const presets = $derived([
    ...THEME_PRESETS,
    customPreset(settings.current.customAccent, settings.current.customTint),
  ].map((preset) => withDimming(preset, settings.current.lightDimming)));

  // Brand names aren't translated, while "Standard" and "Custom colours" are in the interface language
  const presetName = (preset: {id: string; name: string}) => {
    if (preset.id === 'standard') return t.view.themeStandard;
    if (preset.id === 'custom') return t.view.themeCustom;
    return preset.name;
  };

  const paletteOf = (preset: {light: ThemePalette; dark: ThemePalette}) => (dark ? preset.dark : preset.light);
</script>

<div class="theme-picker" role="radiogroup" aria-label={t.view.preset}>
  {#each presets as preset (preset.id)}
    {@const palette = paletteOf(preset)}
    {@const selected = settings.current.themePreset === preset.id}
    <button
      type="button"
      role="radio"
      class="theme-card"
      class:theme-card--selected={selected}
      aria-checked={selected}
      onclick={() => settings.update({themePreset: preset.id})}
    >
      <span
        class="theme-card__preview"
        style:background="linear-gradient(135deg, {palette.pageFrom}, {palette.pageTo})"
        aria-hidden="true"
      >
        <span class="theme-card__bar" style:background={palette.surface}>
          <span class="theme-card__line" style:background={palette.accent}></span>
          <span class="theme-card__line theme-card__line--muted" style:background={palette.textMuted}></span>
        </span>
        <span class="theme-card__tiles">
          <span class="theme-card__tile" style:background={palette.tile} style:border-color={palette.border}>
            <span class="theme-card__plate" style:background={palette.plate}>
              <span class="theme-card__logo" style:background={palette.accent}></span>
            </span>
            <span class="theme-card__caption" style:background={palette.text}></span>
          </span>
          <span class="theme-card__tile" style:background={palette.folder} style:border-color={palette.border}>
            <span class="theme-card__cells">
              {#each {length: 4}, i (i)}
                <span class="theme-card__cell" style:background={palette.cell}></span>
              {/each}
            </span>
            <span class="theme-card__caption" style:background={palette.text}></span>
          </span>
        </span>
      </span>
      <span class="theme-card__name">{presetName(preset)}</span>
    </button>
  {/each}
</div>

<style>
  .theme-picker {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
    width: 100%;
  }

  .theme-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    border: 2px solid transparent;
    border-radius: var(--radius);
    background: none;
    color: var(--text);
    cursor: pointer;
  }

  .theme-card:hover {
    background: var(--surface-hover);
  }

  .theme-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .theme-card--selected {
    border-color: var(--accent);
  }

  .theme-card__preview {
    display: flex;
    flex-direction: column;
    gap: 6px;
    aspect-ratio: 16 / 10;
    padding: 8px;
    overflow: hidden;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px var(--border);
  }

  .theme-card__bar {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 14px;
    padding: 0 5px;
    border-radius: 4px;
  }

  .theme-card__line {
    width: 18px;
    height: 4px;
    border-radius: 2px;
  }

  .theme-card__line--muted {
    width: 28px;
  }

  .theme-card__tiles {
    display: grid;
    flex: 1;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    min-height: 0;
  }

  .theme-card__tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 4px;
    border: 1px solid;
    border-radius: 5px;
  }

  .theme-card__plate {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
  }

  .theme-card__logo {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .theme-card__cells {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    width: 22px;
  }

  .theme-card__cell {
    height: 8px;
    border-radius: 2px;
  }

  .theme-card__caption {
    width: 60%;
    height: 3px;
    border-radius: 2px;
    opacity: 0.8;
  }

  .theme-card__name {
    font-size: 0.8125rem;
    text-align: center;
  }
</style>
