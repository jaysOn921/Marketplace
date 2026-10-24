import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage } from '../i18n';

/** English | Kiswahili. Each name is written in its own language, so anyone can find theirs. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className={`flex items-center gap-1 ${className}`}
    >
      {LANGUAGES.map((l, i) => (
        <span key={l.code} className="flex items-center gap-1">
          {i > 0 && (
            <span aria-hidden="true" className="text-stone-400">
              |
            </span>
          )}
          <button
            type="button"
            lang={l.code}
            aria-pressed={i18n.resolvedLanguage === l.code}
            onClick={() => setLanguage(l.code)}
            className={`rounded px-1.5 py-0.5 ${
              i18n.resolvedLanguage === l.code
                ? 'font-semibold text-stone-900'
                : 'text-brand-700 underline hover:text-brand-800'
            }`}
          >
            {l.label}
          </button>
        </span>
      ))}
    </div>
  );
}
