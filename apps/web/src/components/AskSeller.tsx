import { MAX_MESSAGE_LENGTH, type ListingDetail } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useMe } from '../lib/auth';
import { apiErrors } from '../lib/forms';
import { useStartConversation } from '../lib/messaging';
import { Alert } from './Form';

/** "Ask the seller a question" on a listing page. */
export function AskSeller({ listing }: { listing: ListingDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const start = useStartConversation();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  if (!me || listing.isOwner || !['ACTIVE', 'SOLD'].includes(listing.status)) return null;
  if (!me.emailVerified) return null; // the Buy box already explains this

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    start.mutate(
      { listingId: listing.id, body: body.trim() },
      { onSuccess: (d) => navigate(`/messages/${d.conversation.id}`) },
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-brand-700 px-4 py-2.5 font-medium text-brand-700 hover:bg-brand-50"
      >
        {t('messages.ask')}
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-xl border border-stone-200 bg-white p-4">
      <label htmlFor="ask-seller" className="block text-sm font-medium">
        {t('messages.askLabel', { shop: listing.seller.shopName })}
      </label>
      {start.isError && (
        <Alert>{apiErrors(start.error).fields.body ?? apiErrors(start.error).message}</Alert>
      )}
      <textarea
        id="ask-seller"
        rows={3}
        maxLength={MAX_MESSAGE_LENGTH}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('messages.askPlaceholder')}
        className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!body.trim() || start.isPending}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {t('messages.send')}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm hover:bg-stone-100"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
