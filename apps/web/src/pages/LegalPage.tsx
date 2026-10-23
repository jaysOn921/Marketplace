import { useTranslation } from 'react-i18next';

/** Draft terms and privacy pages. These need a legal review before launch. */
export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const { t } = useTranslation();
  const sections = t(`legal.${kind}.sections`, { returnObjects: true }) as {
    heading: string;
    body: string;
  }[];
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">{t(`legal.${kind}.title`)}</h1>
      <p className="mt-2 text-sm text-stone-500">{t('legal.draftNotice')}</p>
      {sections.map((s) => (
        <section key={s.heading} className="mt-6">
          <h2 className="font-semibold">{s.heading}</h2>
          <p className="mt-1 whitespace-pre-line text-stone-700">{s.body}</p>
        </section>
      ))}
    </article>
  );
}
