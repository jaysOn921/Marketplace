import {
  CART_MAX_QUANTITY,
  formatMoney,
  type CartGroup,
  type CartLine,
  type CurrencyCode,
  type DeliveryMethod,
} from '@tzed/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Alert } from '../components/Form';
import { useMe } from '../lib/auth';
import { useCart, useCheckout, useRemoveCartItem, useUpdateCartItem } from '../lib/cart';
import { apiErrors } from '../lib/forms';

interface Choice {
  include: boolean;
  method: DeliveryMethod | '';
  note: string;
}

function Line({ line, currency }: { line: CartLine; currency: CurrencyCode }) {
  const { t } = useTranslation();
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const max = Math.max(line.quantity, Math.min(line.available, CART_MAX_QUANTITY));
  const error = apiErrors(update.error ?? remove.error).message;
  return (
    <li className="flex gap-3 py-3">
      {line.coverImage ? (
        <img src={line.coverImage.thumbUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
      ) : (
        <div className="h-16 w-16 shrink-0 rounded-lg bg-stone-100" />
      )}
      <div className="min-w-0 flex-1 text-sm">
        <Link to={`/listings/${line.listingId}`} className="font-medium hover:text-brand-700">
          {line.title}
        </Link>
        <p className="text-stone-500">
          {t('cart.each', { price: formatMoney(line.unitPrice, currency) })}
        </p>
        {line.problem && (
          <p className="mt-1 text-red-700">
            {t(`cart.problem.${line.problem}`, { count: line.available })}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {line.problem !== 'UNAVAILABLE' && line.problem !== 'NOT_IN_YOUR_COUNTRY' && (
            <label className="flex items-center gap-2">
              <span className="text-stone-600">{t('buy.quantity')}</span>
              <select
                value={line.quantity}
                disabled={update.isPending}
                onChange={(e) =>
                  update.mutate({ listingId: line.listingId, quantity: Number(e.target.value) })
                }
                className="rounded-lg border border-stone-300 bg-white px-2 py-1"
              >
                {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n} disabled={n > line.available}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate(line.listingId)}
            aria-label={t('cart.removeItem', { title: line.title })}
            className="text-brand-700 underline hover:text-brand-800"
          >
            {t('cart.remove')}
          </button>
        </div>
        {error && <p className="mt-1 text-red-700">{error}</p>}
      </div>
      <p className="text-sm font-medium tabular-nums">{formatMoney(line.lineTotal, currency)}</p>
    </li>
  );
}

function SellerGroup({
  group,
  choice,
  onChange,
  buyerCurrency,
  error,
}: {
  group: CartGroup;
  choice: Choice;
  onChange: (c: Choice) => void;
  buyerCurrency: CurrencyCode;
  error?: string;
}) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const shop = group.seller.shopName ?? group.seller.name;
  const orderable = group.items.some((i) => !i.problem);
  const blocked = group.items.some((i) => i.problem);
  const headingId = `seller-${group.seller.id}`;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-stone-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="font-semibold">
          {group.seller.shopSlug ? (
            <Link to={`/shop/${group.seller.shopSlug}`} className="hover:text-brand-700">
              {shop}
            </Link>
          ) : (
            shop
          )}
          <span className="ml-2 text-sm font-normal text-stone-500">
            {t(`countries.${group.seller.countryCode}`)}
          </span>
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={choice.include && orderable && !blocked}
            disabled={!orderable || blocked}
            onChange={(e) => onChange({ ...choice, include: e.target.checked })}
            className="h-4 w-4 accent-brand-700"
          />
          {t('cart.include')}
        </label>
      </div>

      <ul className="divide-y divide-stone-100">
        {group.items.map((line) => (
          <Line key={line.listingId} line={line} currency={group.currency} />
        ))}
      </ul>

      {blocked && orderable && <Alert kind="info">{t('cart.fixFirst')}</Alert>}

      {orderable && !blocked && choice.include && (
        <div className="mt-3 space-y-3 border-t border-stone-100 pt-3">
          {group.deliveryMethods.length ? (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">{t('buy.delivery')}</legend>
              <div className="space-y-1.5">
                {group.deliveryMethods.map((m) => (
                  <label
                    key={m}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
                  >
                    <input
                      type="radio"
                      name={`delivery-${group.seller.id}`}
                      value={m}
                      checked={choice.method === m}
                      onChange={() => onChange({ ...choice, method: m })}
                      className="mt-0.5 accent-brand-700"
                    />
                    <span>
                      {t(`buy.method.${m}`, {
                        town: group.seller.town ?? '',
                        country: me ? t(`countries.${me.countryCode}`) : '',
                        from: t(`countries.${group.seller.countryCode}`),
                      })}
                    </span>
                  </label>
                ))}
              </div>
              {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
            </fieldset>
          ) : (
            <Alert kind="info">{t('cart.noSharedDelivery')}</Alert>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t('buy.note')}</span>
            <textarea
              rows={2}
              maxLength={500}
              value={choice.note}
              onChange={(e) => onChange({ ...choice, note: e.target.value })}
              placeholder={t('buy.notePlaceholder')}
              className="block w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
        </div>
      )}

      <div className="mt-3 flex justify-between border-t border-stone-100 pt-3 text-sm">
        <span className="font-medium">{t('cart.subtotal')}</span>
        <span className="text-right tabular-nums">
          <span className="font-semibold">{formatMoney(group.subtotal, group.currency)}</span>
          {group.currency !== buyerCurrency && group.buyerSubtotal !== null && (
            <span className="block text-stone-600">
              ≈ {formatMoney(group.buyerSubtotal, buyerCurrency)}
            </span>
          )}
        </span>
      </div>
    </section>
  );
}

export function CartPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: cart, isPending } = useCart();
  const checkout = useCheckout();
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [missing, setMissing] = useState<number[]>([]);

  if (isPending || !cart) return <p className="text-stone-600">{t('common.loading')}</p>;

  const choiceFor = (g: CartGroup): Choice =>
    choices[g.seller.id] ?? {
      include: true,
      // One option only: choose it for the buyer.
      method: g.deliveryMethods.length === 1 ? g.deliveryMethods[0]! : '',
      note: '',
    };
  const ready = cart.groups.filter(
    (g) =>
      choiceFor(g).include && g.items.some((i) => !i.problem) && !g.items.some((i) => i.problem),
  );
  const total = ready.reduce<number | null>(
    (sum, g) => (sum === null || g.buyerSubtotal === null ? null : sum + g.buyerSubtotal),
    0,
  );
  const server = apiErrors(checkout.error);

  function placeOrders() {
    const notChosen = ready.filter((g) => !choiceFor(g).method).map((g) => g.seller.id);
    setMissing(notChosen);
    if (notChosen.length || !ready.length) return;
    checkout.mutate(
      {
        orders: ready.map((g) => ({
          sellerId: g.seller.id,
          deliveryMethod: choiceFor(g).method as DeliveryMethod,
          buyerNote: choiceFor(g).note,
        })),
      },
      {
        onSuccess: ({ orderIds }) =>
          navigate(
            orderIds.length === 1
              ? `/orders/${orderIds[0]}?placed=1`
              : `/orders?role=buying&placed=${orderIds.length}`,
          ),
      },
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold">{t('cart.title')}</h1>
      {!cart.groups.length ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-8 text-center">
          <p className="text-stone-600">{t('cart.empty')}</p>
          <Link
            to="/search"
            className="mt-4 inline-block rounded-lg bg-brand-700 px-4 py-2 font-medium text-white hover:bg-brand-800"
          >
            {t('cart.browse')}
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-stone-600">{t('cart.intro')}</p>
          <div className="grid gap-6 lg:grid-cols-[1fr_18rem] lg:items-start">
            <div className="space-y-4">
              {cart.groups.map((g) => (
                <SellerGroup
                  key={g.seller.id}
                  group={g}
                  choice={choiceFor(g)}
                  onChange={(c) => {
                    setChoices({ ...choices, [g.seller.id]: c });
                    if (c.method) setMissing(missing.filter((id) => id !== g.seller.id));
                  }}
                  buyerCurrency={cart.buyerCurrency}
                  error={
                    missing.includes(g.seller.id)
                      ? t('cart.chooseDelivery')
                      : server.fields.deliveryMethod
                  }
                />
              ))}
            </div>
            <aside
              aria-label={t('cart.summary')}
              className="space-y-3 rounded-xl border border-brand-100 bg-white p-4 shadow-sm lg:sticky lg:top-24"
            >
              <h2 className="font-semibold">{t('cart.summary')}</h2>
              <div className="flex justify-between text-sm">
                <span>{t('cart.orders', { count: ready.length })}</span>
                <span className="font-semibold tabular-nums">
                  {total !== null ? `≈ ${formatMoney(total, cart.buyerCurrency)}` : '—'}
                </span>
              </div>
              <p className="text-xs text-stone-500">{t('cart.totalNote')}</p>
              {server.message && <Alert>{server.message}</Alert>}
              {me && !me.emailVerified ? (
                <Alert kind="info">{t('buy.verifyFirst')}</Alert>
              ) : (
                <button
                  type="button"
                  disabled={!ready.length || checkout.isPending}
                  onClick={placeOrders}
                  className="w-full rounded-lg bg-brand-700 px-4 py-2.5 font-medium text-white hover:bg-brand-800 disabled:opacity-60"
                >
                  {checkout.isPending
                    ? t('buy.placing')
                    : t('cart.placeOrders', { count: ready.length })}
                </button>
              )}
              <p className="text-xs text-stone-500">{t('cart.oneOrderEach')}</p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
