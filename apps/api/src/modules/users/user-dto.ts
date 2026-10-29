import type { SessionUser } from '@tzed/shared';
import type { AuthUser } from '../../middleware/auth.js';

export function toSessionUser(user: AuthUser): SessionUser {
  const sp = user.sellerProfile;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    countryCode: user.country.code as SessionUser['countryCode'],
    currency: user.country.currencyCode as SessionUser['currency'],
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    marketingEmails: user.marketingOptInAt !== null,
    createdAt: user.createdAt.toISOString(),
    sellerProfile: sp
      ? {
          shopName: sp.shopName,
          slug: sp.slug,
          bio: sp.bio,
          regionId: sp.regionId,
          regionName: sp.region?.name ?? null,
          town: sp.town,
          contactPreference: sp.contactPreference,
        }
      : null,
  };
}
