import { z } from 'zod';
import { COUNTRY_CODES } from './constants.js';
import { normalizePhone } from './phone.js';

export const PASSWORD_MIN = 8;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address.' }));
const password = z
  .string()
  .min(PASSWORD_MIN, { error: `Use at least ${PASSWORD_MIN} characters.` })
  .max(128, { error: 'Use at most 128 characters.' });
const name = z
  .string()
  .trim()
  .min(2, { error: 'Enter your name.' })
  .max(100, { error: 'Use at most 100 characters.' });
const countryCode = z.enum(COUNTRY_CODES, { error: 'Choose Tanzania or Zambia.' });
const optionalPhone = z
  .string()
  .trim()
  .max(20)
  .optional()
  .transform((v) => (v ? v : undefined));

const PHONE_EXAMPLE = {
  TZ: 'Enter a Tanzanian number, e.g. 0712 345 678.',
  ZM: 'Enter a Zambian number, e.g. 0977 123 456.',
} as const;

/**
 * Adds a phone check that depends on the chosen country, then normalises the number.
 * The check runs even when other fields are invalid, so every error shows at once.
 */
function withPhone<
  T extends z.ZodObject<{ phone: typeof optionalPhone; countryCode: typeof countryCode }>,
>(schema: T) {
  return schema
    .refine((d) => !d.phone || normalizePhone(d.phone, d.countryCode) !== null, {
      path: ['phone'],
      error: (issue) => PHONE_EXAMPLE[(issue.input as { countryCode: 'TZ' | 'ZM' }).countryCode],
      when: (payload) => {
        const v = payload.value as { phone?: unknown; countryCode?: unknown } | undefined;
        return typeof v?.phone === 'string' && (v.countryCode === 'TZ' || v.countryCode === 'ZM');
      },
    })
    .transform((d) => ({
      ...d,
      phone: d.phone ? (normalizePhone(d.phone, d.countryCode) ?? undefined) : undefined,
    }));
}

export const registerSchema = withPhone(
  z.object({
    name,
    email,
    password,
    countryCode,
    phone: optionalPhone,
    consent: z.literal(true, { error: 'You need to accept the terms and privacy policy.' }),
  }),
);
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: 'Enter your password.' }).max(128),
});
export type LoginInput = z.input<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password,
});

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { error: 'Enter your current password.' }).max(128),
  newPassword: password,
});

export const updateProfileSchema = withPhone(z.object({ name, countryCode, phone: optionalPhone }));
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

export const CONTACT_PREFERENCES = ['MESSAGES', 'PHONE', 'BOTH'] as const;

export const sellerProfileSchema = z.object({
  shopName: z
    .string()
    .trim()
    .min(2, { error: 'Enter a shop name.' })
    .max(80, { error: 'Use at most 80 characters.' }),
  bio: z
    .string()
    .trim()
    .max(1000, { error: 'Use at most 1000 characters.' })
    .optional()
    .transform((v) => (v ? v : null)),
  regionId: z.coerce.number().int().positive({ error: 'Choose your region or province.' }),
  town: z
    .string()
    .trim()
    .min(2, { error: 'Enter your town or city.' })
    .max(80, { error: 'Use at most 80 characters.' }),
  contactPreference: z.enum(CONTACT_PREFERENCES).default('MESSAGES'),
});
export type SellerProfileInput = z.input<typeof sellerProfileSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, { error: 'Enter your password to confirm.' }).max(128),
});
