import sharp from 'sharp';
import { randomToken } from '../../lib/tokens.js';
import { AppError } from '../../lib/errors.js';
import { storage } from './storage.js';

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif', 'gif']);
const FULL_SIZE = 1600;
const THUMB_SIZE = 480;

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
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    format = undefined;
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw AppError.badRequest('Upload photos as JPEG, PNG, WebP or HEIC images.');
  }

  const storageKey = `${keyPrefix}/${randomToken().slice(0, 16)}`;
  const keys = imageKeys(storageKey);
  const base = () => sharp(input, { failOn: 'error' }).rotate();

  const full = await base()
    .resize({ width: FULL_SIZE, height: FULL_SIZE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base()
    .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'cover' })
    .webp({ quality: 72 })
    .toBuffer();

  await storage.put(keys.full, full.data, 'image/webp');
  await storage.put(keys.thumb, thumb, 'image/webp');
  return { storageKey, width: full.info.width, height: full.info.height };
}

export async function removeImage(storageKey: string) {
  const keys = imageKeys(storageKey);
  await Promise.all([storage.remove(keys.full), storage.remove(keys.thumb)]);
}
