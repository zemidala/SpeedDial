// Extension updates: checking, the mark on the toolbar icon and installing. No Svelte — also used in the service worker.
//
// From a store the browser downloads an update by itself and installs it when the extension is idle or on restart;
// a check asks for it right away, and reloading installs a downloaded one. An unpacked extension has no store:
// its files on disk change with every build, and reloading picks them up — a newer build number in manifest.json
// on disk is its "update"
const AVAILABLE_KEY = 'updateAvailable';
const BADGE_COLOR = '#188038';

export type UpdateStatus =
  | {state: 'available'; version: string}
  | {state: 'none'}
  /** The store was asked too often — the browser answers again later */
  | {state: 'throttled'}
  | {state: 'failed'; error: string};

/** 2.0.0.45 > 2.0.0.9: parts compared as numbers */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = candidate.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export async function isDevelopmentInstall(): Promise<boolean> {
  const self = await chrome.management.getSelf().catch(() => null);
  return self?.installType === 'development';
}

/** The mark on the toolbar icon: an update is waiting */
async function showMark(available: boolean): Promise<void> {
  await chrome.action.setBadgeText({text: available ? '↑' : ''});
  if (available) await chrome.action.setBadgeBackgroundColor({color: BADGE_COLOR});
}

/** Service worker: the browser has downloaded an update — remembered for the popup and About, marked on the icon */
export async function rememberAvailableUpdate(version: string): Promise<void> {
  await chrome.storage.local.set({[AVAILABLE_KEY]: version});
  await showMark(true);
}

/** Service worker start: an update remembered earlier is either still waiting (the mark comes back) or installed */
export async function restoreUpdateMark(): Promise<void> {
  const version = (await chrome.storage.local.get(AVAILABLE_KEY))[AVAILABLE_KEY];
  const waiting = typeof version === 'string' && isNewerVersion(version, chrome.runtime.getManifest().version);
  if (!waiting) await chrome.storage.local.remove(AVAILABLE_KEY);
  await showMark(waiting);
}

async function checkDisk(): Promise<UpdateStatus> {
  const response = await fetch(chrome.runtime.getURL('manifest.json'), {cache: 'no-store'});
  const {version} = await response.json() as {version: string};
  return isNewerVersion(version, chrome.runtime.getManifest().version) ? {state: 'available', version} : {state: 'none'};
}

async function checkStore(): Promise<UpdateStatus> {
  const remembered = (await chrome.storage.local.get(AVAILABLE_KEY))[AVAILABLE_KEY];
  if (typeof remembered === 'string' && isNewerVersion(remembered, chrome.runtime.getManifest().version)) {
    return {state: 'available', version: remembered};
  }
  const {status, version} = await chrome.runtime.requestUpdateCheck();
  if (status === 'update_available') return {state: 'available', version: version ?? ''};
  return status === 'throttled' ? {state: 'throttled'} : {state: 'none'};
}

export async function checkForUpdate(development: boolean): Promise<UpdateStatus> {
  try {
    const status = await (development ? checkDisk() : checkStore());
    if (status.state === 'available' || status.state === 'none') await showMark(status.state === 'available');
    return status;
  } catch (error) {
    return {state: 'failed', error: error instanceof Error ? error.message : String(error)};
  }
}

/** Installs the update (or, unpacked, picks up the files on disk): the extension restarts */
export function applyUpdate(): void {
  chrome.runtime.reload();
}
