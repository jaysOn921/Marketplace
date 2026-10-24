import { formatMoney, type OrderAction, type OrderDetail } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert } from '../../components/Form';
import { OrderStatusBadge, PaymentBadge } from '../../components/OrderStatusBadge';
import { apiErrors } from '../../lib/forms';
import { useStartConversation } from '../../lib/messaging';
import { useOrder, useOrderAction } from '../../lib/orders';
import { ReviewSection } from './ReviewSection';

const FLAG = { TZ: '🇹🇿', ZM: '🇿🇲' } as const;

/** The saved rate the way people quote it, "K 1 = TSh 131.04", whichever way the order converted. */
function rateLabel(order: OrderDetail) {
  const tshPerKwacha = order.currency === 'ZMW' ? order.fxRate : 1 / order.fxRate;
  return `K 1 = TSh ${tshPerKwacha.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function Actions({ order }: { order: OrderDetail }) {
  const { t } = useTranslation();
  const act = useOrderAction(order.id);
  const [asking, setAsking] = useState<'decline' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const error = apiErrors(act.error);
  if (!order.actions.length) return null;

  const run = (action: OrderAction, withReason?: string) =>
    act.mutate(
      { action, reason: withReason },
      {
        onSuccess: () => {
          setAsking(null);
          setReason('');
        },
      },
    );

  function onReason(e: FormEvent) {
    e.preventDefault();
    if (asking) run(asking, reason.trim() || undefined);
  }

  const primary =
    'rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60';
  const secondary =
    'rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-medium hover:bg-stone-50 disabled:opacity-60';
  const danger =
    'rounded-lg px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60';
  const label = (a: OrderAction) => t(`order.actions.${a}`);

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      {(error.message || error.fields.reason) && (
        <Alert>{error.fields.reason ?? error.message}</Alert>
      )}
      {asking ? (
        <form onSubmit={onReason} className="space-y-2">
          <label htmlFor="order-reason" className="block text-sm font-medium">
            {t(asking === 'decline' ? 'order.reason.decline' : 'order.reason.cancel')}
          </label>
          <textarea
            id="order-reason"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={act.isPending}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
            >
              {label(asking)}
            </button>
            <button
              type="button"
              onClick={() => setAsking(null)}
              className="rounded-lg px-4 py-2 text-sm hover:bg-stone-100"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {order.actions.map((a) =>
            a === 'decline' || a === 'cancel' ? (
              <button
                key={a}
                type="button"
                disabled={act.isPending}
                onClick={() => setAsking(a)}
                className={danger}
              >
                {label(a)}
              </button>
            ) : (
              <button
                key={a}
                type="button"
                disabled={act.isPending}
                onClick={() => run(a)}
                className={a === 'mark-paid' || a === 'report-paid' ? secondary : primary}
              >
                {label(a)}
              </button>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function MessageLink({ order }: { order: OrderDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const start = useStartConversation();
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState('');
  const label = t(order.role === 'buyer' ? 'order.messageSeller' : 'order.messageBuyer');
  if (order.conversationId) {
    return (
      <Link
        to={`/messages/${order.conversationId}`}
        className="mt-3 inline-block rounded-lg border border-stone-300 px-3 py-1.5 font-medium hover:bg-stone-50"
      >
        {label}
      </Link>
    );
  }
  if (!writing) {
    return (
      <button
        type="button"
        onClick={() => setWriting(true)}
        className="mt-3 rounded-lg border border-stone-300 px-3 py-1.5 font-medium hover:bg-stone-50"
      >
        {label}
      </button>
    );
  }
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        start.mutate(
          {
            listingId: order.listingId,
            body: body.trim(),
            ...(order.role === 'seller' ? { buyerId: order.buyer.id } : {}),
          },
          { onSuccess: (d) => navigate(`/messages/${d.conversation.id}`) },
        );
      }}
    >
      <label htmlFor="order-message" className="sr-only">
        {label}
      </label>
      <textarea
        id="order-message"
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="block w-full rounded-lg border border-stone-300 px-3 py-2"
        autoFocus
      />
      {start.isError && <Alert>{apiErrors(start.error).message}</Alert>}
      <button
        type="submit"
        disabled={!body.trim() || start.isPending}
        className="rounded-lg bg-brand-700 px-3 py-1.5 font-medium text-white disabled:opacity-50"
      >
        {t('messages.send')}
      </button>
    </form>
  );
}

function Contact({ order }: { order: OrderDetail }) {
  const { t } = useTranslation();
  const other = order.role === 'buyer' ? order.seller : order.buyer;
  const shared = ['ACCEPTED', 'READY', 'COMPLETED'].includes(order.status);
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
      <h2 className="font-semibold">
        {t(order.role === 'buyer' ? 'order.seller' : 'order.buyer')}
      </h2>
      <p className="mt-1">
        <span aria-hidden="true">{FLAG[other.countryCode]} </span>
        {other.shopSlug ? (
          <Link
            to={`/shop/${other.shopSlug}`}
            className="font-medium text-brand-800 hover:underline"
          >
            {other.shopName}
          </Link>
        ) : (
          <span className="font-medium">{other.name}</span>
        )}
        {other.shopName && <span className="text-stone-500"> ({other.name})</span>}
      </p>
      {shared ? (
        other.phone ? (
          <p className="mt-1">
            {t('order.phone')}{' '}
            <a href={`tel:${other.phone}`} className="font-medium text-brand-700 hover:underline">
              {other.phone}
            </a>
          </p>
        ) : (
          <p className="mt-1 text-stone-600">{t('order.noPhone')}</p>
        )
      ) : (
        <p className="mt-1 text-stone-600">{t('order.contactAfterAccept')}</p>
      )}
      <MessageLink order={order} />
    </section>
  );
}

export function OrderPage() {
  const { t, i18n } = useTranslation();
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const { data: order, isPending, isError } = useOrder(id);
  const when = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  if (isPending) return <p className="text-stone-500">{t('common.loading')}</p>;
  if (isError || !order) return <Alert>{t('order.notFound')}</Alert>;

  const converted = order.buyerCurrency !== order.currency;
  const otherCountry = order.seller.countryCode === 'TZ' ? 'ZM' : 'TZ';
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link
          to={`/orders?role=${order.role === 'buyer' ? 'buying' : 'selling'}`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← {t('orders.title')}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{t('order.title', { id: order.id })}</h1>
          <OrderStatusBadge status={order.status} />
          <PaymentBadge status={order.paymentStatus} />
        </div>
        <p className="text-sm text-stone-500">
          {t('order.placedOn', { date: when(order.createdAt) })}
        </p>
      </div>

      {params.get('placed') && order.status === 'PLACED' && (
        <Alert kind="success">{t('order.placedNotice')}</Alert>
      )}
      <Alert kind="info">{t(`order.next.${order.role}.${order.status}`)}</Alert>
      {order.buyerPaidAt && order.paymentStatus === 'UNPAID' && (
        <Alert kind="info">
          {t(`order.buyerPaidNotice.${order.role}`, { date: when(order.buyerPaidAt) })}
        </Alert>
      )}
      {order.receivedAt && order.status !== 'COMPLETED' && (
        <Alert kind="success">
          {t(`order.receivedNotice.${order.role}`, { date: when(order.receivedAt) })}
        </Alert>
      )}
      {order.cancelReason && (
        <Alert>
          <span className="font-medium">{t('order.reasonLabel')}</span> {order.cancelReason}
        </Alert>
      )}

      <Actions order={order} />
      <ReviewSection order={order} />

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <ul className="divide-y divide-stone-100" aria-label={t('order.items')}>
          {order.items.map((item) => (
            <li key={item.listingId} className="flex gap-4 py-3 first:pt-0">
              {item.coverImage ? (
                <img
                  src={item.coverImage.thumbUrl}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="h-20 w-20 shrink-0 rounded-lg bg-stone-100" />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <Link
                  to={`/listings/${item.listingId}`}
                  className="font-medium hover:text-brand-700"
                >
                  {item.title}
                </Link>
                <p className="mt-1 text-stone-600 tabular-nums">
                  {t('order.qtyTimesPrice', {
                    quantity: item.quantity,
                    price: formatMoney(item.unitPrice, order.currency),
                  })}
                </p>
              </div>
              <p className="text-sm font-medium tabular-nums">
                {formatMoney(item.lineTotal, order.currency)}
              </p>
            </li>
          ))}
        </ul>
        <div className="border-t border-stone-100 pt-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="font-semibold">{t('buy.total')}</dt>
            <dd className="text-right font-semibold tabular-nums">
              {formatMoney(order.total, order.currency)}
            </dd>
            {converted && (
              <>
                <dt className="text-stone-500">
                  {t('order.inCurrency', { currency: order.buyerCurrency })}
                </dt>
                <dd className="text-right tabular-nums">
                  ≈ {formatMoney(order.buyerTotal, order.buyerCurrency)}
                </dd>
              </>
            )}
          </dl>
          {converted && (
            <p className="mt-2 text-xs text-stone-500">
              {t('order.rateSaved', {
                rate: rateLabel(order),
                date: when(order.createdAt),
              })}
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <section className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">{t('buy.delivery')}</h2>
          <p className="mt-1">
            {t(
              order.role === 'seller'
                ? `order.sellerMethod.${order.deliveryMethod}`
                : `buy.method.${order.deliveryMethod}`,
              {
                town: order.sellerTown,
                country: t(`countries.${order.buyer.countryCode}`),
                from: t(`countries.${otherCountry}`),
              },
            )}
          </p>
          {order.deliveryNotes && (
            <p className="mt-1 whitespace-pre-line text-stone-600">{order.deliveryNotes}</p>
          )}
          {order.buyerNote && (
            <p className="mt-2 text-stone-700">
              <span className="font-medium">{t('order.buyerNote')}</span> {order.buyerNote}
            </p>
          )}
          {order.deliveryMethod === 'CROSS_BORDER' && (
            <p className="mt-2 text-xs text-stone-500">{t('listing.crossBorder.customs')}</p>
          )}
        </section>
        <Contact order={order} />
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
        <h2 className="font-semibold">{t('order.timeline')}</h2>
        <ol className="mt-2 space-y-2 border-l-2 border-stone-200 pl-4">
          {order.events.map((e, i) => (
            <li key={i}>
              <p>
                <span className="font-medium">{t(`order.event.${e.type}`)}</span>
                {e.actor && (
                  <span className="text-stone-500"> · {t(`order.actor.${e.actor}`)}</span>
                )}
              </p>
              <p className="text-xs text-stone-500">{when(e.createdAt)}</p>
              {e.note && <p className="text-stone-600">“{e.note}”</p>}
            </li>
          ))}
        </ol>
      </section>

      <p className="text-xs text-stone-500">
        {t('order.safety')}{' '}
        <Link to="/help" className="underline">
          {t('footer.help')}
        </Link>
      </p>
    </div>
  );
}
