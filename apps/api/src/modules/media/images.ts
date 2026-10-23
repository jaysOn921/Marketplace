import sharp, { type Metadata, type OutputInfo } from 'sharp';
import { randomToken } from '../../lib/tokens.js';
import { AppError } from '../../lib/errors.js';
import { storage } from './storage.js';

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif', 'gif']);
const FULL_SIZE = 1600;
const THUMB_SIZE = 480;
/** Larger than any phone photo (~60 MP), small enough that a "decompression bomb" can't exhaust memory. */
const MAX_PIXELS = 60_000_000;

export interface StoredImage {
  storageKey: string;
  width: number;
  height: number;
}

/** File names for an image's two sizes. */
export const imageKeys = (storageKey: string) => ({
  full: `${storageKey}-full.webp`,
  thumb: `${storageKey}-thumb.webp`,
});

/**
 * Checks that the upload really is an image (by decoding it, not trusting the file name),
 * then stores a full-size and a thumbnail WebP. Re-encoding strips EXIF data such as GPS
 * location, and applies the photo's rotation.
 */
export async function processAndStoreImage(input: Buffer, keyPrefix: string): Promise<StoredImage> {
  let meta: Metadata | undefined;
  try {
    // Reading the header decodes no pixels; the size is checked below.
    meta = await sharp(input, { limitInputPixels: false }).metadata();
  } catch {
    meta = undefined;
  }
  if (!meta?.format || !ACCEPTED_FORMATS.has(meta.format)) {
    throw AppError.badRequest('Upload photos as JPEG, PNG, WebP or HEIC images.');
  }
  // Checked from the header, before anything is decoded.
  if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_PIXELS) {
    throw AppError.badRequest('This photo is too large. Use one under 60 megapixels.');
  }

  const storageKey = `${keyPrefix}/${randomToken().slice(0, 16)}`;
  const keys = imageKeys(storageKey);
  const base = () =>
    sharp(input, { failOn: 'error', limitInputPixels: MAX_PIXELS, pages: 1 }).rotate();

  let full: { data: Buffer; info: OutputInfo };
  let thumb: Buffer;
  try {
    full = await base()
      .resize({ width: FULL_SIZE, height: FULL_SIZE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    thumb = await base()
      .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'cover' })
      .webp({ quality: 72 })
      .toBuffer();
  } catch {
    // The header looked fine but the image data is damaged.
    throw AppError.badRequest('This photo could not be read. Try another one.');
  }

  await storage.put(keys.full, full.data, 'image/webp');
  await storage.put(keys.thumb, thumb, 'image/webp');
  return { storageKey, width: full.info.width, height: full.info.height };
}

export async function removeImage(storageKey: string) {
  const keys = imageKeys(storageKey);
  await Promise.all([storage.remove(keys.full), storage.remove(keys.thumb)]);
}
