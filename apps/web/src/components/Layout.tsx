import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { ConverterMenu } from './ConverterMenu';
import { SearchBar } from './SearchBar';
import { UserMenu } from './UserMenu';
import { useLogout, useMe } from '../lib/auth';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-700 hover:bg-stone-100'
  }`;

function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="TZed home">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
        TZ
      </span>
      <span className="text-xl font-bold tracking-tight text-brand-800">
        TZ<span className="text-accent-500">ed</span>
      </span>
    </Link>
  );
}

export function Layout() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const links = [
    { to: '/search', label: t('nav.browse') },
    { to: '/sell', label: t('nav.sell') },
    { to: '/converter', label: t('nav.converter') },
    { to: '/help', label: t('nav.help') },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Logo />
          <SearchBar className="hidden md:flex" />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {links
              .filter((l) => l.to !== '/converter')
              .map((l) => (
                <NavLink key={l.to} to={l.to} className={navLinkClass}>
                  {l.label}
                </NavLink>
              ))}
            <UserMenu />
          </nav>
          <div className="ml-auto md:ml-0">
            <ConverterMenu />
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-stone-700 hover:bg-stone-100 md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="sr-only">{t('nav.menu')}</span>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="px-4 pb-3 md:hidden">
          <SearchBar />
        </div>
        {menuOpen && (
          <nav
            id="mobile-menu"
            className="border-t border-stone-200 px-4 py-2 md:hidden"
            aria-label="Mobile"
          >
            {[
              ...links,
              ...(user
                ? [
                    { to: '/account', label: t('nav.account') },
                    { to: '/account/seller', label: t('nav.sellerProfile') },
                  ]
                : [{ to: '/login', label: t('nav.signIn') }]),
            ].map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={(s) => `block ${navLinkClass(s)}`}
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </NavLink>
            ))}
            {user && (
              <button
                type="button"
                className={`block w-full text-left ${navLinkClass({ isActive: false })}`}
                onClick={() => {
                  setMenuOpen(false);
                  // Leave protected pages first, so they don't redirect to sign-in.
                  navigate('/');
                  logout.mutate();
                }}
              >
                {t('nav.signOut')}
              </button>
            )}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-stone-600 md:flex-row md:items-center md:justify-between">
          <p>{t('footer.countries')}</p>
          <nav className="flex gap-4" aria-label="Footer">
            <Link to="/help" className="hover:text-brand-700">
              {t('footer.help')}
            </Link>
            <Link to="/converter" className="hover:text-brand-700">
              {t('footer.converter')}
            </Link>
            <Link to="/terms" className="hover:text-brand-700">
              {t('footer.terms')}
            </Link>
            <Link to="/privacy" className="hover:text-brand-700">
              {t('footer.privacy')}
            </Link>
          </nav>
          <p>{t('footer.rights', { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
    </div>
  );
}
