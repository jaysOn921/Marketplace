import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { config } from '../../config.js';

/**
 * Where image files live. Local disk for now; an S3/R2 driver can implement the same
 * interface later without touching the listings code.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Removes every file whose key starts with the prefix. */
  removePrefix(prefix: string): Promise<void>;
  remove(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export const UPLOADS_URL_PREFIX = '/uploads';

function safePath(root: string, key: string) {
  const path = normalize(join(root, key));
  if (!path.startsWith(normalize(root))) throw new Error(`Invalid storage key: ${key}`);
  return path;
}

export function localDiskStorage(root: string): StorageDriver {
  return {
    async put(key, data) {
      const path = safePath(root, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    },
    async remove(key) {
      await rm(safePath(root, key), { force: true });
    },
    async removePrefix(prefix) {
      await rm(safePath(root, prefix), { recursive: true, force: true });
    },
    publicUrl(key) {
      return `${UPLOADS_URL_PREFIX}/${key}`;
    },
  };
}

export const storage: StorageDriver = localDiskStorage(config.UPLOAD_DIR);
