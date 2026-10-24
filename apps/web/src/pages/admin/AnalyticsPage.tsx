import { formatMoney } from '@tzed/shared';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { DailyBars, KpiTile, PeriodPicker } from '../../components/charts';
import { OrderStatusBadge } from '../../components/OrderStatusBadge';
import { useAdminAnalytics } from '../../lib/analytics';
import { PageHeader } from './shared';

const tsh = (v: number) => formatMoney(v, 'TZS');

export function AnalyticsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const days = Number(params.get('days')) || 30;
  const { data: a } = useAdminAnalytics(days);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.nav.analytics')}
        intro={
          a
            ? t('analytics.adminIntro', {
                from: a.from,
                to: a.to,
                rate: a.rate ?? '—',
              })
            : undefined
        }
      >
        <PeriodPicker value={days} onChange={(d) => setParams({ days: String(d) })} />
      </PageHeader>

      {a && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label={t('analytics.sales')} kpi={a.kpis.sales} format={tsh} />
            <KpiTile label={t('analytics.ordersPlaced')} kpi={a.kpis.ordersPlaced} />
            <KpiTile label={t('analytics.ordersCompleted')} kpi={a.kpis.ordersCompleted} />
            <KpiTile label={t('analytics.newUsers')} kpi={a.kpis.newUsers} />
            <KpiTile label={t('analytics.newListings')} kpi={a.kpis.newListings} />
            <KpiTile label={t('analytics.views')} kpi={a.kpis.views} />
            <KpiTile label={t('analytics.cartAdds')} kpi={a.kpis.cartAdds} />
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-600">{t('analytics.conversion')}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {a.kpis.views.value
                  ? `${((a.kpis.ordersPlaced.value / a.kpis.views.value) * 100).toFixed(1)}%`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-stone-600">{t('analytics.conversionHint')}</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <DailyBars title={t('analytics.salesDaily')} points={a.daily.sales} format={tsh} />
            <DailyBars title={t('analytics.ordersDaily')} points={a.daily.orders} />
            <DailyBars title={t('analytics.viewsDaily')} points={a.daily.views} />
            <DailyBars title={t('analytics.usersDaily')} points={a.daily.newUsers} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="mb-2 font-semibold">{t('analytics.byCountry')}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-stone-600">
                    <th className="py-1 font-medium">{t('analytics.country')}</th>
                    <th className="py-1 text-right font-medium">{t('analytics.newUsers')}</th>
                    <th className="py-1 text-right font-medium">{t('analytics.buyerOrders')}</th>
                    <th className="py-1 text-right font-medium">{t('analytics.sellerSales')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {a.countries.map((c) => (
                    <tr key={c.code}>
                      <td className="py-1.5">{t(`countries.${c.code}`)}</td>
                      <td className="py-1.5 text-right tabular-nums">{c.newUsers}</td>
                      <td className="py-1.5 text-right tabular-nums">{c.ordersAsBuyer}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatMoney(c.sales, c.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-sm text-stone-600">
                {t('analytics.crossBorder', {
                  count: a.crossBorderOrders,
                  total: a.kpis.ordersPlaced.value,
                })}
              </p>
            </section>

            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="mb-2 font-semibold">{t('analytics.statuses')}</h2>
              {a.statuses.length ? (
                <ul className="space-y-1.5 text-sm">
                  {a.statuses.map((s) => (
                    <li key={s.status} className="flex items-center justify-between">
                      <OrderStatusBadge status={s.status} />
                      <span className="tabular-nums">{s.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-stone-600">{t('analytics.noOrders')}</p>
              )}
            </section>

            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="mb-2 font-semibold">{t('analytics.topCategories')}</h2>
              {a.topCategories.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-stone-600">
                      <th className="py-1 font-medium">{t('analytics.category')}</th>
                      <th className="py-1 text-right font-medium">{t('analytics.orders')}</th>
                      <th className="py-1 text-right font-medium">{t('analytics.units')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {a.topCategories.map((c) => (
                      <tr key={c.slug}>
                        <td className="py-1.5">{c.name}</td>
                        <td className="py-1.5 text-right tabular-nums">{c.orders}</td>
                        <td className="py-1.5 text-right tabular-nums">{c.units}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-stone-600">{t('analytics.noOrders')}</p>
              )}
            </section>

            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="mb-2 font-semibold">{t('analytics.topSellers')}</h2>
              {a.topSellers.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-stone-600">
                      <th className="py-1 font-medium">{t('analytics.seller')}</th>
                      <th className="py-1 text-right font-medium">{t('analytics.completed')}</th>
                      <th className="py-1 text-right font-medium">{t('analytics.sales')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {a.topSellers.map((s) => (
                      <tr key={s.id}>
                        <td className="py-1.5">
                          {s.shopSlug ? (
                            <Link to={`/shop/${s.shopSlug}`} className="text-brand-700 underline">
                              {s.name}
                            </Link>
                          ) : (
                            s.name
                          )}{' '}
                          <span className="text-stone-500">{s.countryCode}</span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{s.orders}</td>
                        <td className="py-1.5 text-right tabular-nums">{tsh(s.sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-stone-600">{t('analytics.noSales')}</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
