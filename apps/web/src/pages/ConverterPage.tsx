import {
  convertMoney,
  formatMoney,
  isCurrencyCode,
  parseAmount,
  type CurrencyCode,
} from '@tzed/shared';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { CurrencyConverter } from '../components/CurrencyConverter';
import { useZmwTzsRate } from '../lib/rates';

const QUICK: Record<CurrencyCode, number[]> = {
  ZMW: [50, 100, 500, 1000, 5000],
  TZS: [10_000, 50_000, 100_000, 500_000, 1_000_000],
};

export function ConverterPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { data: rate } = useZmwTzsRate();

  // Supports links like /converter?amount=250000&from=TZS (e.g. from a listing).
  const from = params.get('from');
  const initialCurrency = isCurrencyCode(from) ? from : 'ZMW';
  const initialAmount = parseAmount(params.get('amount') ?? '') ?? undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">{t('converter.title')}</h1>
      <p className="mt-2 text-stone-600">{t('converter.intro')}</p>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1fr]">
        <section className="self-start rounded-xl border border-stone-200 bg-white p-5">
          <CurrencyConverter
            key={`${initialCurrency}-${initialAmount ?? ''}`}
            initialAmount={initialAmount}
            initialCurrency={initialCurrency}
          />
        </section>

        {rate && (
          <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
            {(['ZMW', 'TZS'] as const).map((c) => {
              const to = c === 'ZMW' ? 'TZS' : 'ZMW';
              return (
                <table
                  key={c}
                  className="w-full overflow-hidden rounded-xl border border-stone-200 bg-white text-sm"
                >
                  <caption className="bg-stone-100 px-3 py-2 text-left font-medium text-stone-700">
                    {t('converter.quickTitle', { from: c, to })}
                  </caption>
                  <tbody>
                    {QUICK[c].map((amount) => (
                      <tr key={amount} className="border-t border-stone-100">
                        <td className="px-3 py-1.5 tabular-nums">{formatMoney(amount, c)}</td>
                        <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                          {formatMoney(convertMoney(amount, c, to, rate), to)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })}
          </section>
        )}
      </div>

      <p className="mt-6 text-sm text-stone-500">{t('converter.disclaimer')}</p>
    </div>
  );
}
