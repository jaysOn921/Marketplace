import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert } from '../../components/Form';
import { adminPost, useAdminAction, useAdminTickets } from '../../lib/admin';
import { apiErrors } from '../../lib/forms';
import { useTicket } from '../../lib/support';
import { inputClass, PageHeader, Pager } from './shared';

export function AdminTicketsPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data } = useAdminTickets({
    status: params.get('status') ?? undefined,
    page: params.get('page') ?? undefined,
  });
  return (
    <div>
      <PageHeader
        title={t('admin.nav.tickets')}
        intro={data ? t('admin.total', { count: data.total }) : undefined}
      >
        <select
          aria-label={t('admin.status')}
          value={params.get('status') ?? ''}
          onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}
          className={inputClass}
        >
          <option value="">{t('admin.allStatuses')}</option>
          {(['OPEN', 'ANSWERED', 'CLOSED'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`support.status.${s}`)}
            </option>
          ))}
        </select>
      </PageHeader>
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {data?.rows.map((tk) => (
          <li key={tk.id}>
            <Link
              to={`/admin/tickets/${tk.id}`}
              className="flex items-center justify-between gap-3 p-4 hover:bg-stone-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  #{tk.id} · {tk.subject}
                </span>
                <span className="text-xs text-stone-500">
                  {tk.name} ({tk.email}){tk.isGuest && ` · ${t('admin.tickets.guest')}`} ·{' '}
                  {t('admin.tickets.messages', { count: tk.messages })} ·{' '}
                  {new Date(tk.updatedAt).toLocaleString(i18n.language, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${tk.status === 'OPEN' ? 'bg-amber-100 text-amber-900' : 'bg-stone-100'}`}
              >
                {t(`support.status.${tk.status}`)}
              </span>
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
          go={(p) => setParams({ ...Object.fromEntries(params), page: String(p) })}
        />
      )}
    </div>
  );
}

export function AdminTicketPage() {
  const { t, i18n } = useTranslation();
  const id = Number(useParams().id);
  const { data: ticket, refetch } = useTicket(id, null);
  const reply = useAdminAction((input: { body: string; close: boolean }) =>
    adminPost(`tickets/${id}/reply`, input),
  );
  const close = useAdminAction(() => adminPost(`tickets/${id}/close`));
  const [body, setBody] = useState('');
  if (!ticket) return <p className="text-stone-500">{t('common.loading')}</p>;

  const send = (closeAfter: boolean) => (e?: FormEvent) => {
    e?.preventDefault();
    reply.mutate(
      { body, close: closeAfter },
      {
        onSuccess: () => {
          setBody('');
          void refetch();
        },
      },
    );
  };
  const err = apiErrors(reply.error ?? close.error);
  return (
    <div className="max-w-3xl space-y-4">
      <Link to="/admin/tickets" className="text-sm text-brand-700 hover:underline">
        ← {t('admin.nav.tickets')}
      </Link>
      <PageHeader
        title={`#${ticket.id} · ${ticket.subject}`}
        intro={`${ticket.name} · ${ticket.email} · ${t(`support.status.${ticket.status}`)}`}
      />
      <ol className="space-y-3">
        {ticket.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-xl border p-4 text-sm ${m.fromStaff ? 'border-brand-100 bg-brand-50' : 'border-stone-200 bg-white'}`}
          >
            <p className="mb-1 text-xs font-medium text-stone-500">
              {m.fromStaff ? t('support.fromStaff') : ticket.name} ·{' '}
              {new Date(m.createdAt).toLocaleString(i18n.language, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
            <p className="whitespace-pre-line">{m.body}</p>
          </li>
        ))}
      </ol>
      {(err.message || err.fields.body) && <Alert>{err.fields.body ?? err.message}</Alert>}
      <form
        onSubmit={send(false)}
        className="space-y-2 rounded-xl border border-stone-200 bg-white p-4"
      >
        <label htmlFor="staff-reply" className="block text-sm font-medium">
          {t('admin.tickets.reply')}
        </label>
        <textarea
          id="staff-reply"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-stone-500">{t('admin.tickets.replyHint')}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!body.trim() || reply.isPending}
            className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {t('admin.tickets.send')}
          </button>
          <button
            type="button"
            disabled={!body.trim() || reply.isPending}
            onClick={() => send(true)()}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
          >
            {t('admin.tickets.sendClose')}
          </button>
          {ticket.status !== 'CLOSED' && (
            <button
              type="button"
              onClick={() => close.mutate(undefined, { onSuccess: () => void refetch() })}
              className="rounded-lg px-4 py-2 text-sm hover:bg-stone-100"
            >
              {t('support.close')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
