// Reading a site's page: decoding it in its own charset and finding its name. No DOM — also used in the service worker
import {decodeEntities} from './bookmarksHtml';

const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 500;

/**
 * The page's charset: from the Content-Type header, else from <meta charset> or the http-equiv form in the first
 * bytes (read as ASCII — enough for the tag itself); UTF-8 if neither says
 */
export function charsetOf(contentType: string, bytes: Uint8Array): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const head = new TextDecoder('ascii').decode(bytes.subarray(0, 4096));
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  return fromMeta?.toLowerCase() ?? 'utf-8';
}

/** Page text in its own charset; an unknown charset falls back to UTF-8 */
export function decodePage(buffer: ArrayBuffer, contentType: string): string {
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder(charsetOf(contentType, bytes)).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function clean(text: string, maxLength: number): string {
  return decodeEntities(text).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** The content of the first non-empty <meta> with one of these names (name= or property=) */
function metaContent(html: string, names: string[], maxLength: number): string | null {
  for (const name of names) {
    for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
      const tag = match[0];
      const tagName = /(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1];
      if (tagName?.toLowerCase() !== name) continue;
      const content = /content=(?:"([^"]*)"|'([^']*)')/i.exec(tag);
      const value = clean(content?.[1] ?? content?.[2] ?? '', maxLength);
      if (value) return value;
    }
  }
  return null;
}

/** The page's name: <title>, else the one for sharing (og:title, twitter:title); null if there's none */
export function pageTitle(html: string): string | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (title && clean(title, MAX_TITLE_LENGTH)) return clean(title, MAX_TITLE_LENGTH);
  return metaContent(html, ['og:title', 'twitter:title'], MAX_TITLE_LENGTH);
}

/** The page's own short description (for search engines and sharing); null if there's none */
export function pageDescription(html: string): string | null {
  return metaContent(html, ['description', 'og:description', 'twitter:description'], MAX_DESCRIPTION_LENGTH);
}
