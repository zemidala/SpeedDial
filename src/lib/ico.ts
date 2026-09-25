// Разбор .ico: файл содержит несколько картинок разного размера, берём самую крупную

export interface IcoImage {
  /** Сторона картинки в пикселях */
  size: number;
  data: Uint8Array<ArrayBuffer>;
  type: 'image/png' | 'image/x-icon';
}

const HEADER_SIZE = 6;
const ENTRY_SIZE = 16;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
}

/** Размер из заголовка PNG (IHDR); запись в ICO хранит размер в одном байте, 0 означает «256 и больше» */
function pngSize(bytes: Uint8Array): number {
  if (bytes.length < 24) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Math.min(view.getUint32(16), view.getUint32(20));
}

export function isIco(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < HEADER_SIZE) return false;
  const view = new DataView(buffer);
  return view.getUint16(0, true) === 0 && view.getUint16(2, true) === 1 && view.getUint16(4, true) > 0;
}

/** Самая крупная картинка из .ico; null, если файл повреждён */
export function extractLargestIcoImage(buffer: ArrayBuffer): IcoImage | null {
  if (!isIco(buffer)) return null;
  const view = new DataView(buffer);
  const count = view.getUint16(4, true);

  let best: {size: number; bitDepth: number; entryOffset: number; dataOffset: number; dataSize: number} | null = null;
  for (let i = 0; i < count; i++) {
    const entryOffset = HEADER_SIZE + i * ENTRY_SIZE;
    if (entryOffset + ENTRY_SIZE > buffer.byteLength) break;

    const dataSize = view.getUint32(entryOffset + 8, true);
    const dataOffset = view.getUint32(entryOffset + 12, true);
    if (dataSize === 0 || dataOffset + dataSize > buffer.byteLength) continue;

    const data = new Uint8Array(buffer, dataOffset, dataSize);
    const declared = Math.min(view.getUint8(entryOffset) || 256, view.getUint8(entryOffset + 1) || 256);
    const size = isPng(data) ? pngSize(data) || declared : declared;
    const bitDepth = view.getUint16(entryOffset + 6, true);

    if (!best || size > best.size || (size === best.size && bitDepth > best.bitDepth)) {
      best = {size, bitDepth, entryOffset, dataOffset, dataSize};
    }
  }
  if (!best) return null;

  const data = new Uint8Array(buffer, best.dataOffset, best.dataSize);
  if (isPng(data)) return {size: best.size, data: data.slice(), type: 'image/png'};

  // Картинка в формате BMP: собираем .ico из одной этой записи, чтобы браузер показал именно её
  const single = new Uint8Array(HEADER_SIZE + ENTRY_SIZE + best.dataSize);
  const singleView = new DataView(single.buffer);
  singleView.setUint16(2, 1, true); // Тип: иконка
  singleView.setUint16(4, 1, true); // Одна запись
  single.set(new Uint8Array(buffer, best.entryOffset, ENTRY_SIZE), HEADER_SIZE);
  singleView.setUint32(HEADER_SIZE + 12, HEADER_SIZE + ENTRY_SIZE, true); // Новое смещение данных
  single.set(data, HEADER_SIZE + ENTRY_SIZE);
  return {size: best.size, data: single, type: 'image/x-icon'};
}
