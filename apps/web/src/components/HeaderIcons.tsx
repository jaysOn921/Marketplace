import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useMe } from '../lib/auth';
import { useCounts, useMarkRead, useNotifications } from '../lib/messaging';
import { timeAgo } from '../lib/time';

function Badge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent-500 px-1 text-center text-[11px] font-bold leading-5 text-stone-900">
      {count > 99 ? '99+' : count}
    </span>
  );
}

const iconButton = 'relative rounded-md p-2 text-stone-700 hover:bg-stone-100';

function MessagesIcon() {
  const { t } = useTranslation();
  const { data } = useCounts();
  const count = data?.messages ?? 0;
  return (
    <Link
      to="/messages"
      className={iconButton}
      aria-label={count ? t('header.messagesUnread', { count }) : t('header.messages')}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 5h16v11H8l-4 4V5z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      <Badge count={count} />
    </Link>
  );
}

function NotificationBell() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: counts } = useCounts();
  const { data } = useNotifications(8, open);
  const mark = useMarkRead();
  const count = counts?.notifications ?? 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={iconButton}
        aria-expanded={open}
        aria-controls="notifications-panel"
        aria-label={count ? t('header.notificationsUnread', { count }) : t('header.notifications')}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        <Badge count={count} />
      </button>
      {open && (
        <div
          id="notifications-panel"
          role="dialog"
          aria-label={t('header.notifications')}
          className="fixed inset-x-4 top-16 z-20 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
            <h2 className="font-semibold">{t('header.notifications')}</h2>
            {count > 0 && (
              <button
                type="button"
                onClick={() => mark.all.mutate()}
                className="text-sm text-brand-700 hover:underline"
              >
                {t('notifications.markAll')}
              </button>
            )}
          </div>
          {!data ? (
            <p className="px-4 py-6 text-sm text-stone-500">{t('common.loading')}</p>
          ) : !data.notifications.length ? (
            <p className="px-4 py-6 text-sm text-stone-500">{t('notifications.empty')}</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-stone-100 overflow-y-auto">
              {data.notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (!n.read) mark.one.mutate(n.id);
                      if (n.link) navigate(n.link);
                    }}
                    className={`block w-full px-4 py-3 text-left text-sm hover:bg-stone-50 ${n.read ? '' : 'bg-brand-50/60'}`}
                  >
                    <span className="flex items-start gap-2">
                      {!n.read && (
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600"
                          aria-label={t('notifications.unread')}
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block font-medium">{n.title}</span>
                        {n.body && (
                          <span className="line-clamp-2 block text-stone-600">{n.body}</span>
                        )}
                        <span className="block text-xs text-stone-500">
                          {timeAgo(n.createdAt, i18n.language)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-stone-100 px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-stone-50"
          >
            {t('notifications.seeAll')}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Messages and notifications icons for signed-in users. */
export function HeaderIcons() {
  const { data: user } = useMe();
  if (!user) return null;
  return (
    <div className="flex items-center">
      <MessagesIcon />
      <NotificationBell />
    </div>
  );
}
