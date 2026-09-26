// Letting the user pick a file and saving a file to disk

/** Opens a file picker; call from a click handler. null — the user changed their mind */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), {once: true});
    input.addEventListener('cancel', () => resolve(null), {once: true});
    input.click();
  });
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The first image from the clipboard; needs the clipboardRead permission */
export async function readClipboardImage(): Promise<Blob | null> {
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type) return item.getType(type);
  }
  return null;
}
