// "What's new" after an update. Shown for a new release (the first three parts of the version: 2.0.0 → 2.1.0),
// not for a new build (2.0.0.145 → 2.0.0.146): an unpacked extension is updated on every reload while developing.
// No Svelte — also used in the service worker
const PENDING_KEY = 'whatsNewPending';

/** 2.1.0.145 → 2.1.0 */
export function releaseOf(version: string): string {
  return version.split('.').slice(0, 3).join('.');
}

export function isNewRelease(previous: string | undefined, current: string): boolean {
  return previous !== undefined && releaseOf(previous) !== releaseOf(current);
}

/** Service worker: remember to tell about the update when a new tab opens */
export async function rememberUpdate(previous: string | undefined, current: string): Promise<void> {
  if (isNewRelease(previous, current)) await chrome.storage.local.set({[PENDING_KEY]: releaseOf(current)});
}

/** Page: the release to tell about, once; null — nothing new */
export async function takePendingRelease(): Promise<string | null> {
  const release = (await chrome.storage.local.get(PENDING_KEY))[PENDING_KEY];
  if (typeof release !== 'string') return null;
  await chrome.storage.local.remove(PENDING_KEY);
  return release;
}
