import {describe, expect, it} from 'vitest';
import {checkLink, classifyStatus, runPool} from './linkCheck';

/** A fake fetch: status per method, or a network error; records the requests */
function fakeFetch(answers: {HEAD?: number | 'error' | 'hang'; GET?: number | 'error' | 'hang'}) {
  const requests: string[] = [];
  const fetcher = (_url: string, init: RequestInit) => {
    const method = init.method as 'HEAD' | 'GET';
    requests.push(method);
    const answer = answers[method];
    if (answer === 'error') return Promise.reject(new TypeError('Failed to fetch'));
    if (answer === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }
    return Promise.resolve(new Response(null, {status: answer ?? 200}));
  };
  return {fetcher, requests};
}

const signal = new AbortController().signal;

describe('classifyStatus', () => {
  it('counts only a missing page and server errors', () => {
    expect(classifyStatus(404)).toBe('notFound');
    expect(classifyStatus(410)).toBe('notFound');
    expect(classifyStatus(500)).toBe('serverError');
    expect(classifyStatus(503)).toBe('serverError');
    for (const status of [200, 204, 301, 400, 401, 403, 405, 429]) expect(classifyStatus(status)).toBeNull();
  });
});

describe('checkLink', () => {
  it('a successful HEAD is enough', async () => {
    const {fetcher, requests} = fakeFetch({HEAD: 200});
    expect(await checkLink('https://a.example/', {signal, fetcher})).toEqual({problem: null, status: 200});
    expect(requests).toEqual(['HEAD']);
  });

  it('asks again with GET when HEAD fails: sites that don\'t support HEAD work', async () => {
    const {fetcher, requests} = fakeFetch({HEAD: 405, GET: 200});
    expect(await checkLink('https://a.example/', {signal, fetcher})).toEqual({problem: null, status: 200});
    expect(requests).toEqual(['HEAD', 'GET']);
  });

  it('a missing page and a server error', async () => {
    expect(await checkLink('https://a.example/', {signal, fetcher: fakeFetch({HEAD: 404, GET: 404}).fetcher}))
      .toEqual({problem: 'notFound', status: 404});
    expect(await checkLink('https://a.example/', {signal, fetcher: fakeFetch({HEAD: 502, GET: 502}).fetcher}))
      .toEqual({problem: 'serverError', status: 502});
  });

  it('no answer or a timeout to both requests — unreachable', async () => {
    expect(await checkLink('https://a.example/', {signal, fetcher: fakeFetch({HEAD: 'error', GET: 'error'}).fetcher}))
      .toEqual({problem: 'unreachable'});
    expect(await checkLink('https://a.example/', {signal, fetcher: fakeFetch({HEAD: 'hang', GET: 'hang'}).fetcher, timeout: 10}))
      .toEqual({problem: 'unreachable'});
  });

  it('a server that drops HEAD but gives the page works', async () => {
    const {fetcher, requests} = fakeFetch({HEAD: 'error', GET: 200});
    expect(await checkLink('https://a.example/', {signal, fetcher})).toEqual({problem: null, status: 200});
    expect(requests).toEqual(['HEAD', 'GET']);
  });

  it('stopping the check isn\'t reported as a broken link', async () => {
    const controller = new AbortController();
    const result = checkLink('https://a.example/', {signal: controller.signal, fetcher: fakeFetch({HEAD: 'hang'}).fetcher});
    controller.abort();
    await expect(result).rejects.toThrow();
  });
});

describe('runPool', () => {
  it('runs at most the given number at once and handles everything', async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, signal, async (item) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      done.push(item);
    });
    expect(peak).toBe(3);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('takes no new items after stopping', async () => {
    const controller = new AbortController();
    const done: number[] = [];
    await runPool([1, 2, 3, 4], 1, controller.signal, async (item) => {
      done.push(item);
      if (item === 2) controller.abort();
    });
    expect(done).toEqual([1, 2]);
  });
});
