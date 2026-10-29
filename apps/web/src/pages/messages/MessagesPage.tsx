import { MAX_MESSAGE_LENGTH, formatMoney, type ConversationSummary } from '@tzed/shared';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Alert } from '../../components/Form';
import { ReportButton } from '../../components/ReportButton';
import { apiErrors } from '../../lib/forms';
import { useConversation, useConversations, useSendMessage } from '../../lib/messaging';
import { timeAgo } from '../../lib/time';

/**
 * A phone number (7+ digits, spaces or dashes between them) or an email address. Prices such
 * as "380,000" don't match: the comma breaks the run of digits.
 */
const sharesContact = (text: string) =>
  /\+?\d(?:[\s-]?\d){6,}/.test(text) || /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text);

function ConversationList({
  conversations,
  activeId,
}: {
  conversations: ConversationSummary[];
  activeId?: number;
}) {
  const { t, i18n } = useTranslation();
  if (!conversations.length) {
    return <p className="p-6 text-center text-sm text-stone-600">{t('messages.empty')}</p>;
  }
  return (
    <ul className="divide-y divide-stone-100">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link
            to={`/messages/${c.id}`}
            aria-current={c.id === activeId ? 'page' : undefined}
            className={`flex gap-3 p-3 hover:bg-stone-50 ${c.id === activeId ? 'bg-brand-50' : ''}`}
          >
            {c.listing.coverImage ? (
              <img
                src={c.listing.coverImage.thumbUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-lg bg-stone-100" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={`truncate text-sm ${c.unread ? 'font-semibold' : 'font-medium'}`}>
                  {c.otherParty}
                </p>
                <span className="shrink-0 text-xs text-stone-500">
                  {timeAgo(c.lastMessageAt, i18n.language)}
                </span>
              </div>
              <p className="truncate text-xs text-stone-500">{c.listing.title}</p>
              {c.lastMessage && (
                <p className={`truncate text-sm ${c.unread ? 'text-stone-900' : 'text-stone-500'}`}>
                  {c.lastMessage.mine && `${t('messages.you')}: `}
                  {c.lastMessage.body}
                </p>
              )}
            </div>
            {c.unread > 0 && (
              <span
                className="self-center rounded-full bg-brand-700 px-2 text-xs font-semibold leading-5 text-white"
                aria-label={t('messages.unreadCount', { count: c.unread })}
              >
                {c.unread}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Thread({ id }: { id: number }) {
  const { t, i18n } = useTranslation();
  const { data, isPending, isError } = useConversation(id);
  const send = useSendMessage(id);
  const [body, setBody] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [count, id]);

  if (isPending) return <p className="p-6 text-stone-500">{t('common.loading')}</p>;
  if (isError || !data)
    return (
      <div className="p-6">
        <Alert>{t('messages.notFound')}</Alert>
      </div>
    );
  const c = data.conversation;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text || send.isPending) return;
    send.mutate(text, { onSuccess: () => setBody('') });
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-stone-200 p-3">
        <Link
          to="/messages"
          className="rounded p-1 text-stone-600 hover:bg-stone-100 md:hidden"
          aria-label={t('messages.back')}
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{c.otherParty}</h2>
          <Link
            to={`/listings/${c.listing.id}`}
            className="block truncate text-sm text-brand-700 hover:underline"
          >
            {c.listing.title} · {formatMoney(c.listing.price, c.listing.currency)}
          </Link>
        </div>
        {c.orderId && (
          <Link
            to={`/orders/${c.orderId}`}
            className="shrink-0 rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
          >
            {t('messages.viewOrder')}
          </Link>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-stone-50 p-3" aria-live="polite">
        {data.hasMore && (
          <p className="text-center text-xs text-stone-500">{t('messages.older')}</p>
        )}
        {data.messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? 'rounded-br-sm bg-brand-700 text-white' : 'rounded-bl-sm border border-stone-200 bg-white'}`}
            >
              {m.removed ? (
                <p className="italic opacity-70">{t('messages.removed')}</p>
              ) : (
                <p className="whitespace-pre-line break-words">{m.body}</p>
              )}
              <p className={`mt-0.5 text-[11px] ${m.mine ? 'text-brand-100' : 'text-stone-500'}`}>
                <span className="sr-only">{m.mine ? t('messages.you') : c.otherParty}, </span>
                {timeAgo(m.createdAt, i18n.language)}
              </p>
              {!m.mine && !m.removed && (
                <ReportButton targetType="MESSAGE" targetId={m.id} className="mt-1" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {c.canReply ? (
        <form onSubmit={submit} className="border-t border-stone-200 p-3">
          {send.isError && (
            <div className="mb-2">
              <Alert>{apiErrors(send.error).fields.body ?? apiErrors(send.error).message}</Alert>
            </div>
          )}
          <div className="flex items-end gap-2">
            <label htmlFor="message-body" className="sr-only">
              {t('messages.write')}
            </label>
            <textarea
              id="message-body"
              rows={2}
              maxLength={MAX_MESSAGE_LENGTH}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('messages.placeholder')}
              className="min-w-0 flex-1 resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={!body.trim() || send.isPending}
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {t('messages.send')}
            </button>
          </div>
          {sharesContact(body) ? (
            <p role="status" className="mt-1 text-xs font-medium text-amber-800">
              {t('messages.contactTip')}
            </p>
          ) : (
            <p className="mt-1 text-xs text-stone-500">{t('messages.safety')}</p>
          )}
        </form>
      ) : (
        <p className="border-t border-stone-200 p-3 text-sm text-stone-600">
          {t('messages.cannotReply')}
        </p>
      )}
    </div>
  );
}

export function MessagesPage() {
  const { t } = useTranslation();
  const params = useParams();
  const id = params.id ? Number(params.id) : undefined;
  const { data, isPending } = useConversations();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('messages.title')}</h1>
      <div className="grid h-[70vh] min-h-[28rem] overflow-hidden rounded-xl border border-stone-200 bg-white md:grid-cols-[20rem_1fr]">
        <aside
          className={`min-h-0 overflow-y-auto border-stone-200 md:border-r ${id ? 'hidden md:block' : ''}`}
          aria-label={t('messages.inbox')}
        >
          {isPending ? (
            <p className="p-6 text-stone-500">{t('common.loading')}</p>
          ) : (
            <ConversationList conversations={data?.conversations ?? []} activeId={id} />
          )}
        </aside>
        <section
          className={`min-h-0 ${id ? '' : 'hidden md:flex md:items-center md:justify-center'}`}
        >
          {id ? (
            <Thread key={id} id={id} />
          ) : (
            <p className="text-sm text-stone-500">{t('messages.choose')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
