import {describe, expect, it} from 'vitest';
import {DEFAULT_SETTINGS, MAX_CUSTOM_CSS_LENGTH, sanitizeSettings, splitSettings} from './schema';
import {parseSettingsFile, serializeSettings, settingsFileName} from './transfer';

describe('sanitizeSettings', () => {
  it('missing values — defaults, unknown ones are dropped', () => {
    const result = sanitizeSettings({columns: 4, unknown: 'x'});
    expect(result).toEqual({...DEFAULT_SETTINGS, columns: 4});
    expect(result).not.toHaveProperty('unknown');
  });

  it('drops values of the wrong type and outside enums', () => {
    const result = sanitizeSettings({theme: 'purple', showTitles: 'yes', searchEngine: 'altavista', tileColor: 'red'});
    expect(result.theme).toBe('auto');
    expect(result.showTitles).toBe(true);
    expect(result.searchEngine).toBe('google');
    expect(result.tileColor).toBe('');
  });

  it('clamps numbers to the range', () => {
    expect(sanitizeSettings({columns: 100, containerWidth: 5, captureDelay: Number.NaN})).toMatchObject({
      columns: 12,
      containerWidth: 40,
      captureDelay: DEFAULT_SETTINGS.captureDelay,
    });
  });

  it('validates the service list and the CSS length', () => {
    const result = sanitizeSettings({
      services: [{title: 'A', url: 'https://a.example/'}, {title: 1}, null],
      customCss: 'x'.repeat(MAX_CUSTOM_CSS_LENGTH + 10),
    });
    expect(result.services).toEqual([{title: 'A', url: 'https://a.example/'}]);
    expect(result.customCss).toHaveLength(MAX_CUSTOM_CSS_LENGTH);
  });

  it('not an object — default settings', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('oops')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('splitSettings', () => {
  it('separates local settings from synced ones', () => {
    const {shared, local} = splitSettings({...DEFAULT_SETTINGS, defaultFolderId: '42', syncEnabled: false});
    expect(local).toEqual({defaultFolderId: '42', syncEnabled: false});
    expect(shared).not.toHaveProperty('defaultFolderId');
    expect(shared).not.toHaveProperty('syncEnabled');
    expect(shared.columns).toBe(DEFAULT_SETTINGS.columns);
  });
});

describe('export and import', () => {
  const now = new Date('2026-09-25T12:00:00Z');

  it('export without local settings; import keeps the current local ones', () => {
    const exported = serializeSettings({...DEFAULT_SETTINGS, columns: 9, defaultFolderId: '7'}, now);
    expect(JSON.parse(exported)).toMatchObject({format: 'speeddial-settings', exportedAt: now.toISOString()});
    expect(JSON.parse(exported).settings).not.toHaveProperty('defaultFolderId');

    const current = {...DEFAULT_SETTINGS, defaultFolderId: '3', syncEnabled: false};
    expect(parseSettingsFile(exported, current)).toEqual({...current, columns: 9});
  });

  it('rejects non-JSON and foreign files', () => {
    expect(() => parseSettingsFile('not json', DEFAULT_SETTINGS)).toThrow('Файл повреждён: это не JSON');
    expect(() => parseSettingsFile('{"settings":{}}', DEFAULT_SETTINGS)).toThrow('Это не файл настроек SpeedDial');
  });

  it('file name with the date', () => {
    expect(settingsFileName(now)).toBe('speeddial-settings-2026-09-25.json');
  });
});
