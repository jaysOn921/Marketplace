import type { SellerTrust as Trust } from '@tzed/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

/** "✓ Verified seller": an icon plus words, never colour alone. */
export function VerifiedBadge({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-brand-50 font-medium text-brand-800 ${
        compact ? 'px-1.5 text-[11px] leading-5' : 'px-2 py-0.5 text-xs'
      }`}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-brand-700">
        <path d="M10 1.5l2.2 1.6 2.7-.1.9 2.6 2.2 1.6-.8 2.6.8 2.6-2.2 1.6-.9 2.6-2.7-.1L10 18.5l-2.2-1.6-2.7.1-.9-2.6-2.2-1.6.8-2.6-.8-2.6 2.2-1.6.9-2.6 2.7.1z" />
        <path
          d="M6.5 10.2l2.3 2.3 4.7-4.8"
          className="fill-none stroke-white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {t(compact ? 'trust.verifiedShort' : 'trust.verified')}
    </span>
  );
}

/** Completed sales and reply time, plus what "verified" means. */
export function SellerTrustLines({ trust }: { trust: Trust }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-0.5 text-sm text-stone-700">
      {trust.verified && (
        <li className="text-xs text-stone-600">
          {t('trust.verifiedMeans')}{' '}
          <Link to="/help?q=verified" className="underline">
            {t('trust.learnMore')}
          </Link>
        </li>
      )}
      <li>{t('trust.completed', { count: trust.completedOrders })}</li>
      {trust.replyTime && <li>{t(`trust.reply.${trust.replyTime}`)}</li>}
    </ul>
  );
}
