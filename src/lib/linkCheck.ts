// Checking whether bookmarked pages still open. No Svelte — covered by unit tests with a fake fetch

/** notFound — the site answers that the page is gone; serverError — the site answers with an error (may be temporary);
 *  unreachable — no answer at all: the domain is gone, the connection fails or times out */
export type LinkProblem = 'notFound' | 'serverError' | 'unreachable';

export interface LinkCheck {
  problem: LinkProblem | null;
  /** HTTP status of the answer, if there was one */
  status?: number;
}

export const CHECK_TIMEOUT = 15_000;

/**
 * What an HTTP status means for a bookmark. Only "page gone" and server errors count: 401/403 are closed pages,
 * 429 is a busy site, other 4xx are usually a reaction to a request without the browser's cookies — the page itself works
 */
export function classifyStatus(status: number): LinkProblem | null {
  if (status === 404 || status === 410) return 'notFound';
  if (status >= 500) return 'serverError';
  return null;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

async function request(url: string, method: 'HEAD' | 'GET', fetcher: Fetch, signal: AbortSignal, timeout: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetcher(url, {method, redirect: 'follow', cache: 'no-store', signal: controller.signal});
    return response.status;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    // The body isn't needed — only the status; aborting stops the download
    controller.abort();
  }
}

/**
 * Checks one link: a light HEAD request first; some sites don't support it, so anything but success is re-asked
 * with GET. Stopping the whole check (signal) rejects with the abort error
 */
export async function checkLink(
  url: string,
  {signal, fetcher = fetch, timeout = CHECK_TIMEOUT}: {signal: AbortSignal; fetcher?: Fetch; timeout?: number},
): Promise<LinkCheck> {
  try {
    const head = await request(url, 'HEAD', fetcher, signal, timeout);
    if (head < 400) return {problem: null, status: head};
    const status = await request(url, 'GET', fetcher, signal, timeout);
    return {problem: classifyStatus(status), status};
  } catch (error) {
    if (signal.aborted) throw error;
    return {problem: 'unreachable'};
  }
}

/** Runs worker over items, at most `concurrency` at a time; stops taking new items once signal is aborted */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  signal: AbortSignal,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length && !signal.aborted) {
      const item = items[next++];
      await worker(item);
    }
  };
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, lane));
}
