import type { ReviewQueueItem } from '@tzed/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert } from '../../components/Form';
import { Price } from '../../components/Price';
import { apiErrors } from '../../lib/forms';
import { useModerate, useReviewQueue } from '../../lib/listings';

const QUICK_REASONS = ['prohibited', 'photos', 'category', 'price', 'details'] as const;
const FLAG = { TZ: '🇹🇿', ZM: '🇿🇲' } as const;

function ReviewCard({ item }: { item: ReviewQueueItem }) {
  const { t, i18n } = useTranslation();
  const moderate = useModerate();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const date = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const error = apiErrors(moderate.error);

  return (
    <article className="rounded-xl border border-stone-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">
            <Link to={`/listings/${item.id}`} className="hover:text-brand-700">
              {item.title}
            </Link>
          </h2>
          <p className="text-sm text-stone-500">
            {item.category.parent ? `${item.category.parent.name} › ` : ''}
            {item.category.name} · {t(`condition.${item.condition}`)} · {t('listing.available')}:{' '}
            {item.quantity}
          </p>
        </div>
        <Price amount={item.price} currency={item.currency} />
      </div>

      {item.wasPublished && (
        <p className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
          {t('admin.review.edited')}
        </p>
      )}

      {item.images.length > 0 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {item.images.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <a
                href={img.url}
                target="_blank"
                rel="noreferrer"
                aria-label={t('admin.review.openPhoto', { n: i + 1 })}
              >
                <img src={img.thumbUrl} alt="" className="h-24 w-24 rounded-lg object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 line-clamp-6 whitespace-pre-line text-sm text-stone-700">
        {item.description}
      </p>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="inline text-stone-500">{t('listing.seller')}: </dt>
          <dd className="inline">
            {item.seller.shopName} ({item.sellerAccount.name}, {item.sellerAccount.email})
          </dd>
        </div>
        <div>
          <dt className="inline text-stone-500">{t('listing.location')}: </dt>
          <dd className="inline">
            {FLAG[item.countryCode]} {item.town}, {item.regionName}
            {item.crossBorder && ` · ${t('admin.review.crossBorder')}`}
          </dd>
        </div>
        <div>
          <dt className="inline text-stone-500">{t('admin.review.submitted')}: </dt>
          <dd className="inline">{item.submittedAt ? date(item.submittedAt) : '—'}</dd>
        </div>
      </dl>

      {item.history.length > 1 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-stone-600">
            {t('admin.review.history', { count: item.history.length })}
          </summary>
          <ol className="mt-2 space-y-1 border-l-2 border-stone-200 pl-3">
            {item.history.map((h, i) => (
              <li key={i}>
                <span className="font-medium">{t(`admin.review.decision.${h.decision}`)}</span> ·{' '}
                {date(h.createdAt)}
                {h.actorName && ` · ${h.actorName}`}
                {h.reason && <span className="block text-stone-600">“{h.reason}”</span>}
              </li>
            ))}
          </ol>
        </details>
      )}

      {(error.message || error.fields.reason) && (
        <div className="mt-3">
          <Alert>{error.fields.reason ?? error.message}</Alert>
        </div>
      )}

      {!rejecting ? (
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            disabled={moderate.isPending}
            onClick={() => moderate.mutate({ id: item.id, decision: 'approve' })}
            className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {t('admin.review.approve')}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50"
          >
            {t('admin.review.reject')}
          </button>
        </div>
      ) : (
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            moderate.mutate({ id: item.id, decision: 'reject', reason });
          }}
        >
          <label htmlFor={`reason-${item.id}`} className="block text-sm font-medium">
            {t('admin.review.reasonLabel')}
          </label>
          <div className="flex flex-wrap gap-2">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(t(`admin.review.reasons.${r}`))}
                className="rounded-full border border-stone-300 px-2.5 py-1 text-xs hover:bg-stone-50"
              >
                {t(`admin.review.reasonShort.${r}`)}
              </button>
            ))}
          </div>
          <textarea
            id={`reason-${item.id}`}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={moderate.isPending}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {t('admin.review.sendRejection')}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="rounded-lg px-4 py-2 text-sm hover:bg-stone-100"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

export function ReviewQueuePage() {
  const { t } = useTranslation();
  const { data, isPending } = useReviewQueue();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.review.title')}</h1>
        <p className="mt-1 text-stone-600">{t('admin.review.intro')}</p>
      </div>
      {isPending ? (
        <p className="text-stone-500">{t('common.loading')}</p>
      ) : !data?.length ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
          {t('admin.review.empty')}
        </div>
      ) : (
        data.map((item) => <ReviewCard key={item.id} item={item} />)
      )}
    </div>
  );
}
