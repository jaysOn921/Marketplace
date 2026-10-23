import {
  CURRENCIES,
  convertMoney,
  formatAmount,
  formatMoney,
  parseAmount,
  type CurrencyCode,
  type ExchangeRateInfo,
} from '@tzed/shared';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useZmwTzsRate } from '../lib/rates';

const FLAGS: Record<CurrencyCode, string> = { TZS: '🇹🇿', ZMW: '🇿🇲' };

interface Props {
  /** Pre-fill, e.g. from a listing price. */
  initialAmount?: number;
  initialCurrency?: CurrencyCode;
  /** Smaller layout for the header panel. */
  compact?: boolean;
}

type Values = Record<CurrencyCode, string>;

function otherCurrency(c: CurrencyCode): CurrencyCode {
  return c === 'ZMW' ? 'TZS' : 'ZMW';
}

function valuesFrom(
  amount: string,
  currency: CurrencyCode,
  rate: ExchangeRateInfo | null | undefined,
): Values {
  const other = otherCurrency(currency);
  const parsed = parseAmount(amount);
  const converted =
    parsed !== null && rate ? formatAmount(convertMoney(parsed, currency, other, rate), other) : '';
  return { [currency]: amount, [other]: converted } as Values;
}

export function CurrencyConverter({ initialAmount, initialCurrency = 'ZMW', compact }: Props) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const { data: rate, isPending, isError } = useZmwTzsRate();

  const [order, setOrder] = useState<[CurrencyCode, CurrencyCode]>([
    initialCurrency,
    otherCurrency(initialCurrency),
  ]);
  const [edited, setEdited] = useState<CurrencyCode>(initialCurrency);
  const [values, setValues] = useState<Values>(() =>
    valuesFrom(
      initialAmount !== undefined ? formatAmount(initialAmount, initialCurrency) : '',
      initialCurrency,
      null,
    ),
  );

  // Recalculate once the rate arrives (or changes), keeping what the user typed.
  useEffect(() => {
    if (rate) setValues((v) => valuesFrom(v[edited], edited, rate));
  }, [rate, edited]);

  function onChange(currency: CurrencyCode, text: string) {
    setEdited(currency);
    setValues(valuesFrom(text, currency, rate));
  }

  function onBlur(currency: CurrencyCode) {
    const parsed = parseAmount(values[currency]);
    if (parsed !== null) {
      setValues((v) => ({ ...v, [currency]: formatAmount(parsed, currency) }));
    }
  }

  const disabled = !rate;
  const updated = rate
    ? new Date(rate.effectiveAt).toLocaleDateString(i18n.language, { dateStyle: 'medium' })
    : '';

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex flex-col items-stretch gap-2">
        {order.map((currency, index) => (
          <div key={currency} className="contents">
            {index === 1 && (
              <button
                type="button"
                onClick={() => setOrder(([a, b]) => [b, a])}
                className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 hover:border-brand-600 hover:text-brand-700"
                aria-label={t('converter.swap')}
                title={t('converter.swap')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M7 4v14m0 0-3-3m3 3 3-3M17 20V6m0 0-3 3m3-3 3 3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
            <label htmlFor={`${id}-${currency}`} className="block">
              <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-stone-700">
                <span aria-hidden="true">{FLAGS[currency]}</span>
                {t(`converter.currency.${currency}`)} ({currency})
              </span>
              <span className="flex items-center rounded-lg border border-stone-300 bg-white focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100">
                <span className="pl-3 text-stone-500">{CURRENCIES[currency].symbol}</span>
                <input
                  id={`${id}-${currency}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={values[currency]}
                  disabled={disabled}
                  onChange={(e) => onChange(currency, e.target.value)}
                  onBlur={() => onBlur(currency)}
                  className={`w-full min-w-0 rounded-lg bg-transparent px-2 py-2 font-semibold tabular-nums focus:outline-none disabled:cursor-not-allowed ${
                    compact ? 'text-lg' : 'text-xl'
                  }`}
                />
              </span>
            </label>
          </div>
        ))}
      </div>

      {isPending && <p className="text-sm text-stone-500">{t('converter.loading')}</p>}
      {(isError || (!isPending && !rate)) && (
        <p role="alert" className="text-sm text-red-700">
          {t('converter.unavailable')}
        </p>
      )}
      {rate && (
        <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <p className="font-medium" data-testid="rate-line">
            {formatMoney(1, 'ZMW')} = {formatMoney(convertMoney(1, 'ZMW', 'TZS', rate), 'TZS')}{' '}
            <span className="mx-1 text-brand-600" aria-hidden="true">
              ·
            </span>{' '}
            {formatMoney(1000, 'TZS')} ={' '}
            {formatMoney(convertMoney(1000, 'TZS', 'ZMW', rate), 'ZMW')}
          </p>
          <p className="mt-0.5 text-xs text-brand-700">
            {t('converter.updated', { date: updated })} {t('converter.approximate')}
          </p>
        </div>
      )}
    </div>
  );
}
