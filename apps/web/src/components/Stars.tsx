import type { SellerRating } from '@tzed/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

/** Five stars filled to `value` (halves rounded to the nearest star). */
export function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  const full = Math.round(value);
  return (
    <span
      role="img"
      aria-label={t('reviews.outOf5', { value })}
      className={size === 'md' ? 'text-xl' : 'text-sm'}
    >
      <span aria-hidden="true" className="text-accent-500">
        {'★'.repeat(full)}
      </span>
      <span aria-hidden="true" className="text-stone-300">
        {'★'.repeat(5 - full)}
      </span>
    </span>
  );
}

/** "★★★★☆ 4.5 (12)" or "No reviews yet". */
export function RatingSummary({
  rating,
  compact = false,
}: {
  rating: SellerRating | null | undefined;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (!rating)
    return compact ? null : <span className="text-sm text-stone-500">{t('reviews.none')}</span>;
  if (compact) {
    return (
      <span
        className="text-xs text-stone-600"
        aria-label={t('reviews.summary', { average: rating.average, count: rating.count })}
      >
        <span aria-hidden="true">
          <span className="text-accent-500">★</span> {rating.average.toFixed(1)} ({rating.count})
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Stars value={rating.average} />
      <span className="font-medium">{rating.average.toFixed(1)}</span>
      <span className="text-stone-500">{t('reviews.count', { count: rating.count })}</span>
    </span>
  );
}

/** 1–5 star picker as a radio group (arrow keys work). */
export function StarInput({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{t('reviews.yourRating')}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer text-3xl leading-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-100"
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={n <= value ? 'text-accent-500' : 'text-stone-300 hover:text-accent-400'}
            >
              ★
            </span>
            <span className="sr-only">{t('reviews.starOption', { count: n })}</span>
          </label>
        ))}
      </div>
      {value > 0 && <p className="mt-1 text-sm text-stone-600">{t(`reviews.label.${value}`)}</p>}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}
