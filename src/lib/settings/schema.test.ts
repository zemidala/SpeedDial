import {describe, expect, it} from 'vitest';
import {DEFAULT_SETTINGS, MAX_CUSTOM_CSS_LENGTH, sanitizeSettings, splitSettings} from './schema';
import {parseSettingsFile, serializeSettings, settingsFileName} from './transfer';

describe('sanitizeSettings', () => {
  it('недостающее — по умолчанию, неизвестное отбрасывается', () => {
    const result = sanitizeSettings({columns: 4, unknown: 'x'});
    expect(result).toEqual({...DEFAULT_SETTINGS, columns: 4});
    expect(result).not.toHaveProperty('unknown');
  });

  it('отбрасывает значения неверного типа и вне перечислений', () => {
    const result = sanitizeSettings({theme: 'purple', showTitles: 'yes', searchEngine: 'altavista', tileColor: 'red'});
    expect(result.theme).toBe('auto');
    expect(result.showTitles).toBe(true);
    expect(result.searchEngine).toBe('google');
    expect(result.tileColor).toBe('');
  });

  it('ограничивает числа диапазоном', () => {
    expect(sanitizeSettings({columns: 100, containerWidth: 5, captureDelay: Number.NaN})).toMatchObject({
      columns: 12,
      containerWidth: 40,
      captureDelay: DEFAULT_SETTINGS.captureDelay,
    });
  });

  it('проверяет список сервисов и длину CSS', () => {
    const result = sanitizeSettings({
      services: [{title: 'A', url: 'https://a.example/'}, {title: 1}, null],
      customCss: 'x'.repeat(MAX_CUSTOM_CSS_LENGTH + 10),
    });
    expect(result.services).toEqual([{title: 'A', url: 'https://a.example/'}]);
    expect(result.customCss).toHaveLength(MAX_CUSTOM_CSS_LENGTH);
  });

  it('не-объект — настройки по умолчанию', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('oops')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('splitSettings', () => {
  it('отделяет локальные настройки от синхронизируемых', () => {
    const {shared, local} = splitSettings({...DEFAULT_SETTINGS, defaultFolderId: '42', syncEnabled: false});
    expect(local).toEqual({defaultFolderId: '42', syncEnabled: false});
    expect(shared).not.toHaveProperty('defaultFolderId');
    expect(shared).not.toHaveProperty('syncEnabled');
    expect(shared.columns).toBe(DEFAULT_SETTINGS.columns);
  });
});

describe('экспорт и импорт', () => {
  const now = new Date('2026-09-25T12:00:00Z');

  it('экспорт без локальных настроек, импорт сохраняет текущие локальные', () => {
    const exported = serializeSettings({...DEFAULT_SETTINGS, columns: 9, defaultFolderId: '7'}, now);
    expect(JSON.parse(exported)).toMatchObject({format: 'speeddial-settings', exportedAt: now.toISOString()});
    expect(JSON.parse(exported).settings).not.toHaveProperty('defaultFolderId');

    const current = {...DEFAULT_SETTINGS, defaultFolderId: '3', syncEnabled: false};
    expect(parseSettingsFile(exported, current)).toEqual({...current, columns: 9});
  });

  it('отклоняет не-JSON и чужие файлы', () => {
    expect(() => parseSettingsFile('not json', DEFAULT_SETTINGS)).toThrow('Файл повреждён: это не JSON');
    expect(() => parseSettingsFile('{"settings":{}}', DEFAULT_SETTINGS)).toThrow('Это не файл настроек SpeedDial');
  });

  it('имя файла с датой', () => {
    expect(settingsFileName(now)).toBe('speeddial-settings-2026-09-25.json');
  });
});
