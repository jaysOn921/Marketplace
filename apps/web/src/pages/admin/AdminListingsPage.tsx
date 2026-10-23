import { LISTING_STATUSES, formatMoney, type AdminListingRow } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { StatusBadge } from '../../components/StatusBadge';
import { adminPost, useAdminAction, useAdminListings } from '../../lib/admin';
import { inputClass, PageHeader, Pager, ReasonAction } from './shared';

function Row({ l }: { l: AdminListingRow }) {
  const { t } = useTranslation();
  const act = useAdminAction(
    ({ action, reason }: { action: 'remove' | 'restore'; reason: string }) =>
      adminPost(`listings/${l.id}/${action}`, { reason }),
  );
  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      {l.thumbUrl ? (
        <img src={l.thumbUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
      ) : (
        <div className="h-12 w-12 rounded-lg bg-stone-100" />
      )}
      <div className="min-w-0 flex-1">
        <Link to={`/listings/${l.id}`} className="block truncate font-medium hover:text-brand-700">
          #{l.id} · {l.title}
        </Link>
        <p className="text-xs text-stone-500">
          {formatMoney(l.price, l.currency)} · {l.shopName ?? l.sellerName} ·{' '}
          <StatusBadge status={l.status} />
        </p>
      </div>
      {l.status === 'REMOVED' ? (
        <ReasonAction
          label={t('admin.listings.restore')}
          pending={act.isPending}
          error={act.error}
          onConfirm={(reason) => act.mutate({ action: 'restore', reason })}
        />
      ) : (
        <ReasonAction
          label={t('admin.listings.remove')}
          danger
          pending={act.isPending}
          error={act.error}
          onConfirm={(reason) => act.mutate({ action: 'remove', reason })}
        />
      )}
    </li>
  );
}

export function AdminListingsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const { data } = useAdminListings({
    q: params.get('q') ?? undefined,
    status: params.get('status') ?? undefined,
    sellerId: params.get('sellerId') ?? undefined,
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
        title={t('admin.nav.listings')}
        intro={data ? t('admin.total', { count: data.total }) : undefined}
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
            aria-label={t('admin.listings.search')}
            placeholder={t('admin.listings.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={inputClass}
          />
          <select
            aria-label={t('admin.status')}
            value={params.get('status') ?? ''}
            onChange={(e) => set('status', e.target.value || null)}
            className={inputClass}
          >
            <option value="">{t('admin.allStatuses')}</option>
            {LISTING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`listingStatus.${s}`)}
              </option>
            ))}
          </select>
        </form>
      </PageHeader>
      {params.get('sellerId') && (
        <p className="mb-2 text-sm">
          {t('admin.listings.forSeller')}{' '}
          <button
            type="button"
            onClick={() => set('sellerId', null)}
            className="text-brand-700 underline"
          >
            {t('search.chips.clearAll')}
          </button>
        </p>
      )}
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {data?.rows.map((l) => (
          <Row key={l.id} l={l} />
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
