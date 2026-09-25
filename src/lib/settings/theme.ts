import type {Theme} from './schema';

export function isDarkTheme(theme: Theme, systemDark: boolean): boolean {
  return theme === 'auto' ? systemDark : theme === 'dark';
}
