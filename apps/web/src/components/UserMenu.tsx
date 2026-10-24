import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useNavigate } from 'react-router';
import { useLogout, useMe } from '../lib/auth';
import { useCounts } from '../lib/messaging';

/** "Sign in" when signed out; the user's name with an account menu when signed in. */
export function UserMenu() {
  const { t } = useTranslation();
  const { data: user, isPending } = useMe();
  const { data: counts } = useCounts();
  const pending = counts?.reviewQueue;
  const newOrders = counts?.ordersToAct;
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (isPending) return <span className="h-9 w-20" aria-hidden="true" />;
  if (!user) {
    return (
      <NavLink
        to="/login"
        className="ml-2 whitespace-nowrap rounded-md border border-brand-700 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
      >
        {t('nav.signIn')}
      </NavLink>
    );
  }

  const item = 'block px-4 py-2 text-sm text-stone-700 hover:bg-stone-50';
  return (
    <div ref={ref} className="relative ml-2">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-44 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate">{user.name.split(' ')[0]}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
        >
          <p className="truncate border-b border-stone-100 px-4 py-2 text-xs text-stone-500">
            {user.email}
          </p>
          <Link role="menuitem" to="/account" className={item} onClick={() => setOpen(false)}>
            {t('nav.account')}
          </Link>
          <Link
            role="menuitem"
            to={newOrders ? '/orders?role=selling' : '/orders'}
            className={`${item} flex justify-between`}
            onClick={() => setOpen(false)}
          >
            {t('nav.orders')}
            {Boolean(newOrders) && (
              <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold leading-5 text-amber-900">
                {newOrders}
              </span>
            )}
          </Link>
          <Link role="menuitem" to="/saved" className={item} onClick={() => setOpen(false)}>
            {t('saved.title')}
          </Link>
          <Link
            role="menuitem"
            to="/account/listings"
            className={item}
            onClick={() => setOpen(false)}
          >
            {t('nav.myListings')}
          </Link>
          {user.sellerProfile && (
            <Link
              role="menuitem"
              to="/account/analytics"
              className={item}
              onClick={() => setOpen(false)}
            >
              {t('nav.shopAnalytics')}
            </Link>
          )}
          <Link
            role="menuitem"
            to="/account/seller"
            className={item}
            onClick={() => setOpen(false)}
          >
            {t('nav.sellerProfile')}
          </Link>
          {user.role === 'ADMIN' && (
            <Link
              role="menuitem"
              to="/admin"
              className={`${item} flex justify-between`}
              onClick={() => setOpen(false)}
            >
              {t('nav.admin')}
              {Boolean(pending || counts?.openReports) && (
                <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold leading-5 text-amber-900">
                  {(pending ?? 0) + (counts?.openReports ?? 0)}
                </span>
              )}
            </Link>
          )}
          <Link
            role="menuitem"
            to="/support/tickets"
            className={item}
            onClick={() => setOpen(false)}
          >
            {t('support.myTickets')}
          </Link>
          <button
            role="menuitem"
            type="button"
            className={`${item} w-full text-left`}
            onClick={() => {
              setOpen(false);
              // Leave protected pages first, so they don't redirect to sign-in.
              navigate('/');
              logout.mutate();
            }}
          >
            {t('nav.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
