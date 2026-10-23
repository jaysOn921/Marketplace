import type { OrderStatus, PaymentStatus } from '@tzed/shared';
import { useTranslation } from 'react-i18next';

const STYLES: Record<OrderStatus, string> = {
  PLACED: 'bg-amber-100 text-amber-900',
  ACCEPTED: 'bg-sky-100 text-sky-800',
  READY: 'bg-violet-100 text-violet-800',
  COMPLETED: 'bg-brand-100 text-brand-800',
  DECLINED: 'bg-stone-200 text-stone-700',
  CANCELLED: 'bg-stone-200 text-stone-700',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {t(`orderStatus.${status}`)}
    </span>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        status === 'PAID_OFFLINE' ? 'bg-brand-100 text-brand-800' : 'bg-stone-100 text-stone-600'
      }`}
    >
      {t(`paymentStatus.${status}`)}
    </span>
  );
}
