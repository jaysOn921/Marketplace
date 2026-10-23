import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { useCounts } from '../../lib/messaging';

/** Admin area: side menu on desktop, a scrollable strip on phones. */
export function AdminLayout() {
  const { t } = useTranslation();
  const { data: counts } = useCounts();
  const links: { to: string; label: string; badge?: number }[] = [
    { to: '/admin', label: t('admin.nav.dashboard') },
    { to: '/admin/review', label: t('admin.nav.review'), badge: counts?.reviewQueue },
    { to: '/admin/reports', label: t('admin.nav.reports'), badge: counts?.openReports },
    { to: '/admin/tickets', label: t('admin.nav.tickets') },
    { to: '/admin/users', label: t('admin.nav.users') },
    { to: '/admin/listings', label: t('admin.nav.listings') },
    { to: '/admin/rates', label: t('admin.nav.rates') },
    { to: '/admin/categories', label: t('admin.nav.categories') },
    { to: '/admin/help', label: t('admin.nav.help') },
    { to: '/admin/audit', label: t('admin.nav.audit') },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
      <nav
        aria-label={t('admin.nav.label')}
        className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0"
      >
        <ul className="flex gap-1 lg:sticky lg:top-24 lg:flex-col">
          {links.map((l) => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                end={l.to === '/admin'}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive ? 'bg-brand-700 text-white' : 'text-stone-700 hover:bg-stone-100'
                  }`
                }
              >
                {l.label}
                {Boolean(l.badge) && (
                  <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-900">
                    {l.badge}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
