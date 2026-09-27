import {describe, expect, it} from 'vitest';
import {exportFileName} from './exportBookmarks';

describe('exportFileName', () => {
  const date = new Date('2026-09-27T10:00:00Z');

  it('uses the folder name and the date', () => {
    expect(exportFileName('Работа', date)).toBe('Работа 2026-09-27.html');
  });

  it('drops characters file systems don\'t allow', () => {
    expect(exportFileName('News: RU/EN <best>?', date)).toBe('News RU EN best 2026-09-27.html');
    expect(exportFileName('///', date)).toBe('bookmarks 2026-09-27.html');
  });
});
