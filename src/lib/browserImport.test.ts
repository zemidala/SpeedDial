import {describe, expect, it} from 'vitest';
import {browserImport} from './browserImport';

const brands = (...names: string[]) => names.map((brand) => ({brand}));

describe('browserImport', () => {
  it('opens the import page of the browser itself', () => {
    expect(browserImport(brands('Not A(Brand', 'Chromium', 'Microsoft Edge')).url).toBe('edge://settings/profiles/importBrowsingData');
    expect(browserImport(brands('Opera', 'Chromium')).url).toBe('opera://settings/importData');
    expect(browserImport(brands('Chromium', 'Google Chrome'))).toEqual({name: 'Google Chrome', url: 'chrome://settings/importData'});
  });

  it('other Chromium browsers use the Chrome address', () => {
    expect(browserImport([]).url).toBe('chrome://settings/importData');
    expect(browserImport(brands('Chromium')).name).toBe('Chromium');
  });
});
