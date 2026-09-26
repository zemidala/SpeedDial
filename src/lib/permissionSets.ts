// Optional permissions of the extension. No Svelte — also used in the service worker

/** Access to sites: icons from sites and page screenshots for thumbnails */
export const SITE_ACCESS: chrome.permissions.Permissions = {origins: ['<all_urls>']};

/** Access to Bing only: the "Image of the day" background */
export const BING_ACCESS: chrome.permissions.Permissions = {origins: ['https://www.bing.com/*']};

/** Reading the clipboard: pasting a thumbnail image from the clipboard */
export const CLIPBOARD_ACCESS: chrome.permissions.Permissions = {permissions: ['clipboardRead']};
