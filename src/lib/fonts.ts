// Fonts: text sizes and the interface font — like the font settings in Edge and Opera
import type {FontSize, TitleAlign, TitleSize} from './settings/schema';

/** Text scale of the whole page; 1 — medium (recommended) */
export const FONT_SCALES: Record<FontSize, number> = {xs: 0.875, s: 0.9375, m: 1, l: 1.125, xl: 1.25};

/** Tile name size */
export const TITLE_FONT_SIZES: Record<TitleSize, string> = {s: '0.75rem', m: '0.8125rem', l: '0.9375rem'};

/** Tile name alignment — justify-content of the name (icon and text) */
export const TITLE_JUSTIFY: Record<TitleAlign, string> = {left: 'flex-start', center: 'center', right: 'flex-end'};

/** The system interface font — always available */
export const SYSTEM_FONT = 'system-ui';

/** Popular fonts: only installed ones are listed */
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

/** The first font of a font-family list, without quotes */
export function firstFamily(fontFamily: string): string {
  return (fontFamily.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
}

/** font-family value for the chosen font: with fallbacks in case the font is missing on another device */
export function fontStack(name: string): string {
  if (name === SYSTEM_FONT) return 'system-ui, sans-serif';
  return `"${name.replaceAll('"', '')}", system-ui, sans-serif`;
}

const SAMPLE = 'mmmmmmmmmmlliWWQ@#';
const BASELINES = ['monospace', 'serif', 'sans-serif'] as const;

/**
 * Whether a font is installed: text in it (with a fallback baseline) is wider or narrower than the baseline alone.
 * Works without permissions, unlike queryLocalFonts
 */
export function isFontInstalled(name: string, context: CanvasRenderingContext2D): boolean {
  if (name === SYSTEM_FONT) return true;
  const width = (font: string) => {
    context.font = `72px ${font}`;
    return context.measureText(SAMPLE).width;
  };
  return BASELINES.some((baseline) => width(`"${name}", ${baseline}`) !== width(baseline));
}

/** Installed fonts among the popular ones */
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

/** Whether the full list of system fonts is available (Local Font Access API) */
export function canListSystemFonts(): boolean {
  return typeof window.queryLocalFonts === 'function';
}

/** All system font families; the browser asks for permission. null — not allowed */
export async function systemFontFamilies(): Promise<string[] | null> {
  try {
    const fonts = await window.queryLocalFonts!();
    return [...new Set(fonts.map((font) => font.family))].sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
}
