import type { AdminUserRow } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { adminPost, useAdminAction, useAdminUsers } from '../../lib/admin';
import { inputClass, PageHeader, Pager, ReasonAction } from './shared';

const FLAG = { TZ: '🇹🇿', ZM: '🇿🇲' } as const;

function UserRow({ u }: { u: AdminUserRow }) {
  const { t, i18n } = useTranslation();
  const act = useAdminAction(
    ({ action, reason }: { action: 'suspend' | 'reinstate'; reason: string }) =>
      adminPost(`users/${u.id}/${action}`, { reason }),
  );
  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {FLAG[u.countryCode]} {u.name}{' '}
            {u.role === 'ADMIN' && (
              <span className="rounded bg-brand-100 px-1.5 text-xs text-brand-800">admin</span>
            )}{' '}
            {u.status !== 'ACTIVE' && (
              <span className="rounded bg-red-100 px-1.5 text-xs text-red-800">
                {u.status.toLowerCase()}
              </span>
            )}
          </p>
          <p className="text-sm text-stone-600">
            {u.email}
            {!u.emailVerified && ` · ${t('admin.users.unverified')}`}
          </p>
          <p className="text-xs text-stone-500">
            {u.shopName && (
              <>
                <Link to={`/shop/${u.shopSlug}`} className="text-brand-700 underline">
                  {u.shopName}
                </Link>{' '}
                ·{' '}
              </>
            )}
            {t('admin.users.counts', { listings: u.listings, orders: u.orders })}
            {u.reportsAgainst > 0 && (
              <span className="text-red-700">
                {' '}
                · {t('admin.users.reports', { count: u.reportsAgainst })}
              </span>
            )}{' '}
            ·{' '}
            {t('admin.users.joined', {
              date: new Date(u.createdAt).toLocaleDateString(i18n.language, {
                dateStyle: 'medium',
              }),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/admin/listings?sellerId=${u.id}`}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
          >
            {t('admin.users.listings')}
          </Link>
          <Link
            to={`/admin/audit?targetType=user&targetId=${u.id}`}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
          >
            {t('admin.users.history')}
          </Link>
        </div>
      </div>
      {u.role !== 'ADMIN' && u.status === 'ACTIVE' && (
        <ReasonAction
          label={t('admin.users.suspend')}
          danger
          pending={act.isPending}
          error={act.error}
          onConfirm={(reason) => act.mutate({ action: 'suspend', reason })}
        />
      )}
      {u.status === 'SUSPENDED' && (
        <ReasonAction
          label={t('admin.users.reinstate')}
          pending={act.isPending}
          error={act.error}
          onConfirm={(reason) => act.mutate({ action: 'reinstate', reason })}
        />
      )}
    </li>
  );
}

export function UsersPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const { data } = useAdminUsers({
    q: params.get('q') ?? undefined,
    status: params.get('status') ?? undefined,
    page: params.get('page') ?? undefined,
  });
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };
  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    set('q', q.trim() || null);
  };
  return (
    <div>
      <PageHeader
        title={t('admin.nav.users')}
        intro={data ? t('admin.total', { count: data.total }) : undefined}
      >
        <form role="search" onSubmit={onSearch} className="flex flex-wrap gap-2">
          <input
            type="search"
            aria-label={t('admin.users.search')}
            placeholder={t('admin.users.search')}
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
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DELETED">Deleted</option>
          </select>
        </form>
      </PageHeader>
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {data?.rows.map((u) => (
          <UserRow key={u.id} u={u} />
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
