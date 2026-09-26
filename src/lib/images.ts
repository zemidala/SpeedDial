// Downscaling images before saving. Works both on pages and in the service worker

export const THUMBNAIL_WIDTH = 800;
export const THUMBNAIL_HEIGHT = 500;

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
