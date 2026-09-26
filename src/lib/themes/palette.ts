// Themes: a set of colours for light or dark mode and turning them into CSS variables
import {ensureContrast, mixColors} from '../color';

/** Colours of one mode. All except border, shadow, shadowRaised and cell are #rrggbb */
export interface ThemePalette {
  /** Page background — a gradient from pageFrom to pageTo */
  pageFrom: string;
  pageTo: string;
  /** Panels: breadcrumbs, search, menus, dialogs */
  surface: string;
  surfaceMuted: string;
  surfaceHover: string;
  text: string;
  /** Captions and hints */
  textMuted: string;
  /** Links, primary buttons, switches, drag highlight */
  accent: string;
  accentHover: string;
  /** Text on the accent background */
  accentText: string;
  danger: string;
  dangerText: string;
  /** Bookmark tile and folder tile */
  tile: string;
  folder: string;
  /** Preview cells on a folder tile (usually translucent) */
  cell: string;
  /** Plate behind site icons — light even in dark palettes, otherwise dark logos get lost */
  plate: string;
  border: string;
  shadow: string;
  shadowRaised: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  light: ThemePalette;
  dark: ThemePalette;
}

// CSS variable names for palette fields
const CSS_VARIABLES: Record<keyof ThemePalette, string> = {
  pageFrom: '--page-bg-from',
  pageTo: '--page-bg-to',
  surface: '--surface',
  surfaceMuted: '--surface-muted',
  surfaceHover: '--surface-hover',
  text: '--text',
  textMuted: '--text-muted',
  accent: '--accent',
  accentHover: '--accent-hover',
  accentText: '--accent-text',
  danger: '--danger',
  dangerText: '--danger-text',
  tile: '--tile-bg',
  folder: '--folder-bg',
  cell: '--cell-bg',
  plate: '--plate-bg',
  border: '--border',
  shadow: '--shadow-color',
  shadowRaised: '--shadow-raised-color',
};

/**
 * CSS with palette colours: light-dark() picks the variant for the current mode, so switching light
 * and dark (including the system setting) needs no JavaScript. :root:root overrides the default colours
 * from theme.css regardless of stylesheet order
 */
export function paletteCss(preset: Pick<ThemePreset, 'light' | 'dark'>): string {
  const lines = (Object.keys(CSS_VARIABLES) as Array<keyof ThemePalette>)
    .map((key) => `  ${CSS_VARIABLES[key]}: light-dark(${preset.light[key]}, ${preset.dark[key]});`);
  return `:root:root {\n${lines.join('\n')}\n}`;
}

const MIN_CONTRAST = 4.5; // WCAG AA for normal text

// Dark grey that light backgrounds are softened towards
const DIM_BASE = '#23272e';
// Share of the theme accent in the softening colour: backgrounds get a slight tint of the theme, like tonal surfaces
// in Material 3, — the light theme becomes softer but not "dirty grey" and keeps its character
const DIM_ACCENT_SHARE = 0.25;

/**
 * Softened light palette: backgrounds are mixed with a dark shade of the accent by amount (0–1) so white
 * doesn't glare. The hierarchy stays: the page background remains darker than tiles and panels. Icon plates
 * are softened half as much — icons stay bright. Text, links and captions darken if needed
 * so the contrast with all backgrounds stays at least WCAG AA
 */
export function dimLightPalette(palette: ThemePalette, amount: number): ThemePalette {
  if (amount <= 0) return palette;
  const target = mixColors(DIM_BASE, palette.accent, DIM_ACCENT_SHARE);
  const dim = (color: string, strength = 1) => mixColors(color, target, amount * strength);

  const backgrounds = {
    pageFrom: dim(palette.pageFrom),
    pageTo: dim(palette.pageTo),
    surface: dim(palette.surface),
    surfaceMuted: dim(palette.surfaceMuted),
    surfaceHover: dim(palette.surfaceHover),
    tile: dim(palette.tile),
    folder: dim(palette.folder),
  };
  const readableOnAll = (color: string, surfaces: string[]) =>
    surfaces.reduce((result, surface) => ensureContrast(result, surface, MIN_CONTRAST), color);
  const allBackgrounds = Object.values(backgrounds);
  const panels = [backgrounds.surface, backgrounds.surfaceMuted, backgrounds.tile];

  const accent = readableOnAll(palette.accent, [backgrounds.surface]);
  return {
    ...palette,
    ...backgrounds,
    plate: dim(palette.plate, 0.5),
    cell: 'rgb(255 255 255 / 0.45)',
    text: readableOnAll(palette.text, allBackgrounds),
    textMuted: readableOnAll(palette.textMuted, panels),
    accent,
    accentHover: accent === palette.accent ? palette.accentHover : mixColors(accent, '#000000', 0.15),
    danger: readableOnAll(palette.danger, [backgrounds.surface]),
  };
}

/**
 * "Custom colours": light and dark palettes from an accent and a background tint. Neutral colours are white
 * or near-black with a touch of the tint; text and accent shift to readable contrast if needed
 */
export function customPreset(accent: string, tint: string): ThemePreset {
  const lightSurface = mixColors('#ffffff', tint, 0.03);
  const lightTile = mixColors('#ffffff', tint, 0.05);
  const lightFolder = mixColors('#ffffff', accent, 0.14);
  const lightText = ensureContrast(mixColors('#16181c', tint, 0.15), mixColors('#ffffff', tint, 0.16), MIN_CONTRAST);
  // The accent reads both as a link on a panel and as a button background with white text
  const lightAccent = ensureContrast(ensureContrast(accent, mixColors(lightSurface, tint, 0.1), MIN_CONTRAST), '#ffffff', MIN_CONTRAST);

  const darkSurface = mixColors('#1e2025', tint, 0.1);
  const darkTile = mixColors('#23262c', tint, 0.1);
  const darkFolder = mixColors(darkTile, accent, 0.16);
  const darkText = ensureContrast(mixColors('#f1f2f4', tint, 0.08), mixColors(darkSurface, tint, 0.1), MIN_CONTRAST);
  // The accent reads both as a link on a panel and as a button background with dark text
  const darkAccent = ensureContrast(ensureContrast(accent, mixColors(darkSurface, '#ffffff', 0.06), MIN_CONTRAST), '#16181c', MIN_CONTRAST);

  return {
    id: 'custom',
    name: 'Custom colours',
    light: {
      pageFrom: mixColors('#ffffff', tint, 0.08),
      pageTo: mixColors('#ffffff', tint, 0.16),
      surface: lightSurface,
      surfaceMuted: mixColors(lightSurface, tint, 0.06),
      surfaceHover: mixColors(lightSurface, tint, 0.1),
      text: lightText,
      textMuted: ensureContrast(mixColors(lightText, lightSurface, 0.35), mixColors(lightSurface, tint, 0.1), MIN_CONTRAST),
      accent: lightAccent,
      accentHover: mixColors(lightAccent, '#000000', 0.15),
      accentText: '#ffffff',
      danger: ensureContrast('#c62828', lightSurface, MIN_CONTRAST),
      dangerText: '#ffffff',
      tile: lightTile,
      folder: lightFolder,
      cell: 'rgb(255 255 255 / 0.6)',
      plate: '#ffffff',
      border: 'rgb(0 0 0 / 0.1)',
      shadow: 'rgb(0 0 0 / 0.1)',
      shadowRaised: 'rgb(0 0 0 / 0.16)',
    },
    dark: {
      pageFrom: mixColors('#15161a', tint, 0.1),
      pageTo: mixColors('#0d0e11', tint, 0.08),
      surface: darkSurface,
      surfaceMuted: mixColors(darkSurface, '#ffffff', 0.04),
      surfaceHover: mixColors(darkSurface, '#ffffff', 0.07),
      text: darkText,
      textMuted: ensureContrast(mixColors(darkText, darkSurface, 0.35), mixColors(darkSurface, '#ffffff', 0.07), MIN_CONTRAST),
      accent: darkAccent,
      accentHover: mixColors(darkAccent, '#ffffff', 0.15),
      accentText: '#16181c',
      danger: ensureContrast('#ff6b6b', darkSurface, MIN_CONTRAST),
      dangerText: '#16181c',
      tile: darkTile,
      folder: darkFolder,
      cell: 'rgb(255 255 255 / 0.06)',
      plate: '#eceef1',
      border: 'rgb(255 255 255 / 0.1)',
      shadow: 'rgb(0 0 0 / 0.4)',
      shadowRaised: 'rgb(0 0 0 / 0.5)',
    },
  };
}
