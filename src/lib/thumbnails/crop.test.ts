import {describe, expect, it} from 'vitest';
import {initialCrop, MIN_CROP_WIDTH, moveCrop, resizeCrop, roundCrop} from './crop';

describe('initialCrop', () => {
  it('a wide image: the full height, centred across', () => {
    expect(initialCrop(2000, 500, 1.6)).toEqual({x: 600, y: 0, width: 800, height: 500});
  });

  it('a tall image: the full width, at the top', () => {
    expect(initialCrop(800, 2000, 1.6)).toEqual({x: 0, y: 0, width: 800, height: 500});
  });
});

describe('moveCrop', () => {
  const rect = {x: 100, y: 100, width: 400, height: 250};

  it('moves inside the image', () => {
    expect(moveCrop(rect, 50, -30, 1280, 800)).toEqual({x: 150, y: 70, width: 400, height: 250});
  });

  it('stops at the edges', () => {
    expect(moveCrop(rect, -500, 2000, 1280, 800)).toEqual({x: 0, y: 550, width: 400, height: 250});
  });
});

describe('resizeCrop', () => {
  const rect = {x: 100, y: 100, width: 400, height: 250};

  it('the south-east corner grows the frame, the north-west corner stays', () => {
    expect(resizeCrop(rect, 'se', 160, 0, 1280, 800, 1.6)).toEqual({x: 100, y: 100, width: 560, height: 350});
  });

  it('a vertical drag counts too, in proportion', () => {
    expect(resizeCrop(rect, 'se', 0, 100, 1280, 800, 1.6)).toEqual({x: 100, y: 100, width: 560, height: 350});
  });

  it('the north-west corner: the south-east corner stays', () => {
    expect(resizeCrop(rect, 'nw', -80, 0, 1280, 800, 1.6)).toEqual({x: 20, y: 50, width: 480, height: 300});
  });

  it('can\'t grow past the image', () => {
    const grown = resizeCrop(rect, 'se', 5000, 0, 1280, 800, 1.6);
    expect(grown).toEqual({x: 100, y: 100, width: 1120, height: 700});
  });

  it('can\'t shrink below the minimum', () => {
    expect(resizeCrop(rect, 'ne', -1000, 0, 1280, 800, 1.6).width).toBe(MIN_CROP_WIDTH);
  });
});

describe('roundCrop', () => {
  it('whole pixels inside the image', () => {
    expect(roundCrop({x: 10.4, y: 0.6, width: 99.5, height: 62.2}, 1280, 800)).toEqual({x: 10, y: 1, width: 100, height: 62});
    expect(roundCrop({x: 1279.7, y: 0, width: 10, height: 10}, 1280, 800)).toEqual({x: 1279, y: 0, width: 1, height: 10});
  });
});
