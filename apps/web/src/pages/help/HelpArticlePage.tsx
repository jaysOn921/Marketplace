import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useHelpArticle } from '../../lib/support';

export function HelpArticlePage() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const { data, isPending, isError } = useHelpArticle(slug);

  if (isPending) return <p className="text-stone-500">{t('common.loading')}</p>;
  if (isError || !data) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-xl font-semibold">{t('help.notFound')}</h1>
        <Link to="/help" className="mt-3 inline-block text-brand-700 hover:underline">
          {t('help.back')}
        </Link>
      </div>
    );
  }
  const { article, related } = data;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/help" className="text-sm text-brand-700 hover:underline">
        ← {t('help.back')}
      </Link>
      <article className="rounded-xl border border-stone-200 bg-white p-6">
        <p className="text-sm text-stone-500">
          {t(`help.topic.${article.topic}`, { defaultValue: article.topic })}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{article.title}</h1>
        <div className="mt-4 space-y-3 text-stone-700">
          {article.body.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </div>
      </article>
      {related.length > 0 && (
        <section>
          <h2 className="font-semibold">{t('help.related')}</h2>
          <ul className="mt-2 space-y-1">
            {related.map((r) => (
              <li key={r.slug}>
                <Link to={`/help/${r.slug}`} className="text-brand-700 hover:underline">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm text-stone-600">
        {t('help.notAnswered')}{' '}
        <Link
          to={`/help/contact?subject=${encodeURIComponent(article.title)}`}
          className="font-medium text-brand-700 hover:underline"
        >
          {t('help.contactUs')}
        </Link>
      </p>
    </div>
  );
}
