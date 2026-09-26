// Downscaling images before saving. Works both on pages and in the service worker

export const THUMBNAIL_WIDTH = 800;
export const THUMBNAIL_HEIGHT = 500;

/**
 * Fills width×height with the top of the image: a screenshot of a window of any shape becomes a thumbnail
 * of the usual proportions, and what's cut off is the bottom of the page, not its header
 */
export async function coverTop(source: Blob, width: number, height: number, type = 'image/jpeg', quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const sourceWidth = Math.min(bitmap.width, bitmap.height * (width / height));
  const sourceHeight = sourceWidth * (height / width);
  const scale = Math.min(1, width / sourceWidth);
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(sourceWidth * scale)), Math.max(1, Math.round(sourceHeight * scale)));
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, (bitmap.width - sourceWidth) / 2, 0, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.convertToBlob({type, quality});
}

/** Fits the image into maxWidth×maxHeight (without enlarging) and compresses it */
export async function resizeImage(
  source: Blob,
  maxWidth: number,
  maxHeight: number,
  type = 'image/webp',
  quality = 0.85,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.convertToBlob({type, quality});
}
