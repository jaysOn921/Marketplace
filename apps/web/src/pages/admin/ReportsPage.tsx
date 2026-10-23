import { REPORT_ACTIONS, type ReportAction, type ReportGroup } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert } from '../../components/Form';
import { apiErrors } from '../../lib/forms';
import { useReportQueue, useResolveReports } from '../../lib/support';

const FOR_TARGET: Record<ReportGroup['targetType'], ReportAction[]> = {
  LISTING: ['remove_listing', 'suspend_user'],
  USER: ['suspend_user'],
  MESSAGE: ['remove_message', 'suspend_user'],
};

function GroupCard({ group }: { group: ReportGroup }) {
  const { t, i18n } = useTranslation();
  const resolve = useResolveReports();
  const [actions, setActions] = useState<ReportAction[]>([]);
  const [note, setNote] = useState('');
  const when = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const error = apiErrors(resolve.error);

  function submit(decision: 'dismiss' | 'action') {
    resolve.mutate({
      targetType: group.targetType,
      targetId: group.targetId,
      decision,
      actions,
      note,
    });
  }
  const onAction = (e: FormEvent) => {
    e.preventDefault();
    submit('action');
  };

  return (
    <article
      className="space-y-3 rounded-xl border border-stone-200 bg-white p-4"
      aria-label={group.target.label}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            {t(`admin.reports.type.${group.targetType}`)} · {group.target.status}
          </p>
          <h2 className="font-semibold">
            {group.target.link ? (
              <Link to={group.target.link} className="hover:text-brand-700">
                {group.target.label}
              </Link>
            ) : (
              group.target.label
            )}
          </h2>
          {group.target.ownerName && (
            <p className="text-sm text-stone-600">
              {t('admin.reports.owner', { name: group.target.ownerName })}
            </p>
          )}
        </div>
        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-semibold text-red-800">
          {t('admin.reports.count', { count: group.count })}
        </span>
      </div>
      {group.target.detail && (
        <p className="line-clamp-4 whitespace-pre-line rounded-lg bg-stone-50 p-2 text-sm text-stone-700">
          {group.target.detail}
        </p>
      )}
      <p className="text-sm">
        {Object.entries(group.reasons).map(([r, n]) => (
          <span
            key={r}
            className="mr-2 inline-block rounded-full border border-stone-300 px-2 py-0.5 text-xs"
          >
            {t(`report.reason.${r}`)} × {n}
          </span>
        ))}
        {group.previouslyResolved > 0 && (
          <span className="text-xs text-amber-800">
            {t('admin.reports.previous', { count: group.previouslyResolved })}
          </span>
        )}
      </p>
      <ul className="space-y-1 text-sm">
        {group.reports.map((r) => (
          <li key={r.id} className="text-stone-700">
            <span className="font-medium">{r.reporterName}</span> · {t(`report.reason.${r.reason}`)}{' '}
            · <span className="text-stone-500">{when(r.createdAt)}</span>
            {r.details && <span className="block text-stone-600">“{r.details}”</span>}
          </li>
        ))}
      </ul>
      <form onSubmit={onAction} className="space-y-2 border-t border-stone-100 pt-3">
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="sr-only">{t('admin.reports.actions')}</legend>
          {REPORT_ACTIONS.filter((a) => FOR_TARGET[group.targetType].includes(a)).map((a) => (
            <label key={a} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={actions.includes(a)}
                onChange={(e) =>
                  setActions(e.target.checked ? [...actions, a] : actions.filter((x) => x !== a))
                }
                className="accent-red-700"
              />
              {t(`admin.reports.action.${a}`)}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t('admin.reports.note')}</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="block w-full rounded-lg border border-stone-300 px-2 py-1.5"
          />
        </label>
        {(error.message || error.fields.note) && (
          <Alert>{error.fields.note ?? error.message}</Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={resolve.isPending || !actions.length}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {t('admin.reports.takeAction')}
          </button>
          <button
            type="button"
            disabled={resolve.isPending}
            onClick={() => submit('dismiss')}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
          >
            {t('admin.reports.dismiss')}
          </button>
        </div>
      </form>
    </article>
  );
}

export function ReportsPage() {
  const { t } = useTranslation();
  const { data, isPending } = useReportQueue();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">{t('admin.reports.title')}</h1>
      <p className="text-stone-600">{t('admin.reports.intro')}</p>
      {isPending ? (
        <p className="text-stone-500">{t('common.loading')}</p>
      ) : !data?.length ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
          {t('admin.reports.empty')}
        </p>
      ) : (
        data.map((g) => <GroupCard key={`${g.targetType}-${g.targetId}`} group={g} />)
      )}
    </div>
  );
}
