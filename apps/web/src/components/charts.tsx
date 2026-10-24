import type { DailyPoint, Kpi } from '@tzed/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** "12 Oct" style label for a YYYY-MM-DD day. */
function dayLabel(day: string, lang: string) {
  return new Date(day + 'T00:00:00Z').toLocaleDateString(lang, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Rounds the axis maximum up to a tidy number (1, 2 or 5 × 10ⁿ). */
function niceMax(max: number) {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= max)!;
}

/**
 * One series of daily values as bars, with a hover tooltip and a table view.
 * Long periods (90/365 days) are grouped into weeks so bars stay readable.
 */
export function DailyBars({
  title,
  points,
  format = (v) => v.toLocaleString(),
}: {
  title: string;
  points: DailyPoint[];
  format?: (v: number) => string;
}) {
  const { t, i18n } = useTranslation();
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  // Draw at the real on-screen width, so labels are 11px on phones and desktops alike.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(360);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setW(Math.max(200, Math.round(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [asTable]);

  // Group into weeks for long periods.
  const step = points.length > 60 ? 7 : 1;
  const bars: { label: string; from: string; value: number }[] = [];
  for (let i = 0; i < points.length; i += step) {
    const chunk = points.slice(i, i + step);
    bars.push({
      from: chunk[0]!.day,
      label:
        step === 1
          ? dayLabel(chunk[0]!.day, i18n.language)
          : `${dayLabel(chunk[0]!.day, i18n.language)} – ${dayLabel(chunk.at(-1)!.day, i18n.language)}`,
      value: chunk.reduce((s, p) => s + p.value, 0),
    });
  }
  const total = points.reduce((s, p) => s + p.value, 0);
  const max = niceMax(Math.max(...bars.map((b) => b.value)));

  const H = 160;
  const pad = { top: 16, right: 2, bottom: 20, left: 2 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const slot = plotW / bars.length;
  const gap = Math.min(2, slot * 0.2);
  const barW = Math.max(1, slot - gap);
  const r = Math.min(4, barW / 2);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  // Whole numbers only for counts: no "0.5 orders" gridline.
  const ticks = Number.isInteger(max / 2) ? [0, max / 2, max] : [0, max];
  // About one date label per 90px.
  const labelEvery = Math.ceil(bars.length / Math.max(2, Math.floor(W / 90)));

  return (
    <figure className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <figcaption id={titleId} className="font-semibold">
          {title}
        </figcaption>
        <div className="flex items-baseline gap-3 text-sm">
          <span className="text-stone-600">
            {t('analytics.periodTotal', { value: format(total) })}
          </span>
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            className="text-brand-700 underline hover:text-brand-800"
          >
            {asTable ? t('analytics.showChart') : t('analytics.showTable')}
          </button>
        </div>
      </div>

      {asTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm" aria-labelledby={titleId}>
            <thead>
              <tr className="text-left text-stone-600">
                <th className="py-1 font-medium">
                  {t(step === 1 ? 'analytics.day' : 'analytics.week')}
                </th>
                <th className="py-1 text-right font-medium">{title}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {bars.map((b) => (
                <tr key={b.from}>
                  <td className="py-1">{b.label}</td>
                  <td className="py-1 text-right tabular-nums">{format(b.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative" ref={box}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            className="block max-w-full"
            role="img"
            aria-labelledby={titleId}
            onMouseLeave={() => setActive(null)}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line
                  x1={pad.left}
                  x2={W - pad.right}
                  y1={y(v)}
                  y2={y(v)}
                  className="stroke-stone-200"
                  strokeWidth="1"
                />
                {v > 0 && (
                  <text x={pad.left + 2} y={y(v) - 3} className="fill-stone-500 text-[11px]">
                    {format(v)}
                  </text>
                )}
              </g>
            ))}
            {bars.map((b, i) => {
              const x = pad.left + i * slot + gap / 2;
              const top = y(b.value);
              const h = pad.top + plotH - top;
              return (
                <g key={b.from}>
                  {h > 0 && (
                    <path
                      // Rounded top, square base on the axis.
                      d={`M${x},${top + h} V${top + Math.min(r, h)} Q${x},${top} ${x + Math.min(r, h)},${top} H${x + barW - Math.min(r, h)} Q${x + barW},${top} ${x + barW},${top + Math.min(r, h)} V${top + h} Z`}
                      className={active === i ? 'fill-brand-800' : 'fill-brand-700'}
                    />
                  )}
                  {i % labelEvery === 0 && (
                    <text
                      x={i === 0 ? x : x + barW / 2}
                      y={H - 6}
                      textAnchor={i === 0 ? 'start' : 'middle'}
                      className="fill-stone-500 text-[11px]"
                    >
                      {dayLabel(b.from, i18n.language)}
                    </text>
                  )}
                  {/* Hit target: the whole column, wider than the bar. */}
                  <rect
                    x={pad.left + i * slot}
                    y={pad.top}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setActive(i)}
                  />
                </g>
              );
            })}
          </svg>
          {active !== null && bars[active] && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs shadow"
              style={{
                left: `${((active + 0.5) / bars.length) * 100}%`,
                transform: `translateX(${active > bars.length / 2 ? '-100%' : '0'})`,
              }}
            >
              <span className="block text-stone-600">{bars[active].label}</span>
              <span className="font-semibold tabular-nums">{format(bars[active].value)}</span>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** A headline number with its change against the previous period, in words and an arrow. */
export function KpiTile({
  label,
  kpi,
  format = (v) => v.toLocaleString(),
}: {
  label: string;
  kpi: Kpi;
  format?: (v: number) => string;
}) {
  const { t } = useTranslation();
  const diff = kpi.value - kpi.previous;
  const pct = kpi.previous ? Math.round((diff / kpi.previous) * 100) : null;
  const change =
    diff === 0
      ? t('analytics.noChange')
      : pct === null
        ? t('analytics.upFromZero')
        : t(diff > 0 ? 'analytics.up' : 'analytics.down', { pct: Math.abs(pct) });
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-sm text-stone-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{format(kpi.value)}</p>
      <p className="mt-1 text-xs text-stone-600">
        <span
          aria-hidden="true"
          className={diff > 0 ? 'text-brand-700' : diff < 0 ? 'text-red-700' : ''}
        >
          {diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : ''}
        </span>
        {change}
        <span className="text-stone-500">
          {' '}
          · {t('analytics.previous', { value: format(kpi.previous) })}
        </span>
      </p>
    </div>
  );
}

/** The 7 / 30 / 90 / 365 days switch. */
export function PeriodPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (days: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('analytics.period')}
      className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5"
    >
      {[7, 30, 90, 365].map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={value === d}
          onClick={() => onChange(d)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            value === d ? 'bg-brand-700 text-white' : 'text-stone-700 hover:bg-stone-100'
          }`}
        >
          {t('analytics.days', { count: d })}
        </button>
      ))}
    </div>
  );
}
