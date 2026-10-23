import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useMarkRead, useNotifications } from '../lib/messaging';
import { timeAgo } from '../lib/time';

export function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending } = useNotifications(100);
  const mark = useMarkRead();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('header.notifications')}</h1>
        {Boolean(data?.unread) && (
          <button
            type="button"
            onClick={() => mark.all.mutate()}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            {t('notifications.markAll')}
          </button>
        )}
      </div>
      {isPending ? (
        <p className="text-stone-500">{t('common.loading')}</p>
      ) : !data?.notifications.length ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
          {t('notifications.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {data.notifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  if (!n.read) mark.one.mutate(n.id);
                  if (n.link) navigate(n.link);
                }}
                className={`flex w-full gap-3 p-4 text-left hover:bg-stone-50 ${n.read ? '' : 'bg-brand-50/60'}`}
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-600'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{n.title}</span>
                  {n.body && (
                    <span className="block whitespace-pre-line text-sm text-stone-600">
                      {n.body}
                    </span>
                  )}
                  <span className="block text-xs text-stone-400">
                    {!n.read && <span className="sr-only">{t('notifications.unread')}, </span>}
                    {timeAgo(n.createdAt, i18n.language)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
