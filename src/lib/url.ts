// Схема в начале строки ("https:", "mailto:", "edge:" и т.п.).
// "localhost:3000" и "example.com:8080" схемой не считаются — после двоеточия идёт цифра.
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/** Приводит введённый пользователем адрес к полному URL; null, если адрес некорректный */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  // Пробелы отклоняем явно: парсер Chromium, в отличие от Node, превращает их в %20 даже в домене
  if (!trimmed || /\s/.test(trimmed)) return null;

  // Если схема не указана, добавляем 'https://' по умолчанию
  const withScheme = SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (isWebUrl(url.href) && !url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Домен для показа пользователю: без «www.» */
export function displayHost(url: string): string {
  return getHostname(url).replace(/^www\./, '');
}

// Вторые уровни, которые сами по себе не название сайта: bbc.co.uk, gov.com.au и т.п.
const GENERIC_SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu', 'or', 'ne', 'go']);

/** Название сайта из адреса, без поддоменов и зоны: ru.wikipedia.org → wikipedia, bbc.co.uk → bbc */
export function siteName(url: string): string {
  const parts = getHostname(url).split('.').filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  const tld = parts.at(-1)!;
  const second = parts.at(-2)!;
  if (parts.length >= 3 && tld.length === 2 && GENERIC_SECOND_LEVEL.has(second)) return parts.at(-3)!;
  return second;
}

/** Обычная веб-ссылка, которую браузер откроет сам по клику на <a> */
export function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Иконка сайта из встроенного кэша браузера (разрешение "favicon") */
export function getFaviconUrl(pageUrl: string, size: number): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}
