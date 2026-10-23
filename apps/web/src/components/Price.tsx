import { convertMoney, formatMoney, type CurrencyCode } from '@tzed/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useZmwTzsRate } from '../lib/rates';

const other = (c: CurrencyCode): CurrencyCode => (c === 'TZS' ? 'ZMW' : 'TZS');

/**
 * A price in the seller's currency, with the approximate amount in the other currency
 * underneath, so buyers on both sides understand it.
 */
export function Price({
  amount,
  currency,
  size = 'md',
  showConvert = false,
}: {
  amount: number;
  currency: CurrencyCode;
  size?: 'sm' | 'md' | 'lg';
  showConvert?: boolean;
}) {
  const { t } = useTranslation();
  const { data: rate } = useZmwTzsRate();
  const to = other(currency);
  const main = { sm: 'text-base', md: 'text-lg', lg: 'text-3xl' }[size];

  return (
    <div>
      <p className={`font-bold tabular-nums text-stone-900 ${main}`}>
        {formatMoney(amount, currency)}
      </p>
      {rate && (
        <p className={`tabular-nums text-stone-500 ${size === 'lg' ? 'text-base' : 'text-xs'}`}>
          ≈ {formatMoney(convertMoney(amount, currency, to, rate), to)}
          {showConvert && (
            <>
              {' · '}
              <Link
                to={`/converter?amount=${amount}&from=${currency}`}
                className="font-medium text-brand-700 hover:underline"
              >
                {t('listing.convert')}
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
