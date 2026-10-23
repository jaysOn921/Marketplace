import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert } from '../../components/Form';
import { useAdminStats } from '../../lib/admin';
import { PageHeader } from './shared';

function Stat({
  label,
  value,
  to,
  tone,
}: {
  label: string;
  value: number | string;
  to?: string;
  tone?: 'warn';
}) {
  const body = (
    <>
      <p className="text-sm text-stone-600">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${tone === 'warn' && value ? 'text-amber-700' : ''}`}
      >
        {value}
      </p>
    </>
  );
  const cls = 'block rounded-xl border border-stone-200 bg-white p-4';
  return to ? (
    <Link to={to} className={`${cls} hover:border-brand-600`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { data } = useAdminStats();
  if (!data) return <p className="text-stone-500">{t('common.loading')}</p>;
  const l = data.listings;
  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.dashboard.title')} />
      {(!data.rate || data.rate.daysOld >= 7) && (
        <Alert kind="info">
          {data.rate
            ? t('admin.dashboard.rateOld', { days: data.rate.daysOld })
            : t('admin.dashboard.noRate')}{' '}
          <Link to="/admin/rates" className="font-medium underline">
            {t('admin.dashboard.updateRate')}
          </Link>
        </Alert>
      )}
      <section>
        <h2 className="mb-2 font-semibold">{t('admin.dashboard.waiting')}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label={t('admin.nav.review')}
            value={data.waiting.reviewQueue}
            to="/admin/review"
            tone="warn"
          />
          <Stat
            label={t('admin.nav.reports')}
            value={data.waiting.openReports}
            to="/admin/reports"
            tone="warn"
          />
          <Stat
            label={t('admin.dashboard.openTickets')}
            value={data.waiting.openTickets}
            to="/admin/tickets?status=OPEN"
            tone="warn"
          />
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">{t('admin.dashboard.marketplace')}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('admin.dashboard.users')} value={data.users.total} to="/admin/users" />
          <Stat
            label={t('admin.dashboard.byCountry')}
            value={`🇹🇿 ${data.users.byCountry.TZ ?? 0} · 🇿🇲 ${data.users.byCountry.ZM ?? 0}`}
          />
          <Stat label={t('admin.dashboard.newUsers')} value={data.users.newThisWeek} />
          <Stat
            label={t('admin.dashboard.suspended')}
            value={data.users.suspended}
            to="/admin/users?status=SUSPENDED"
          />
          <Stat
            label={t('admin.dashboard.liveListings')}
            value={l.ACTIVE ?? 0}
            to="/admin/listings?status=ACTIVE"
          />
          <Stat label={t('admin.dashboard.soldListings')} value={l.SOLD ?? 0} />
          <Stat label={t('admin.dashboard.orders')} value={data.orders.total} />
          <Stat label={t('admin.dashboard.ordersWeek')} value={data.orders.thisWeek} />
        </div>
      </section>
      {data.rate && (
        <p className="text-sm text-stone-600">
          {t('admin.dashboard.currentRate', {
            rate: data.rate.rate,
            date: new Date(data.rate.effectiveAt).toLocaleDateString(),
          })}
        </p>
      )}
    </div>
  );
}
