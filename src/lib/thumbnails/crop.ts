// The crop frame for a thumbnail: which part of an image goes onto the tile. Geometry in image pixels — no Svelte,
// no DOM, tested on its own. The frame always keeps the proportions of the tile's picture area (aspect = width/height)

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** A narrower frame turns into mush on a tile */
export const MIN_CROP_WIDTH = 80;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The largest frame that fits, centred across and at the top: pages start at the top */
export function initialCrop(imageWidth: number, imageHeight: number, aspect: number): CropRect {
  const width = Math.min(imageWidth, imageHeight * aspect);
  return {x: (imageWidth - width) / 2, y: 0, width, height: width / aspect};
}

/** Moves the frame, keeping it inside the image */
export function moveCrop(rect: CropRect, dx: number, dy: number, imageWidth: number, imageHeight: number): CropRect {
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, imageWidth - rect.width),
    y: clamp(rect.y + dy, 0, imageHeight - rect.height),
  };
}

/**
 * Resizes the frame by dragging a corner; the opposite corner stays put. Of the two directions of the drag, the one
 * that moved more decides the size, so dragging along either side works
 */
export function resizeCrop(
  rect: CropRect,
  corner: Corner,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
  aspect: number,
): CropRect {
  const east = corner === 'ne' || corner === 'se';
  const south = corner === 'sw' || corner === 'se';
  const anchorX = east ? rect.x : rect.x + rect.width;
  const anchorY = south ? rect.y : rect.y + rect.height;

  const byX = east ? dx : -dx;
  const byY = (south ? dy : -dy) * aspect;
  const grow = Math.abs(byX) >= Math.abs(byY) ? byX : byY;

  const roomX = east ? imageWidth - anchorX : anchorX;
  const roomY = south ? imageHeight - anchorY : anchorY;
  const maxWidth = Math.min(roomX, roomY * aspect);
  const minWidth = Math.min(MIN_CROP_WIDTH, maxWidth);
  const width = clamp(rect.width + grow, minWidth, maxWidth);
  const height = width / aspect;
  return {
    x: east ? anchorX : anchorX - width,
    y: south ? anchorY : anchorY - height,
    width,
    height,
  };
}

/** Whole pixels for drawing: inside the image and at least 1×1 */
export function roundCrop(rect: CropRect, imageWidth: number, imageHeight: number): CropRect {
  const x = clamp(Math.round(rect.x), 0, imageWidth - 1);
  const y = clamp(Math.round(rect.y), 0, imageHeight - 1);
  return {
    x,
    y,
    width: clamp(Math.round(rect.width), 1, imageWidth - x),
    height: clamp(Math.round(rect.height), 1, imageHeight - y),
  };
}
