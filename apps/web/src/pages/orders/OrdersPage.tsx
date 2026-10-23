import { ORDER_STATUSES, formatMoney, type OrderStatus } from '@tzed/shared';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { OrderStatusBadge, PaymentBadge } from '../../components/OrderStatusBadge';
import { useOrders } from '../../lib/orders';

export function OrdersPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const role = params.get('role') === 'selling' ? 'selling' : 'buying';
  const status = (params.get('status') as OrderStatus | null) ?? undefined;
  const { data, isPending } = useOrders(role, status);
  const selling = useOrders('selling');
  const needsAction = selling.data?.needsAction ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('orders.title')}</h1>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200">
        <nav className="flex gap-1" aria-label={t('orders.title')}>
          {(['buying', 'selling'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setParams({ role: r })}
              aria-current={role === r}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
                role === r
                  ? 'border-brand-700 text-brand-800'
                  : 'border-transparent text-stone-600 hover:text-stone-900'
              }`}
            >
              {t(`orders.${r}`)}
              {r === 'selling' && needsAction > 0 && (
                <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-900">
                  {needsAction}
                </span>
              )}
            </button>
          ))}
        </nav>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <span className="text-stone-600">{t('orders.show')}</span>
          <select
            value={status ?? ''}
            onChange={(e) =>
              setParams(e.target.value ? { role, status: e.target.value } : { role })
            }
            className="rounded-lg border border-stone-300 bg-white px-2 py-1.5"
          >
            <option value="">{t('orders.allStatuses')}</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`orderStatus.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isPending ? (
        <p className="text-stone-500">{t('common.loading')}</p>
      ) : !data?.orders.length ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
          <p>{t(role === 'buying' ? 'orders.emptyBuying' : 'orders.emptySelling')}</p>
          {role === 'buying' && (
            <Link
              to="/search"
              className="mt-3 inline-block font-medium text-brand-700 hover:underline"
            >
              {t('home.ctaBrowse')}
            </Link>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {data.orders.map((o) => (
            <li key={o.id}>
              <Link
                to={`/orders/${o.id}`}
                className="flex items-center gap-4 p-3 hover:bg-stone-50 sm:p-4"
              >
                {o.coverImage ? (
                  <img
                    src={o.coverImage.thumbUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-lg bg-stone-100" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {o.quantity > 1 && `${o.quantity} × `}
                    {o.title}
                  </p>
                  <p className="truncate text-sm text-stone-500">
                    {t(role === 'buying' ? 'orders.from' : 'orders.to', { name: o.otherParty })} ·{' '}
                    {new Date(o.createdAt).toLocaleDateString(i18n.language, {
                      dateStyle: 'medium',
                    })}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <OrderStatusBadge status={o.status} />
                    <PaymentBadge status={o.paymentStatus} />
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold tabular-nums">{formatMoney(o.total, o.currency)}</p>
                  {o.buyerCurrency !== o.currency && (
                    <p className="text-xs text-stone-500 tabular-nums">
                      ≈ {formatMoney(o.buyerTotal, o.buyerCurrency)}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
