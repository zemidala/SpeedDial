import {describe, expect, it} from 'vitest';
import {isNewRelease, releaseOf} from './whatsNew';

describe('whatsNew', () => {
  it('the release is the first three parts of the version', () => {
    expect(releaseOf('2.1.0.145')).toBe('2.1.0');
    expect(releaseOf('2.1.0')).toBe('2.1.0');
  });

  it('only a new release counts, not a new build or a fresh install', () => {
    expect(isNewRelease('2.0.0.145', '2.1.0.146')).toBe(true);
    expect(isNewRelease('2.0.0', '2.0.1.3')).toBe(true);
    expect(isNewRelease('2.0.0.145', '2.0.0.146')).toBe(false);
    expect(isNewRelease(undefined, '2.0.0.1')).toBe(false);
  });
});
