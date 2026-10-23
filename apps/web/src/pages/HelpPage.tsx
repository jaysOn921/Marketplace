import { HELP_TOPICS } from '@tzed/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '../components/Form';
import { useMe } from '../lib/auth';
import { useHelpArticles } from '../lib/support';

export function HelpPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const topic = params.get('topic');
  const [text, setText] = useState(q);
  const { data, isPending } = useHelpArticles(q, topic);
  const { data: me } = useMe();
  useEffect(() => setText(q), [q]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (text.trim()) next.set('q', text.trim());
    setParams(next);
  }
  const counts = Object.fromEntries((data?.topics ?? []).map((t) => [t.topic, t.count]));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-2xl bg-brand-700 px-6 py-8 text-white">
        <h1 className="text-2xl font-semibold">{t('help.title')}</h1>
        <p className="mt-1 text-brand-100">{t('help.intro')}</p>
        <form role="search" onSubmit={onSearch} className="mt-4 flex max-w-xl">
          <label htmlFor="help-search" className="sr-only">
            {t('help.searchLabel')}
          </label>
          <input
            id="help-search"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('help.searchPlaceholder')}
            className="min-w-0 flex-1 rounded-l-lg px-3 py-2 text-sm text-stone-900"
          />
          <button
            type="submit"
            className="rounded-r-lg bg-accent-500 px-4 text-sm font-medium text-stone-900 hover:bg-accent-400"
          >
            {t('search.button')}
          </button>
        </form>
      </div>

      {!q && (
        <nav className="flex flex-wrap gap-2" aria-label={t('help.topics')}>
          <button
            type="button"
            onClick={() => setParams({})}
            aria-pressed={!topic}
            className={`rounded-full border px-3 py-1 text-sm ${!topic ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-stone-300 bg-white'}`}
          >
            {t('help.allTopics')}
          </button>
          {HELP_TOPICS.filter((tp) => counts[tp]).map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => setParams({ topic: tp })}
              aria-pressed={topic === tp}
              className={`rounded-full border px-3 py-1 text-sm ${topic === tp ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-stone-300 bg-white'}`}
            >
              {t(`help.topic.${tp}`)} <span className="text-stone-400">({counts[tp]})</span>
            </button>
          ))}
        </nav>
      )}

      {q && <h2 className="text-lg font-semibold">{t('help.resultsFor', { q })}</h2>}
      {data?.matchMode === 'any' && <Alert kind="info">{t('help.anyMatch', { q })}</Alert>}
      {isPending ? (
        <p className="text-stone-500">{t('common.loading')}</p>
      ) : !data?.articles.length ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-stone-600">
          {t('help.noResults', { q })}
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {data.articles.map((a) => (
            <li key={a.slug}>
              <Link to={`/help/${a.slug}`} className="block p-4 hover:bg-stone-50">
                <span className="block font-medium text-brand-800">{a.title}</span>
                <span className="mt-0.5 block text-sm text-stone-600">{a.excerpt}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-semibold">{t('help.stillNeed')}</h2>
        <p className="mt-1 text-sm text-stone-600">{t('help.stillNeedBody')}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            to="/help/contact"
            className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
          >
            {t('help.contactUs')}
          </Link>
          {me && (
            <Link
              to="/support/tickets"
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
            >
              {t('support.myTickets')}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
