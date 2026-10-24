import { parseDayRange } from '@tzed/shared';
import { useTranslation } from 'react-i18next';

const DAY = 24 * 60 * 60 * 1000;

/** "4–7 days" / "siku 4–7", from [min, max], {min, max} or a "4-7" range. */
export function useDaysLabel() {
  const { t } = useTranslation();
  return (range: string | { min: number; max: number } | null | undefined) => {
    const r =
      typeof range === 'string' ? parseDayRange(range) : range ? [range.min, range.max] : null;
    return r ? t('delivery.days', { min: r[0], max: r[1] }) : null;
  };
}

/** The expected arrival window: `min` to `max` days after `from`. */
export function expectedWindow(from: string, days: { min: number; max: number }) {
  const start = new Date(from).getTime();
  return [new Date(start + days.min * DAY), new Date(start + days.max * DAY)] as const;
}
