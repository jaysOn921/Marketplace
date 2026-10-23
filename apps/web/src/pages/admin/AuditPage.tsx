import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useAuditLog } from '../../lib/admin';
import { inputClass, PageHeader, Pager } from './shared';

function Change({ before, after }: { before: unknown; after: unknown }) {
  if (!before && !after) return null;
  return (
    <code className="block max-w-xl overflow-hidden text-ellipsis whitespace-nowrap text-xs text-stone-500">
      {before ? `${JSON.stringify(before)} → ` : ''}
      {after ? JSON.stringify(after) : ''}
    </code>
  );
}

export function AuditPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? undefined;
  const { data } = useAuditLog({
    action: get('action'),
    targetType: get('targetType'),
    targetId: get('targetId'),
    actorId: get('actorId'),
    from: get('from'),
    to: get('to'),
    include: get('include'),
    page: get('page'),
  });
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };
  return (
    <div>
      <PageHeader title={t('admin.nav.audit')} intro={t('admin.audit.intro')} />
      <div className="mb-3 flex flex-wrap items-end gap-2 text-sm">
        <label>
          <span className="mb-1 block">{t('admin.audit.action')}</span>
          <select
            value={get('action') ?? ''}
            onChange={(e) => set('action', e.target.value || null)}
            className={inputClass}
          >
            <option value="">{t('admin.audit.allActions')}</option>
            {data?.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block">{t('admin.audit.from')}</span>
          <input
            type="date"
            value={get('from') ?? ''}
            onChange={(e) => set('from', e.target.value || null)}
            className={inputClass}
          />
        </label>
        <label>
          <span className="mb-1 block">{t('admin.audit.to')}</span>
          <input
            type="date"
            value={get('to') ?? ''}
            onChange={(e) => set('to', e.target.value || null)}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-1.5 pb-2">
          <input
            type="checkbox"
            checked={get('include') === 'all'}
            onChange={(e) => set('include', e.target.checked ? 'all' : null)}
            className="accent-brand-700"
          />
          {t('admin.audit.security')}
        </label>
        {(get('targetType') || get('actorId')) && (
          <button
            type="button"
            onClick={() => setParams({})}
            className="pb-2 text-brand-700 underline"
          >
            {t('search.chips.clearAll')}
          </button>
        )}
      </div>
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white text-sm">
        {data?.rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
            <span className="w-36 shrink-0 text-xs text-stone-500">
              {new Date(r.createdAt).toLocaleString(i18n.language, {
                dateStyle: 'short',
                timeStyle: 'medium',
              })}
            </span>
            <span className="font-mono text-xs font-semibold">{r.action}</span>
            <span>
              {r.actorName ?? t('admin.audit.system')}
              {r.targetType && (
                <button
                  type="button"
                  onClick={() =>
                    setParams({
                      targetType: r.targetType!,
                      ...(r.targetId ? { targetId: String(r.targetId) } : {}),
                    })
                  }
                  className="ml-1 text-brand-700 hover:underline"
                >
                  → {r.targetType}
                  {r.targetId ? ` #${r.targetId}` : ''}
                </button>
              )}
            </span>
            <Change before={r.before} after={r.after} />
          </li>
        ))}
        {data && !data.rows.length && (
          <li className="p-6 text-center text-stone-600">{t('admin.none')}</li>
        )}
      </ul>
      {data && (
        <Pager page={data.page} pageCount={data.pageCount} go={(p) => set('page', String(p))} />
      )}
    </div>
  );
}
