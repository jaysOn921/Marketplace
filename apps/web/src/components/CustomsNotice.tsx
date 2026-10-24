import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

/** Shown for cross-border orders: duty may apply, and the buyer ticks that they understand. */
export function CustomsNotice({
  checked,
  onChange,
  error,
  from,
  to,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
  from: string;
  to: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <p className="font-medium">{t('delivery.customsTitle', { from, to })}</p>
      <p className="mt-1">
        {t('delivery.customsBody')}{' '}
        <Link to="/help?q=customs" target="_blank" className="underline">
          {t('delivery.customsHelp')}
        </Link>
      </p>
      <label htmlFor={id} className="mt-2 flex items-start gap-2">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 h-4 w-4 accent-brand-700"
        />
        <span>{t('delivery.customsAccept')}</span>
      </label>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
