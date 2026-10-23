import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CurrencyConverter } from './CurrencyConverter';

/** Header button that opens the currency converter on any page. */
export function ConverterMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
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
        aria-expanded={open}
        aria-controls="converter-panel"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 whitespace-nowrap rounded-md border border-stone-300 px-2.5 py-2 text-sm font-medium text-stone-700 hover:border-brand-600 hover:text-brand-700"
      >
        <span aria-hidden="true">TSh ⇄ K</span>
        <span className="sr-only">{t('converter.open')}</span>
      </button>
      {open && (
        <div
          id="converter-panel"
          role="dialog"
          aria-label={t('converter.title')}
          className="fixed inset-x-4 top-16 z-20 rounded-xl border border-stone-200 bg-white p-4 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{t('converter.title')}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-stone-500 hover:bg-stone-100"
              aria-label={t('converter.close')}
            >
              ✕
            </button>
          </div>
          <CurrencyConverter compact />
          <Link
            to="/converter"
            onClick={() => setOpen(false)}
            className="mt-3 block text-center text-sm font-medium text-brand-700 hover:underline"
          >
            {t('converter.fullPage')}
          </Link>
        </div>
      )}
    </div>
  );
}
