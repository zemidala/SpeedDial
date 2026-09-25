// Необязательные разрешения расширения. Без Svelte — используются и в service worker

/** Доступ к сайтам: иконки с сайтов и снимки страниц для миниатюр */
export const SITE_ACCESS: chrome.permissions.Permissions = {origins: ['<all_urls>']};

/** Доступ только к Bing: фон «Картинка дня» */
export const BING_ACCESS: chrome.permissions.Permissions = {origins: ['https://www.bing.com/*']};

/** Чтение буфера обмена: вставка картинки-миниатюры из буфера */
export const CLIPBOARD_ACCESS: chrome.permissions.Permissions = {permissions: ['clipboardRead']};
