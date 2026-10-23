import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert } from '../../components/Form';
import { useMe } from '../../lib/auth';
import { apiErrors } from '../../lib/forms';
import { useTicket, useTicketAction } from '../../lib/support';

/** A support ticket thread. Guests open it with the private link from their email. */
export function TicketPage() {
  const { t, i18n } = useTranslation();
  const id = Number(useParams().id);
  const token = useSearchParams()[0].get('token');
  const { data: me } = useMe();
  const { data: ticket, isPending, isError } = useTicket(id, token);
  const { reply, close } = useTicketAction(id, token);
  const [body, setBody] = useState('');

  if (isPending) return <p className="text-stone-500">{t('common.loading')}</p>;
  if (isError || !ticket)
    return (
      <div className="mx-auto max-w-xl">
        <Alert>{t('support.notFound')}</Alert>
      </div>
    );

  function onReply(e: FormEvent) {
    e.preventDefault();
    if (body.trim()) reply.mutate(body.trim(), { onSuccess: () => setBody('') });
  }
  const when = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const error = apiErrors(reply.error ?? close.error);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {me && (
        <Link to="/support/tickets" className="text-sm text-brand-700 hover:underline">
          ← {t('support.myTickets')}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">
          #{ticket.id} · {ticket.subject}
        </h1>
        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium">
          {t(`support.status.${ticket.status}`)}
        </span>
      </div>
      <ol className="space-y-3">
        {ticket.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-xl border p-4 text-sm ${m.fromStaff ? 'border-brand-100 bg-brand-50' : 'border-stone-200 bg-white'}`}
          >
            <p className="mb-1 text-xs font-medium text-stone-500">
              {m.fromStaff ? t('support.fromStaff') : ticket.name} · {when(m.createdAt)}
            </p>
            <p className="whitespace-pre-line text-stone-800">{m.body}</p>
          </li>
        ))}
      </ol>
      {(error.message || error.fields.body) && <Alert>{error.fields.body ?? error.message}</Alert>}
      {ticket.status === 'CLOSED' ? (
        <p className="text-sm text-stone-600">
          {t('support.closed')}{' '}
          <Link to="/help/contact" className="text-brand-700 underline">
            {t('support.new')}
          </Link>
        </p>
      ) : (
        <form
          onSubmit={onReply}
          className="space-y-2 rounded-xl border border-stone-200 bg-white p-4"
        >
          <label htmlFor="ticket-reply" className="block text-sm font-medium">
            {t('support.reply')}
          </label>
          <textarea
            id="ticket-reply"
            rows={4}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!body.trim() || reply.isPending}
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {t('support.sendReply')}
            </button>
            <button
              type="button"
              onClick={() => close.mutate()}
              disabled={close.isPending}
              className="rounded-lg px-4 py-2 text-sm hover:bg-stone-100"
            >
              {t('support.close')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
