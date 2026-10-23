import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useSuggestions } from '../lib/search';

type Option = { kind: 'search' | 'listing' | 'category'; label: string; to: string };

/** Header search box with suggestions as you type (WAI-ARIA combobox pattern). */
export function SearchBar({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const urlQ = location.pathname === '/search' ? (params.get('q') ?? '') : '';
  const [q, setQ] = useState(urlQ);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const { data } = useSuggestions(q);

  // Keep the box in sync when the URL query changes (e.g. back button).
  useEffect(() => setQ(urlQ), [urlQ]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) =>
      box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const term = q.trim();
  const options: Option[] =
    term.length >= 2 && data
      ? [
          {
            kind: 'search',
            label: t('search.suggest.searchFor', { q: term }),
            to: `/search?q=${encodeURIComponent(term)}`,
          },
          ...data.categories.map((c) => ({
            kind: 'category' as const,
            label: c.name,
            to: `/search?category=${c.slug}`,
          })),
          ...data.listings.map((l) => ({
            kind: 'listing' as const,
            label: l.title,
            to: `/listings/${l.id}`,
          })),
        ]
      : [];
  const showList = open && options.length > 1;

  function go(to: string) {
    setOpen(false);
    setActive(-1);
    navigate(to);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const chosen = showList && active >= 0 ? options[active] : undefined;
    if (chosen) return go(chosen.to);
    // Keep the current filters when searching from the results page.
    const next =
      location.pathname === '/search' ? new URLSearchParams(params) : new URLSearchParams();
    next.delete('page');
    if (term) next.set('q', term);
    else next.delete('q');
    go(`/search${next.size ? `?${next}` : ''}`);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (showList && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setActive((a) =>
        e.key === 'ArrowDown'
          ? (a + 1) % options.length
          : (a - 1 + options.length) % options.length,
      );
    }
  }

  return (
    <div ref={box} className={`relative w-full ${className}`}>
      <form role="search" onSubmit={onSubmit} className="flex w-full">
        <label htmlFor={`${id}-input`} className="sr-only">
          {t('search.label')}
        </label>
        <input
          id={`${id}-input`}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('search.placeholder')}
          className="min-w-0 flex-1 rounded-l-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          className="rounded-r-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          {t('search.button')}
        </button>
      </form>
      {showList && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={t('search.suggest.label')}
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {options.map((o, i) => (
            <li
              key={`${o.kind}-${o.to}`}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(o.to);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${i === active ? 'bg-brand-50' : ''}`}
            >
              <span aria-hidden="true" className="w-4 text-stone-500">
                {o.kind === 'search' ? '🔍' : o.kind === 'category' ? '📂' : '•'}
              </span>
              <span className="truncate">{o.label}</span>
              {o.kind === 'category' && (
                <span className="ml-auto text-xs text-stone-500">
                  {t('search.suggest.category')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
