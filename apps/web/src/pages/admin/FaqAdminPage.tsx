import { HELP_TOPICS, type AdminFaqRow } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/Form';
import { adminPost, adminPut, useAdminAction, useAdminFaq } from '../../lib/admin';
import { apiErrors } from '../../lib/forms';
import { inputClass, PageHeader } from './shared';

function Editor({ article, onDone }: { article?: AdminFaqRow; onDone: () => void }) {
  const { t } = useTranslation();
  const [v, setV] = useState({
    title: article?.title ?? '',
    topic: article?.topic ?? 'getting-started',
    body: article?.body ?? '',
    isPublished: article?.isPublished ?? true,
  });
  const save = useAdminAction((input: typeof v) =>
    article ? adminPut(`help/articles/${article.id}`, input) : adminPost('help/articles', input),
  );
  const err = apiErrors(save.error);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(v, { onSuccess: onDone });
  };
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-brand-100 bg-white p-4">
      {(err.message || Object.keys(err.fields).length > 0) && (
        <Alert>{Object.values(err.fields)[0] ?? err.message}</Alert>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t('admin.help.titleField')}</span>
        <input
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          className={`${inputClass} w-full`}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t('admin.help.topic')}</span>
        <select
          value={v.topic}
          onChange={(e) => setV({ ...v, topic: e.target.value })}
          className={inputClass}
        >
          {HELP_TOPICS.map((tp) => (
            <option key={tp} value={tp}>
              {t(`help.topic.${tp}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t('admin.help.body')}</span>
        <textarea
          rows={8}
          value={v.body}
          onChange={(e) => setV({ ...v, body: e.target.value })}
          className="block w-full rounded-lg border border-stone-300 px-3 py-2"
        />
      </label>
      <p className="text-xs text-stone-500">{t('admin.help.bodyHint')}</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={v.isPublished}
          onChange={(e) => setV({ ...v, isPublished: e.target.checked })}
          className="accent-brand-700"
        />
        {t('admin.help.published')}
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white"
        >
          {t('account.save')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-4 py-2 text-sm hover:bg-stone-100"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

export function FaqAdminPage() {
  const { t } = useTranslation();
  const { data } = useAdminFaq();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title={t('admin.nav.help')} intro={t('admin.help.intro')}>
        {editing === null && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white"
          >
            {t('admin.help.new')}
          </button>
        )}
      </PageHeader>
      {editing === 'new' && <Editor onDone={() => setEditing(null)} />}
      <ul className="space-y-2">
        {data?.articles.map((a) =>
          editing === a.id ? (
            <li key={a.id}>
              <Editor article={a} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{a.title}</span>
                <span className="text-xs text-stone-500">
                  {t(`help.topic.${a.topic}`, { defaultValue: a.topic })} · /help/{a.slug}
                  {!a.isPublished && ` · ${t('admin.help.draft')}`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setEditing(a.id)}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
              >
                {t('admin.help.edit')}
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
