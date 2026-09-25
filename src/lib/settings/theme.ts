import type {Theme} from './schema';

// Цвета плиток по умолчанию — для палитры в настройках; должны совпадать с styles/theme.css
export const THEME_TILE_COLORS = {
  light: {tileColor: '#ffffff', folderColor: '#e6f2ff'},
  dark: {tileColor: '#262a31', folderColor: '#1f2b3b'},
} as const;

export function isDarkTheme(theme: Theme, systemDark: boolean): boolean {
  return theme === 'auto' ? systemDark : theme === 'dark';
}
