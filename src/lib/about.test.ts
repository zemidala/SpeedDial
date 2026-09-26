import {describe, expect, it} from 'vitest';
import {aboutText, pickBrowser} from './about';

describe('about', () => {
  it('prefers the specific browser over Chromium and placeholder brands', () => {
    expect(pickBrowser([
      {brand: 'Chromium', version: '131.0.6778.86'},
      {brand: 'Not_A Brand', version: '24.0.0.0'},
      {brand: 'Microsoft Edge', version: '131.0.2903.70'},
    ])).toBe('Microsoft Edge 131.0.2903.70');
    expect(pickBrowser([
      {brand: 'Not)A;Brand', version: '99'},
      {brand: 'Chromium', version: '131'},
    ])).toBe('Chromium 131');
  });

  it('builds a plain-text summary for bug reports', () => {
    const text = aboutText({
      name: 'SpeedDial',
      version: '2.0.0',
      build: 58,
      commit: 'abc1234',
      builtAt: Date.UTC(2026, 8, 27, 10, 0),
      browser: 'Google Chrome 131.0.0.0',
      extensionId: 'abcdefghijklmnop',
      development: true,
    }, {build: 'Build', browser: 'Browser', id: 'Extension ID'});
    expect(text).toBe([
      'SpeedDial 2.0.0',
      'Build: 58 (abc1234, 2026-09-27T10:00:00.000Z)',
      'Browser: Google Chrome 131.0.0.0',
      'Extension ID: abcdefghijklmnop (development)',
    ].join('\n'));
  });
});
