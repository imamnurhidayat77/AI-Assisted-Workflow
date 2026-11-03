import { execFile } from 'node:child_process';

// True OCR via system Tesseract (offline, tanpa API key / unduhan).
// Batasan yang diketahui: Leptonica di image ini TIDAK membaca PDF —
// PDF scan terdeteksi sebagai "scanned" (teks < ambang) dan diarahkan
// user untuk upload ulang sebagai gambar/teks, bukan di-OCR diam-diam.

const TIMEOUT_MS = 30_000;

export const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp']);

export function isImageExt(ext: string): boolean {
  return IMAGE_EXTS.has(ext.toLowerCase());
}

/** OCR buffer gambar → teks, atau null bila tesseract tak ada / gagal / kosong. */
export function ocrImageBuffer(buf: Buffer): Promise<string | null> {
  if (!buf?.length || buf.length > 20 * 1024 * 1024) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), TIMEOUT_MS + 5_000);
    const child = execFile(
      'tesseract',
      ['stdin', 'stdout', '-l', 'eng', '--psm', '6'],
      { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        clearTimeout(timer);
        if (err) return resolve(null);
        const text = String(stdout ?? '').trim();
        resolve(text.length >= 2 ? text : null);
      },
    );
    child.stdin?.on('error', () => resolve(null));
    try {
      child.stdin?.end(buf);
    } catch {
      resolve(null);
    }
  });
}
