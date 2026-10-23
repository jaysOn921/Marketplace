import { useTranslation } from 'react-i18next';
import { setDisplayCurrency, useDisplayCurrency } from '../lib/display-currency';

/** "Show prices in: Both / TSh / K" control. */
export function DisplayCurrencySelect({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const { choice } = useDisplayCurrency();
  const options = ['BOTH', 'TZS', 'ZMW'] as const;
  return (
    <fieldset className={className}>
      <legend className="mb-1.5 text-sm font-medium text-stone-800">
        {t('currencyPref.label')}
      </legend>
      <div className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5">
        {options.map((o) => (
          <label
            key={o}
            className="cursor-pointer rounded-md px-3 py-1.5 text-sm has-[:checked]:bg-brand-700 has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-100"
          >
            <input
              type="radio"
              name="display-currency"
              value={o}
              checked={choice === o}
              onChange={() => setDisplayCurrency(o)}
              className="sr-only"
            />
            {t(`currencyPref.${o}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
