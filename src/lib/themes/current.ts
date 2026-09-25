// Выбранная в настройках тема оформления
import type {Settings} from '../settings/schema';
import {customPreset, type ThemePreset} from './palette';
import {DEFAULT_THEME_PRESET, THEME_PRESETS} from './presets';

const DEFAULT_PRESET = THEME_PRESETS.find((preset) => preset.id === DEFAULT_THEME_PRESET)!;

export function resolvePreset(settings: Pick<Settings, 'themePreset' | 'customAccent' | 'customTint'>): ThemePreset {
  if (settings.themePreset === 'custom') return customPreset(settings.customAccent, settings.customTint);
  return THEME_PRESETS.find((preset) => preset.id === settings.themePreset) ?? DEFAULT_PRESET;
}

/** Ключ в localStorage: CSS палитры для theme-init.js — чтобы тема применялась до первой отрисовки */
export const PALETTE_CACHE_KEY = 'theme-palette-css';
/** id элемента style с палитрой; тот же использует theme-init.js */
export const PALETTE_STYLE_ID = 'theme-palette';
