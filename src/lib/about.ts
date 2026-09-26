// What Settings → About shows: extension version, build, browser and install type

export interface AboutInfo {
  name: string;
  version: string;
  /** Build number: the commit count, grows with every commit */
  build: number;
  commit: string;
  /** Build time, ms */
  builtAt: number;
  browser: string;
  extensionId: string;
  /** Unpacked (development) or installed from a store */
  development: boolean;
}

interface UserAgentBrand {
  brand: string;
  version: string;
}

interface UserAgentData {
  brands: UserAgentBrand[];
  getHighEntropyValues(hints: string[]): Promise<{fullVersionList?: UserAgentBrand[]}>;
}

/**
 * Browser name and full version, e.g. "Microsoft Edge 131.0.2903.70". The brand list also has
 * placeholder entries ("Not A Brand") and Chromium itself — the specific browser is preferred
 */
export function pickBrowser(brands: UserAgentBrand[]): string {
  const real = brands.filter(({brand}) => !/not.?a.?brand/i.test(brand));
  const specific = real.find(({brand}) => brand !== 'Chromium') ?? real[0];
  return specific ? `${specific.brand} ${specific.version}` : navigator.userAgent;
}

async function browserVersion(): Promise<string> {
  const data = (navigator as Navigator & {userAgentData?: UserAgentData}).userAgentData;
  if (!data) return navigator.userAgent;
  try {
    const {fullVersionList} = await data.getHighEntropyValues(['fullVersionList']);
    return pickBrowser(fullVersionList ?? data.brands);
  } catch {
    return pickBrowser(data.brands);
  }
}

export async function aboutInfo(): Promise<AboutInfo> {
  const manifest = chrome.runtime.getManifest();
  const self = await chrome.management.getSelf().catch(() => null);
  return {
    name: 'SpeedDial',
    version: manifest.version,
    build: __BUILD_INFO__.number,
    commit: __BUILD_INFO__.commit,
    builtAt: Date.parse(__BUILD_INFO__.date),
    browser: await browserVersion(),
    extensionId: chrome.runtime.id,
    development: self?.installType === 'development',
  };
}

/** Plain-text summary for bug reports */
export function aboutText(info: AboutInfo, labels: {build: string; browser: string; id: string}): string {
  return [
    `${info.name} ${info.version}`,
    `${labels.build}: ${info.build} (${info.commit}, ${new Date(info.builtAt).toISOString()})`,
    `${labels.browser}: ${info.browser}`,
    `${labels.id}: ${info.extensionId}${info.development ? ' (development)' : ''}`,
  ].join('\n');
}
