// Optional permissions: requested only when the user turns a feature on
import {t} from './i18n/index.svelte';
import {hideNotice, showNotice} from './notice.svelte';
import {BING_ACCESS, CLIPBOARD_ACCESS, SITE_ACCESS} from './permissionSets';

/** A clear explanation of a permission request error */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // The browser reads pages of an unpacked extension from disk right away, but the manifest only on reload
  if (message.includes('Only permissions specified in the manifest')) {
    return t.notice.outdatedPermissions(t.notice.reloadHint);
  }
  return t.notice.permissionFailed(message);
}

class PermissionsStore {
  siteAccess = $state(false);
  clipboard = $state(false);
  /** Access to Bing — on its own or as part of access to all sites */
  bing = $state(false);
  /** Permission state has been checked */
  ready: Promise<void>;

  #resolveReady!: () => void;

  constructor() {
    this.ready = new Promise((resolve) => {
      this.#resolveReady = resolve;
    });
  }

  async start(): Promise<void> {
    try {
      await this.#refresh();
    } finally {
      this.#resolveReady();
    }
    // Permissions can be granted or revoked on the extensions page
    const refresh = () => {
      this.#refresh().catch((error) => console.error('Failed to check permissions', error));
    };
    chrome.permissions.onAdded.addListener(refresh);
    chrome.permissions.onRemoved.addListener(refresh);
  }

  /**
   * Requests a permission. Call directly from a click handler, before any await:
   * the browser shows the prompt only in response to a user action.
   * Doesn't throw: shows a notification and returns false.
   */
  async request(permissions: chrome.permissions.Permissions): Promise<boolean> {
    let granted = false;
    try {
      granted = await chrome.permissions.request(permissions);
      hideNotice();
    } catch (error) {
      console.error('Failed to request permission', error);
      showNotice(describeError(error));
    }
    await this.#refresh();
    return granted;
  }

  async remove(permissions: chrome.permissions.Permissions): Promise<void> {
    await chrome.permissions.remove(permissions).catch(() => false);
    await this.#refresh();
  }

  async #refresh(): Promise<void> {
    [this.siteAccess, this.clipboard, this.bing] = await Promise.all([
      chrome.permissions.contains(SITE_ACCESS),
      chrome.permissions.contains(CLIPBOARD_ACCESS),
      chrome.permissions.contains(BING_ACCESS),
    ]);
  }
}

export const permissions = new PermissionsStore();
