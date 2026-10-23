import type { AdminReviewRow } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Stars } from '../../components/Stars';
import { adminPost, useAdminAction, useAdminReviews } from '../../lib/admin';
import { inputClass, PageHeader, Pager, ReasonAction } from './shared';

function Row({ r }: { r: AdminReviewRow }) {
  const { t, i18n } = useTranslation();
  const act = useAdminAction(({ action, reason }: { action: 'hide' | 'unhide'; reason: string }) =>
    adminPost(`reviews/${r.id}/${action}`, { reason }),
  );
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { dateStyle: 'medium' });
  return (
    <li className={`flex flex-wrap items-start gap-3 p-3 ${r.hiddenAt ? 'bg-stone-50' : ''}`}>
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <Stars value={r.rating} />
          <span className="text-stone-500">{date(r.createdAt)}</span>
          {r.hiddenAt && (
            <span className="rounded-full bg-stone-200 px-2 text-xs font-semibold leading-5 text-stone-700">
              {t('admin.reviews.hiddenBadge')}
            </span>
          )}
        </p>
        <p className="mt-1 font-medium">
          {t('admin.reviews.byFor', { reviewer: r.reviewerName, seller: r.sellerName })}
        </p>
        <p className="text-xs text-stone-500">
          {r.shopSlug ? (
            <Link to={`/shops/${r.shopSlug}/reviews`} className="hover:text-brand-700">
              {r.listingTitle}
            </Link>
          ) : (
            r.listingTitle
          )}{' '}
          · {t('admin.reviews.order', { id: r.orderId })}
        </p>
        {r.comment && (
          <p className="mt-1 whitespace-pre-line break-words text-stone-700">“{r.comment}”</p>
        )}
        {r.hiddenAt && (
          <p className="mt-1 text-xs text-stone-600">
            {t('admin.reviews.hiddenBecause', { date: date(r.hiddenAt), reason: r.hiddenReason })}
          </p>
        )}
      </div>
      {r.hiddenAt ? (
        <ReasonAction
          label={t('admin.reviews.unhide')}
          pending={act.isPending}
          error={act.error}
          onConfirm={(reason) => act.mutate({ action: 'unhide', reason })}
        />
      ) : (
        <ReasonAction
          label={t('admin.reviews.hide')}
          danger
          pending={act.isPending}
          error={act.error}
          onConfirm={(reason) => act.mutate({ action: 'hide', reason })}
        />
      )}
    </li>
  );
}

export function AdminReviewsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const { data } = useAdminReviews({
    q: params.get('q') ?? undefined,
    visibility: params.get('visibility') ?? undefined,
    rating: params.get('rating') ?? undefined,
    page: params.get('page') ?? undefined,
  });
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };
  return (
    <div>
      <PageHeader
        title={t('admin.nav.reviews')}
        intro={
          data
            ? `${t('admin.total', { count: data.total })}. ${t('admin.reviews.intro')}`
            : t('admin.reviews.intro')
        }
      >
        <form
          role="search"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            set('q', q.trim() || null);
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            type="search"
            aria-label={t('admin.reviews.search')}
            placeholder={t('admin.reviews.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={inputClass}
          />
          <select
            aria-label={t('admin.reviews.visibility')}
            value={params.get('visibility') ?? ''}
            onChange={(e) => set('visibility', e.target.value || null)}
            className={inputClass}
          >
            <option value="">{t('admin.reviews.all')}</option>
            <option value="visible">{t('admin.reviews.visible')}</option>
            <option value="hidden">{t('admin.reviews.hidden')}</option>
          </select>
          <select
            aria-label={t('admin.reviews.rating')}
            value={params.get('rating') ?? ''}
            onChange={(e) => set('rating', e.target.value || null)}
            className={inputClass}
          >
            <option value="">{t('admin.reviews.anyRating')}</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {t('reviews.starOption', { count: n })}
              </option>
            ))}
          </select>
        </form>
      </PageHeader>
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {data?.rows.map((r) => (
          <Row key={r.id} r={r} />
        ))}
        {data && !data.rows.length && (
          <li className="p-6 text-center text-stone-600">{t('admin.none')}</li>
        )}
      </ul>
      {data && (
        <Pager page={data.page} pageCount={data.pageCount} go={(p) => set('page', String(p))} />
      )}
    </div>
  );
}
