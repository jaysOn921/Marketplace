import { z } from 'zod';
import type { SessionUser } from './api.js';

const code = z
  .string()
  .trim()
  .min(6, { error: 'Enter the 6-digit code from your app, or a backup code.' })
  .max(20, { error: 'Enter the 6-digit code from your app, or a backup code.' });

export const twoStepCodeSchema = z.object({ code });
export type TwoStepCodeInput = z.input<typeof twoStepCodeSchema>;

export const twoStepDisableSchema = z.object({
  password: z.string().min(1, { error: 'Enter your password to confirm.' }).max(128),
  code,
});
export type TwoStepDisableInput = z.input<typeof twoStepDisableSchema>;

export interface TwoStepSetupResponse {
  /** The key to type into the app if the QR code can't be scanned. */
  secret: string;
  /** The link the QR code holds. */
  otpauthUrl: string;
}

export interface BackupCodesResponse {
  /** Shown once: each one signs in once if the phone is lost. */
  backupCodes: string[];
}

/** POST /auth/login: either signed in, or a code is needed next. */
export type LoginResponse =
  | { user: SessionUser; csrfToken: string; twoStepRequired?: false }
  | { user: null; csrfToken: string; twoStepRequired: true };
