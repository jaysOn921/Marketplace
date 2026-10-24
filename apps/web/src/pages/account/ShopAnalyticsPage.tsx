import { formatMoney } from '@tzed/shared';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { DailyBars, KpiTile, PeriodPicker } from '../../components/charts';
import { StatusBadge } from '../../components/StatusBadge';
import { useSellerAnalytics } from '../../lib/analytics';

export function ShopAnalyticsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const days = Number(params.get('days')) || 30;
  const { data: a } = useSellerAnalytics(days);
  const money = (v: number) => (a ? formatMoney(v, a.currency) : String(v));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('analytics.shopTitle')}</h1>
          <p className="mt-1 text-sm text-stone-600">{t('analytics.shopIntro')}</p>
        </div>
        <PeriodPicker value={days} onChange={(d) => setParams({ days: String(d) })} />
      </div>

      {a && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiTile label={t('analytics.views')} kpi={a.kpis.views} />
            <KpiTile label={t('analytics.cartAdds')} kpi={a.kpis.cartAdds} />
            <KpiTile label={t('analytics.ordersPlaced')} kpi={a.kpis.ordersPlaced} />
            <KpiTile label={t('analytics.unitsSold')} kpi={a.kpis.unitsSold} />
            <KpiTile label={t('analytics.sales')} kpi={a.kpis.sales} format={money} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <DailyBars title={t('analytics.viewsDaily')} points={a.daily.views} />
            <DailyBars title={t('analytics.ordersDaily')} points={a.daily.orders} />
          </div>

          <section className="rounded-xl border border-stone-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">{t('analytics.perListing')}</h2>
            {a.listings.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="text-left text-stone-600">
                      <th className="py-1 font-medium">{t('analytics.listing')}</th>
                      <th className="py-1 text-right font-medium">{t('analytics.views')}</th>
                      <th className="py-1 text-right font-medium">{t('analytics.cartAdds')}</th>
                      <th className="py-1 text-right font-medium">{t('analytics.orders')}</th>
                      <th className="py-1 text-right font-medium">{t('analytics.units')}</th>
                      <th className="py-1 text-right font-medium">{t('analytics.sales')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {a.listings.map((l) => (
                      <tr key={l.id}>
                        <td className="py-1.5">
                          <Link to={`/listings/${l.id}`} className="text-brand-700 underline">
                            {l.title}
                          </Link>{' '}
                          <StatusBadge status={l.status} />
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{l.views}</td>
                        <td className="py-1.5 text-right tabular-nums">{l.cartAdds}</td>
                        <td className="py-1.5 text-right tabular-nums">{l.orders}</td>
                        <td className="py-1.5 text-right tabular-nums">{l.units}</td>
                        <td className="py-1.5 text-right tabular-nums">{money(l.sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-stone-600">
                {t('analytics.noListings')}{' '}
                <Link to="/sell" className="text-brand-700 underline">
                  {t('nav.sell')}
                </Link>
              </p>
            )}
            <p className="mt-3 text-xs text-stone-500">{t('analytics.privacy')}</p>
          </section>
        </>
      )}
    </div>
  );
}
