/** "just now", "5 min ago", "3 h ago", "2 days ago", or a date for older times. */
export function timeAgo(iso: string, locale: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (seconds < 45) return rtf.format(0, 'second');
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), 'minute');
  if (seconds < 86_400) return rtf.format(-Math.round(seconds / 3600), 'hour');
  if (seconds < 7 * 86_400) return rtf.format(-Math.round(seconds / 86_400), 'day');
  return new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' });
}
