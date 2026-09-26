// A scheme at the start of the string ("https:", "mailto:", "edge:", etc.).
// "localhost:3000" and "example.com:8080" don't count as schemes — a digit follows the colon.
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/** Turns a user-typed address into a full URL; null if the address is invalid */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  // Reject spaces explicitly: Chromium's parser, unlike Node's, turns them into %20 even in the host
  if (!trimmed || /\s/.test(trimmed)) return null;

  // If no scheme is given, add 'https://' by default
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

/** Domain for display: without "www." */
export function displayHost(url: string): string {
  return getHostname(url).replace(/^www\./, '');
}

// Second-level domains that aren't a site name by themselves: bbc.co.uk, gov.com.au, etc.
const GENERIC_SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu', 'or', 'ne', 'go']);

/** Site name from the URL, without subdomains and TLD: ru.wikipedia.org → wikipedia, bbc.co.uk → bbc */
export function siteName(url: string): string {
  const parts = getHostname(url).split('.').filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  const tld = parts.at(-1)!;
  const second = parts.at(-2)!;
  if (parts.length >= 3 && tld.length === 2 && GENERIC_SECOND_LEVEL.has(second)) return parts.at(-3)!;
  return second;
}

/** A regular web link the browser opens itself on an <a> click */
export function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Site icon from the browser's built-in cache (the "favicon" permission) */
export function getFaviconUrl(pageUrl: string, size: number): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}
