import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { DisputeThread } from '../../components/DisputeThread';
import { Alert } from '../../components/Form';
import { useAdminDisputes } from '../../lib/admin';
import { useAdminDispute, useDisputeReply, useResolveDispute } from '../../lib/disputes';
import { apiErrors } from '../../lib/forms';
import { useState, type FormEvent } from 'react';
import { inputClass, PageHeader, Pager } from './shared';

export function DisputesPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'OPEN';
  const { data } = useAdminDisputes({ status, page: params.get('page') ?? undefined });
  return (
    <div>
      <PageHeader title={t('admin.nav.disputes')} intro={t('dispute.adminIntro')}>
        <select
          aria-label={t('admin.status')}
          value={status}
          onChange={(e) => setParams({ status: e.target.value })}
          className={inputClass}
        >
          <option value="OPEN">{t('dispute.statusOpen')}</option>
          <option value="RESOLVED">{t('dispute.statusResolved')}</option>
          <option value="ALL">{t('admin.allStatuses')}</option>
        </select>
      </PageHeader>
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {data?.rows.map((d) => (
          <li key={d.id}>
            <Link to={`/admin/disputes/${d.id}`} className="block p-4 hover:bg-stone-50">
              <p className="font-medium">
                {t('order.title', { id: d.orderId })} · {t(`dispute.reason.${d.reason}`)}
                {d.status === 'RESOLVED' && (
                  <span className="ml-2 rounded-full bg-stone-200 px-2 text-xs">
                    {t('dispute.statusResolved')}
                  </span>
                )}
              </p>
              <p className="text-sm text-stone-600">
                {d.orderTitle} ·{' '}
                {t('dispute.parties', { buyer: d.buyerName, seller: d.sellerName })}
              </p>
              <p className="text-xs text-stone-500">
                {t('dispute.openedBy', { role: t(`dispute.role.${d.openedBy}`) })} ·{' '}
                {t('admin.tickets.messages', { count: d.messages })} ·{' '}
                {new Date(d.updatedAt).toLocaleString(i18n.language, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </Link>
          </li>
        ))}
        {data && !data.rows.length && (
          <li className="p-6 text-center text-stone-600">{t('admin.none')}</li>
        )}
      </ul>
      {data && (
        <Pager
          page={data.page}
          pageCount={data.pageCount}
          go={(p) => setParams({ status, page: String(p) })}
        />
      )}
    </div>
  );
}

export function DisputePage() {
  const { t } = useTranslation();
  const id = Number(useParams().id);
  const { data: dispute } = useAdminDispute(id);
  const reply = useDisputeReply(dispute?.orderId ?? 0);
  const resolve = useResolveDispute(id, dispute?.orderId);
  const [resolution, setResolution] = useState('');
  if (!dispute) return <p className="text-stone-600">{t('common.loading')}</p>;
  const error = apiErrors(resolve.error);

  function onResolve(e: FormEvent) {
    e.preventDefault();
    resolve.mutate(resolution);
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title={`${t('order.title', { id: dispute.orderId })} · ${t(`dispute.reason.${dispute.reason}`)}`}
        intro={t('dispute.openedBy', { role: t(`dispute.role.${dispute.openedBy}`) })}
      >
        <Link
          to={`/orders/${dispute.orderId}`}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
        >
          {t('dispute.viewOrder')}
        </Link>
      </PageHeader>
      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <DisputeThread
          dispute={dispute}
          viewer="tzed"
          reply={{
            mutate: (body, opts) => reply.mutate({ disputeId: id, body }, opts),
            isPending: reply.isPending,
            error: reply.error,
          }}
        />
      </section>
      {dispute.status === 'OPEN' && (
        <form
          onSubmit={onResolve}
          className="space-y-2 rounded-xl border border-stone-200 bg-white p-4"
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t('dispute.resolution')}</span>
            <textarea
              rows={3}
              maxLength={1000}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder={t('dispute.resolutionPlaceholder')}
              className="block w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
          {(error.fields.resolution ?? error.message) && (
            <Alert>{error.fields.resolution ?? error.message}</Alert>
          )}
          <button
            type="submit"
            disabled={resolve.isPending}
            className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {t('dispute.resolve')}
          </button>
        </form>
      )}
    </div>
  );
}
