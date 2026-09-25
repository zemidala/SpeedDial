import {describe, expect, it} from 'vitest';
import {buildLogoUrl, logoTemplate} from './logoServices';
import {DEFAULT_SETTINGS, sanitizeSettings} from './settings/schema';

describe('logoTemplate', () => {
  it('готовые сервисы, свой адрес и logo.dev только с ключом', () => {
    expect(logoTemplate('none', '', '')).toBeNull();
    expect(logoTemplate('google', '', '')).toBe('https://www.google.com/s2/favicons?domain={{website}}&sz=256');
    expect(logoTemplate('logodev', '', '  ')).toBeNull();
    expect(logoTemplate('logodev', '', 'pk_1')).toContain('token={{token}}');
    expect(logoTemplate('custom', 'https://x.example/{{website}}.png', '')).toBe('https://x.example/{{website}}.png');
    expect(logoTemplate('custom', 'https://x.example/logo.png', '')).toBeNull();
  });
});

describe('buildLogoUrl', () => {
  it('подставляет домен и ключ', () => {
    expect(buildLogoUrl('https://icons.duckduckgo.com/ip3/{{website}}.ico', 'https://github.com/zemidala'))
      .toBe('https://icons.duckduckgo.com/ip3/github.com.ico');
    expect(buildLogoUrl('https://img.logo.dev/{{website}}?token={{token}}', 'https://x.example/', ' pk_1 '))
      .toBe('https://img.logo.dev/x.example?token=pk_1');
  });

  it('некорректный адрес или шаблон — null', () => {
    expect(buildLogoUrl('https://s.example/{{website}}', 'edge://settings')).toBeNull();
    expect(buildLogoUrl('javascript:{{website}}', 'https://x.example/')).toBeNull();
  });
});

describe('переход со старой настройки «Внешние логотипы»', () => {
  it('включённые внешние логотипы становятся своим адресом', () => {
    expect(sanitizeSettings({externalLogos: true, externalLogoUrl: 'https://l.example/{{website}}'}))
      .toMatchObject({logoService: 'custom', externalLogoUrl: 'https://l.example/{{website}}'});
    expect(sanitizeSettings({externalLogos: false}).logoService).toBe(DEFAULT_SETTINGS.logoService);
    expect(sanitizeSettings({externalLogos: true, logoService: 'google'}).logoService).toBe('google');
  });
});
