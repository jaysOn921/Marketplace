import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useMe } from '../lib/auth';
import { useSaved, useToggleSaved } from '../lib/saved';

/** A heart that saves the listing. Guests are sent to sign in first. */
export function SaveButton({
  listingId,
  title,
  variant = 'icon',
  className = '',
}: {
  listingId: number;
  title: string;
  variant?: 'icon' | 'full';
  className?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const { data } = useSaved();
  const toggle = useToggleSaved();
  const saved = data?.ids.includes(listingId) ?? false;

  function onClick() {
    if (!me) {
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    toggle.mutate({ listingId, save: !saved });
  }

  const heart = (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
        className={saved ? 'fill-red-600 stroke-red-700' : 'fill-none stroke-stone-700'}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={
        variant === 'icon' ? t(saved ? 'saved.removeItem' : 'saved.saveItem', { title }) : undefined
      }
      className={
        variant === 'icon'
          ? `rounded-full bg-white/95 p-1.5 shadow-sm hover:bg-white ${className}`
          : `inline-flex items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50 ${className}`
      }
    >
      {heart}
      {variant === 'full' && t(saved ? 'saved.saved' : 'saved.save')}
    </button>
  );
}
