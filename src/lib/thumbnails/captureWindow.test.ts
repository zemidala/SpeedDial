import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cornerBounds, isFlatImage, type TabStatusSource, waitForSettledLoad} from './captureWindow';

describe('waitForSettledLoad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A tab whose status the test changes; `initial` is what current() answers */
  function fakeTab(initial: string | undefined) {
    const listeners = new Set<(status: string) => void>();
    const source: TabStatusSource = {
      current: () => Promise.resolve(initial),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const emit = (status: string) => listeners.forEach((listener) => listener(status));
    return {source, emit, listeners};
  }

  /** Resolves `done` when the wait ends, so the test can check it at any moment */
  function start(source: TabStatusSource) {
    const state = {done: false};
    void waitForSettledLoad(source, {settle: 1000, timeout: 10_000}).then(() => {
      state.done = true;
    });
    return state;
  }

  it('an already loaded page — after the settle time', async () => {
    const tab = fakeTab('complete');
    const state = start(tab.source);
    await vi.advanceTimersByTimeAsync(999);
    expect(state.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.done).toBe(true);
    expect(tab.listeners.size).toBe(0);
  });

  it('loading again after "complete" (a redirect) — the settle time starts over', async () => {
    const tab = fakeTab('loading');
    const state = start(tab.source);
    await vi.advanceTimersByTimeAsync(100);
    tab.emit('complete');
    await vi.advanceTimersByTimeAsync(800);
    tab.emit('loading');
    await vi.advanceTimersByTimeAsync(2000);
    expect(state.done).toBe(false);
    tab.emit('complete');
    await vi.advanceTimersByTimeAsync(999);
    expect(state.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.done).toBe(true);
  });

  it('a page that never settles — captured at the timeout', async () => {
    const tab = fakeTab('loading');
    const state = start(tab.source);
    await vi.advanceTimersByTimeAsync(9999);
    expect(state.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.done).toBe(true);
  });

  it('the tab is gone — no waiting', async () => {
    const state = start(fakeTab(undefined).source);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.done).toBe(true);
  });
});

describe('cornerBounds', () => {
  it('puts the window into the bottom-right corner of the browser window', () => {
    expect(cornerBounds({left: 100, top: 50, width: 1900, height: 1000}, 1280, 800))
      .toEqual({left: 720, top: 250, width: 1280, height: 800});
  });

  it('a browser window smaller than the screenshot: the window shrinks to fit inside it', () => {
    expect(cornerBounds({left: 10, top: 20, width: 800, height: 600}, 1280, 800))
      .toEqual({left: 10, top: 20, width: 800, height: 600});
    expect(cornerBounds({left: 0, top: 0, width: 1000, height: 600}, 1280, 800))
      .toEqual({left: 0, top: 0, width: 1000, height: 600});
  });

  it('without the browser window\'s bounds — the top-left of the screen', () => {
    expect(cornerBounds(undefined, 1280, 800)).toEqual({left: 0, top: 0, width: 1280, height: 800});
    expect(cornerBounds({left: 0, top: 0}, 1280, 800)).toEqual({left: 0, top: 0, width: 1280, height: 800});
  });
});

describe('isFlatImage', () => {
  const pixels = (...colors: number[][]) => new Uint8ClampedArray(colors.flatMap((rgb) => [...rgb, 255]));

  it('one colour (small noise allowed) — flat', () => {
    expect(isFlatImage(pixels([0, 0, 0], [0, 0, 0], [3, 2, 1]))).toBe(true);
    expect(isFlatImage(pixels([255, 255, 255]))).toBe(true);
  });

  it('anything drawn on it — not flat', () => {
    expect(isFlatImage(pixels([255, 255, 255], [255, 255, 255], [30, 30, 30]))).toBe(false);
  });
});
