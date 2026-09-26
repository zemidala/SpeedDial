// Выбранная в настройках тема оформления
import type {Settings} from '../settings/schema';
import {customPreset, dimLightPalette, type ThemePreset} from './palette';
import {DEFAULT_THEME_PRESET, THEME_PRESETS} from './presets';

const DEFAULT_PRESET = THEME_PRESETS.find((preset) => preset.id === DEFAULT_THEME_PRESET)!;

type ThemeSettings = Pick<Settings, 'themePreset' | 'customAccent' | 'customTint' | 'lightDimming'>;

/** Тема с учётом приглушения светлого варианта */
export function withDimming(preset: ThemePreset, lightDimming: number): ThemePreset {
  return {...preset, light: dimLightPalette(preset.light, lightDimming / 100)};
}

/** Выбранная в настройках тема — с приглушённым светлым вариантом */
export function resolvePreset(settings: ThemeSettings): ThemePreset {
  const preset = settings.themePreset === 'custom'
    ? customPreset(settings.customAccent, settings.customTint)
    : THEME_PRESETS.find((item) => item.id === settings.themePreset) ?? DEFAULT_PRESET;
  return withDimming(preset, settings.lightDimming);
}

/** Ключ в localStorage: CSS палитры для theme-init.js — чтобы тема применялась до первой отрисовки */
export const PALETTE_CACHE_KEY = 'theme-palette-css';
/** id элемента style с палитрой; тот же использует theme-init.js */
export const PALETTE_STYLE_ID = 'theme-palette';
