// Шрифты: размеры текста и выбор шрифта интерфейса — как в настройках шрифтов Edge и Оперы
import type {FontSize, TitleSize} from './settings/schema';

/** Масштаб текста всей страницы; 1 — средний (рекомендуется) */
export const FONT_SCALES: Record<FontSize, number> = {xs: 0.875, s: 0.9375, m: 1, l: 1.125, xl: 1.25};

/** Размер названий плиток */
export const TITLE_FONT_SIZES: Record<TitleSize, string> = {s: '0.75rem', m: '0.8125rem', l: '0.9375rem'};

/** Системный шрифт интерфейса — есть всегда */
export const SYSTEM_FONT = 'system-ui';

/** Популярные шрифты: в списке показываются только установленные */
export const FONT_CANDIDATES = [
  'Segoe UI',
  'Arial',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Calibri',
  'Candara',
  'Segoe Print',
  'Georgia',
  'Times New Roman',
  'Cambria',
  'Roboto',
  'Open Sans',
  'Inter',
  'Noto Sans',
  'Ubuntu',
  'Helvetica Neue',
  'PT Sans',
  'Consolas',
  'Courier New',
];

/** Первый шрифт из списка font-family, без кавычек */
export function firstFamily(fontFamily: string): string {
  return (fontFamily.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
}

/** Значение font-family для выбранного шрифта: с запасными, если шрифта не окажется на другом устройстве */
export function fontStack(name: string): string {
  if (name === SYSTEM_FONT) return 'system-ui, sans-serif';
  return `"${name.replaceAll('"', '')}", system-ui, sans-serif`;
}

const SAMPLE = 'mmmmmmmmmmlliWWQ@#';
const BASELINES = ['monospace', 'serif', 'sans-serif'] as const;

/**
 * Установлен ли шрифт: текст этим шрифтом (с запасным baseline) шире или уже, чем просто baseline.
 * Работает без разрешений, в отличие от queryLocalFonts
 */
export function isFontInstalled(name: string, context: CanvasRenderingContext2D): boolean {
  if (name === SYSTEM_FONT) return true;
  const width = (font: string) => {
    context.font = `72px ${font}`;
    return context.measureText(SAMPLE).width;
  };
  return BASELINES.some((baseline) => width(`"${name}", ${baseline}`) !== width(baseline));
}

/** Установленные шрифты из популярных */
export function installedFonts(): string[] {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return FONT_CANDIDATES;
  return FONT_CANDIDATES.filter((name) => isFontInstalled(name, context));
}

interface LocalFontData {
  family: string;
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
  }
}

/** Можно ли получить полный список шрифтов системы (Local Font Access API) */
export function canListSystemFonts(): boolean {
  return typeof window.queryLocalFonts === 'function';
}

/** Все семейства шрифтов системы; браузер спросит разрешение. null — не разрешили */
export async function systemFontFamilies(): Promise<string[] | null> {
  try {
    const fonts = await window.queryLocalFonts!();
    return [...new Set(fonts.map((font) => font.family))].sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
}
