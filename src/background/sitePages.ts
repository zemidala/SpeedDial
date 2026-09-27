// Requests to sites on behalf of the page (icons from sites, the link check). Done here because the service worker,
// unlike a page, ignores a site's "Link: rel=preload" headers — no stray downloads of its styles and scripts
import {checkLink, type LinkCheck} from '../lib/linkCheck';
import type {PageResponse} from '../lib/messages';
import {decodePage} from '../lib/pageText';

const REQUEST_TIMEOUT = 8000;

export async function fetchPage(url: string): Promise<PageResponse> {
  try {
    // No cookies: only the public markup is needed
    const response = await fetch(url, {credentials: 'omit', signal: AbortSignal.timeout(REQUEST_TIMEOUT)});
    const contentType = response.headers.get('content-type') ?? '';
    // Markup and manifests (some sites serve them as plain text); images and the rest aren't needed as text
    const readable = response.ok && /html|json|^text\//.test(contentType);
    // In the page's own charset: response.text() would read a windows-1251 page as UTF-8 garbage
    const text = readable ? decodePage(await response.arrayBuffer(), contentType) : '';
    if (!readable) await response.body?.cancel();
    return {ok: response.ok, status: response.status, url: response.url || url, contentType, text};
  } catch (error) {
    return {error: error instanceof Error ? error.message : String(error)};
  }
}

export async function checkLinkHere(url: string, timeout?: number): Promise<LinkCheck> {
  try {
    return await checkLink(url, {signal: new AbortController().signal, timeout});
  } catch {
    return {problem: 'unreachable'};
  }
}
