import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMyTickets } from '../../lib/support';

export function TicketsPage() {
  const { t, i18n } = useTranslation();
  const { data, isPending } = useMyTickets();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('support.myTickets')}</h1>
        <Link
          to="/help/contact"
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          {t('support.new')}
        </Link>
      </div>
      {isPending ? (
        <p className="text-stone-500">{t('common.loading')}</p>
      ) : !data?.length ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-stone-600">
          {t('support.none')}
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {data.map((tk) => (
            <li key={tk.id}>
              <Link
                to={`/support/tickets/${tk.id}`}
                className="flex items-center justify-between gap-3 p-4 hover:bg-stone-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    #{tk.id} · {tk.subject}
                  </span>
                  <span className="text-xs text-stone-500">
                    {new Date(tk.updatedAt).toLocaleString(i18n.language, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium">
                  {t(`support.status.${tk.status}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
