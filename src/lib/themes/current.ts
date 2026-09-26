// The theme chosen in the settings
import type {Settings} from '../settings/schema';
import {customPreset, dimLightPalette, type ThemePreset} from './palette';
import {DEFAULT_THEME_PRESET, THEME_PRESETS} from './presets';

const DEFAULT_PRESET = THEME_PRESETS.find((preset) => preset.id === DEFAULT_THEME_PRESET)!;

type ThemeSettings = Pick<Settings, 'themePreset' | 'customAccent' | 'customTint' | 'lightDimming'>;

/** Theme with the light variant softened */
export function withDimming(preset: ThemePreset, lightDimming: number): ThemePreset {
  return {...preset, light: dimLightPalette(preset.light, lightDimming / 100)};
}

/** The theme chosen in the settings — with the softened light variant */
export function resolvePreset(settings: ThemeSettings): ThemePreset {
  const preset = settings.themePreset === 'custom'
    ? customPreset(settings.customAccent, settings.customTint)
    : THEME_PRESETS.find((item) => item.id === settings.themePreset) ?? DEFAULT_PRESET;
  return withDimming(preset, settings.lightDimming);
}

/** localStorage key: palette CSS for theme-init.js — so the theme applies before first paint */
export const PALETTE_CACHE_KEY = 'theme-palette-css';
/** id of the style element with the palette; theme-init.js uses the same one */
export const PALETTE_STYLE_ID = 'theme-palette';
