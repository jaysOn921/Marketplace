import type { ListingStatus } from '@tzed/shared';
import { useTranslation } from 'react-i18next';

const STYLES: Record<ListingStatus, string> = {
  DRAFT: 'bg-stone-100 text-stone-700',
  PENDING_REVIEW: 'bg-amber-100 text-amber-900',
  ACTIVE: 'bg-brand-100 text-brand-800',
  REJECTED: 'bg-red-100 text-red-800',
  SOLD: 'bg-sky-100 text-sky-800',
  REMOVED: 'bg-stone-200 text-stone-600',
};

export function StatusBadge({ status }: { status: ListingStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {t(`listingStatus.${status}`)}
    </span>
  );
}
