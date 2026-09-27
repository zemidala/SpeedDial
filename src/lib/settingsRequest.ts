// The toolbar popup opens the settings: it opens a new tab (the browser's own new tab address, which is SpeedDial)
// and leaves a request that the tab takes when it starts. No Svelte — the popup doesn't load the page's stores
import type {SettingsTab} from './ui.svelte';

const KEY = 'openSettings';

export async function openSettingsInNewTab(tab: SettingsTab): Promise<void> {
  await chrome.storage.session.set({[KEY]: tab});
  await chrome.tabs.create({});
}

/** The settings tab to open, once; null — the tab was opened as usual */
export async function takeSettingsRequest(): Promise<SettingsTab | null> {
  const tab = (await chrome.storage.session.get(KEY))[KEY];
  if (typeof tab !== 'string') return null;
  await chrome.storage.session.remove(KEY);
  return tab as SettingsTab;
}
