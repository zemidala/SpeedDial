import {describe, expect, it} from 'vitest';
import {isNewerVersion} from './updates';

describe('isNewerVersion', () => {
  it('compares the parts as numbers', () => {
    expect(isNewerVersion('2.0.0.45', '2.0.0.9')).toBe(true);
    expect(isNewerVersion('2.1.0', '2.0.0.99')).toBe(true);
    expect(isNewerVersion('2.0.0.9', '2.0.0.45')).toBe(false);
  });

  it('an equal version is not newer, a missing part counts as zero', () => {
    expect(isNewerVersion('2.0.0.41', '2.0.0.41')).toBe(false);
    expect(isNewerVersion('2.0.0', '2.0.0.0')).toBe(false);
    expect(isNewerVersion('2.0.0.1', '2.0.0')).toBe(true);
  });
});
