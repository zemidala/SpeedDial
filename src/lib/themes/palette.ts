// Палитры оформления: набор цветов для светлого или тёмного режима и сборка их в CSS-переменные
import {ensureContrast, mixColors} from '../color';

/** Цвета одного режима. Все, кроме border, shadow, shadowRaised и cell, — в формате #rrggbb */
export interface ThemePalette {
  /** Фон страницы — градиент от pageFrom к pageTo */
  pageFrom: string;
  pageTo: string;
  /** Панели: крошки, поиск, меню, окна */
  surface: string;
  surfaceMuted: string;
  surfaceHover: string;
  text: string;
  /** Подписи и пояснения */
  textMuted: string;
  /** Ссылки, основные кнопки, переключатели, подсветка при перетаскивании */
  accent: string;
  accentHover: string;
  /** Текст на акцентном фоне */
  accentText: string;
  danger: string;
  dangerText: string;
  /** Плитка закладки и плитка папки */
  tile: string;
  folder: string;
  /** Ячейки миниатюр на плитке папки (обычно полупрозрачные) */
  cell: string;
  /** Подложка иконок сайтов — светлая даже в тёмных палитрах, иначе тёмные логотипы теряются */
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

// Имена CSS-переменных для полей палитры
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
 * CSS с цветами палитры: light-dark() выбирает вариант по текущему режиму, поэтому смена светлой
 * и тёмной темы (в том числе системной) не требует JavaScript. :root:root перекрывает цвета
 * по умолчанию из theme.css независимо от порядка подключения стилей
 */
export function paletteCss(preset: Pick<ThemePreset, 'light' | 'dark'>): string {
  const lines = (Object.keys(CSS_VARIABLES) as Array<keyof ThemePalette>)
    .map((key) => `  ${CSS_VARIABLES[key]}: light-dark(${preset.light[key]}, ${preset.dark[key]});`);
  return `:root:root {\n${lines.join('\n')}\n}`;
}

const MIN_CONTRAST = 4.5; // WCAG AA для обычного текста

/**
 * «Свои цвета»: светлая и тёмная палитры из акцента и оттенка фона. Нейтральные цвета — белый
 * или почти чёрный с примесью оттенка; текст и акцент при необходимости сдвигаются до читаемого контраста
 */
export function customPreset(accent: string, tint: string): ThemePreset {
  const lightSurface = mixColors('#ffffff', tint, 0.03);
  const lightTile = mixColors('#ffffff', tint, 0.05);
  const lightFolder = mixColors('#ffffff', accent, 0.14);
  const lightText = ensureContrast(mixColors('#16181c', tint, 0.15), mixColors('#ffffff', tint, 0.16), MIN_CONTRAST);
  // Акцент читается и как ссылка на панели, и как фон кнопки с белой надписью
  const lightAccent = ensureContrast(ensureContrast(accent, mixColors(lightSurface, tint, 0.1), MIN_CONTRAST), '#ffffff', MIN_CONTRAST);

  const darkSurface = mixColors('#1e2025', tint, 0.1);
  const darkTile = mixColors('#23262c', tint, 0.1);
  const darkFolder = mixColors(darkTile, accent, 0.16);
  const darkText = ensureContrast(mixColors('#f1f2f4', tint, 0.08), mixColors(darkSurface, tint, 0.1), MIN_CONTRAST);
  // Акцент читается и как ссылка на панели, и как фон кнопки с тёмной надписью
  const darkAccent = ensureContrast(ensureContrast(accent, mixColors(darkSurface, '#ffffff', 0.06), MIN_CONTRAST), '#16181c', MIN_CONTRAST);

  return {
    id: 'custom',
    name: 'Свои цвета',
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
