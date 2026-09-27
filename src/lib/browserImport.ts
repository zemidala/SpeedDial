// The browser's own "Import bookmarks and settings": it reads other browsers' profiles on this computer (an extension
// can't), and the bookmarks it brings appear in SpeedDial at once

interface Brand {
  brand: string;
}

export interface BrowserImport {
  /** Browser name for the hint, e.g. "Microsoft Edge" */
  name: string;
  /** Its import page */
  url: string;
}

const CHROME_IMPORT = 'chrome://settings/importData';

/** The import page of this browser; Chromium-based browsers not listed understand the Chrome address */
export function browserImport(brands: Brand[]): BrowserImport {
  const names = brands.map(({brand}) => brand);
  const has = (name: string) => names.some((brand) => brand.toLowerCase().includes(name));
  if (has('edge')) return {name: 'Microsoft Edge', url: 'edge://settings/profiles/importBrowsingData'};
  if (has('opera')) return {name: 'Opera', url: 'opera://settings/importData'};
  if (has('yabrowser') || has('yandex')) return {name: 'Яндекс Браузер', url: 'browser://settings/importDataDialog'};
  if (has('brave')) return {name: 'Brave', url: CHROME_IMPORT};
  if (has('google chrome')) return {name: 'Google Chrome', url: CHROME_IMPORT};
  return {name: 'Chromium', url: CHROME_IMPORT};
}

export function currentBrowserImport(): BrowserImport {
  const data = (navigator as Navigator & {userAgentData?: {brands: Brand[]}}).userAgentData;
  return browserImport(data?.brands ?? []);
}
