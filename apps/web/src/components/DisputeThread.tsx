import type { DisputeDto } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrors } from '../lib/forms';
import { Alert } from './Form';

/** The shared conversation on a problem, with a reply box while it's open. */
export function DisputeThread({
  dispute,
  viewer,
  reply,
}: {
  dispute: DisputeDto;
  viewer: 'buyer' | 'seller' | 'tzed';
  reply: {
    mutate: (body: string, opts: { onSuccess: () => void }) => void;
    isPending: boolean;
    error: unknown;
  };
}) {
  const { t, i18n } = useTranslation();
  const [body, setBody] = useState('');
  const when = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const error = apiErrors(reply.error);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    reply.mutate(body, { onSuccess: () => setBody('') });
  }

  return (
    <div className="space-y-3">
      <ol className="space-y-2" aria-label={t('dispute.conversation')}>
        {dispute.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-lg px-3 py-2 text-sm ${
              m.author === 'tzed'
                ? 'border border-brand-100 bg-brand-50'
                : m.author === viewer
                  ? 'bg-stone-100'
                  : 'border border-stone-200 bg-white'
            }`}
          >
            <p className="text-xs text-stone-600">
              <span className="font-semibold text-stone-800">
                {m.author === viewer ? t('messages.you') : m.authorName}
              </span>{' '}
              · {t(`dispute.role.${m.author}`)} · {when(m.createdAt)}
            </p>
            <p className="mt-1 whitespace-pre-line">{m.body}</p>
          </li>
        ))}
      </ol>
      {dispute.status === 'RESOLVED' ? (
        <div className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm">
          <p className="font-semibold">{t('dispute.resolvedTitle')}</p>
          <p className="mt-1 whitespace-pre-line">{dispute.resolution}</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t('dispute.reply')}</span>
            <textarea
              rows={3}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="block w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
          {error.message && <Alert>{error.fields.body ?? error.message}</Alert>}
          <button
            type="submit"
            disabled={reply.isPending || !body.trim()}
            className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {t('dispute.send')}
          </button>
        </form>
      )}
    </div>
  );
}
