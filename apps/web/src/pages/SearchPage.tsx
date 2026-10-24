import {
  COUNTRY_CODES,
  CURRENCIES,
  LISTING_CONDITIONS,
  SEARCH_SORTS,
  formatMoney,
  type CurrencyCode,
  type SearchFacet,
  type SearchResponse,
} from '@tzed/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { DisplayCurrencySelect } from '../components/DisplayCurrencySelect';
import { Alert } from '../components/Form';
import { ListingGrid } from '../components/ListingCard';
import { useMe } from '../lib/auth';
import { useDisplayCurrency } from '../lib/display-currency';
import { useCategories } from '../lib/listings';
import { toApiQuery, useSearch } from '../lib/search';
import { useCategoryName } from '../lib/categoryName';

const FLAG = { TZ: '🇹🇿', ZM: '🇿🇲' } as const;

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-b border-stone-200 py-4 first:pt-0 last:border-0">
      <legend className="mb-2 text-sm font-semibold text-stone-800">{title}</legend>
      <div className="space-y-1.5">{children}</div>
    </fieldset>
  );
}

function Radio({
  name,
  checked,
  onChange,
  children,
}: {
  /** Shared per group, so arrow keys move between the options. */
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-brand-700"
      />
      <span className="flex flex-1 justify-between gap-2">{children}</span>
    </label>
  );
}

const count = (facets: SearchFacet[], key: string) => facets.find((f) => f.key === key)?.count;

function PriceFilter({
  params,
  update,
}: {
  params: URLSearchParams;
  update: (u: Record<string, string | null>) => void;
}) {
  const { t } = useTranslation();
  const { value: preferred } = useDisplayCurrency();
  const { data: user } = useMe();
  const currency =
    (params.get('currency') as CurrencyCode | null) ?? preferred ?? user?.currency ?? 'TZS';
  const [min, setMin] = useState(params.get('minPrice') ?? '');
  const [max, setMax] = useState(params.get('maxPrice') ?? '');
  useEffect(() => {
    setMin(params.get('minPrice') ?? '');
    setMax(params.get('maxPrice') ?? '');
  }, [params]);

  function apply(e: FormEvent) {
    e.preventDefault();
    const clean = (v: string) => v.replace(/[\s,]/g, '') || null;
    update({
      minPrice: clean(min),
      maxPrice: clean(max),
      currency: clean(min) || clean(max) ? currency : null,
    });
  }

  return (
    <form onSubmit={apply} className="space-y-2">
      <div className="flex gap-2" role="group" aria-label={t('search.filters.priceCurrency')}>
        {(['TZS', 'ZMW'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => update({ currency: c })}
            aria-pressed={currency === c}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              currency === c
                ? 'border-brand-700 bg-brand-50 text-brand-800'
                : 'border-stone-300 text-stone-600'
            }`}
          >
            {CURRENCIES[c].symbol} ({c})
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          inputMode="numeric"
          placeholder={t('search.filters.min')}
          aria-label={t('search.filters.minLabel', { currency })}
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="w-full min-w-0 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm"
        />
        <span className="text-stone-500">–</span>
        <input
          inputMode="numeric"
          placeholder={t('search.filters.max')}
          aria-label={t('search.filters.maxLabel', { currency })}
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="w-full min-w-0 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-lg border border-stone-300 py-1.5 text-sm font-medium hover:bg-stone-50"
      >
        {t('search.filters.applyPrice')}
      </button>
      <p className="text-xs text-stone-500">{t('search.filters.priceHint')}</p>
    </form>
  );
}

function Filters({
  data,
  params,
  update,
}: {
  data: SearchResponse | undefined;
  params: URLSearchParams;
  update: (u: Record<string, string | null>) => void;
}) {
  const { t } = useTranslation();
  const catName = useCategoryName();
  const { data: categories } = useCategories();
  const category = params.get('category');
  const conditions = (params.get('condition') ?? '').split(',').filter(Boolean);
  const facets = data?.facets ?? { categories: [], countries: [] };
  const current = data?.category;
  // Inside a category: show its subcategories; otherwise the top-level categories.
  const parentSlug = current?.parent?.slug ?? (current?.children.length ? current.slug : null);
  const parent = categories?.find((c) => c.slug === parentSlug);

  return (
    <div>
      <FilterGroup title={t('search.filters.category')}>
        {parent ? (
          <>
            <button
              type="button"
              onClick={() => update({ category: null })}
              className="text-sm text-brand-700 hover:underline"
            >
              ← {t('search.filters.allCategories')}
            </button>
            <Radio
              name="filter-category"
              checked={category === parent.slug}
              onChange={() => update({ category: parent.slug })}
            >
              <span className="font-medium">
                {t('search.filters.allIn', { name: catName(parent) })}
              </span>
            </Radio>
            {parent.children.map((c) => (
              <Radio
                name="filter-category"
                key={c.slug}
                checked={category === c.slug}
                onChange={() => update({ category: c.slug })}
              >
                <span>{catName(c)}</span>
                <span className="text-stone-500">{count(facets.categories, c.slug) ?? ''}</span>
              </Radio>
            ))}
          </>
        ) : (
          <>
            <Radio
              name="filter-category"
              checked={!category}
              onChange={() => update({ category: null })}
            >
              {t('search.filters.allCategories')}
            </Radio>
            {categories?.map((c) => (
              <Radio
                name="filter-category"
                key={c.slug}
                checked={category === c.slug}
                onChange={() => update({ category: c.slug })}
              >
                <span>{catName(c)}</span>
                <span className="text-stone-500">{count(facets.categories, c.slug) ?? 0}</span>
              </Radio>
            ))}
          </>
        )}
      </FilterGroup>

      <FilterGroup title={t('search.filters.availableIn')}>
        <Radio
          name="filter-availableIn"
          checked={!params.get('availableIn')}
          onChange={() => update({ availableIn: null })}
        >
          {t('search.filters.anywhere')}
        </Radio>
        {COUNTRY_CODES.map((c) => (
          <Radio
            name="filter-availableIn"
            key={c}
            checked={params.get('availableIn') === c}
            onChange={() => update({ availableIn: c })}
          >
            <span>
              {FLAG[c]} {t('search.filters.buyersIn', { country: t(`countries.${c}`) })}
            </span>
          </Radio>
        ))}
      </FilterGroup>

      <FilterGroup title={t('search.filters.sellerCountry')}>
        <Radio
          name="filter-country"
          checked={!params.get('country')}
          onChange={() => update({ country: null })}
        >
          {t('search.filters.bothCountries')}
        </Radio>
        {COUNTRY_CODES.map((c) => (
          <Radio
            name="filter-country"
            key={c}
            checked={params.get('country') === c}
            onChange={() => update({ country: c })}
          >
            <span>
              {FLAG[c]} {t(`countries.${c}`)}
            </span>
            <span className="text-stone-500">{count(facets.countries, c) ?? 0}</span>
          </Radio>
        ))}
      </FilterGroup>

      <FilterGroup title={t('listingForm.fields.condition')}>
        {LISTING_CONDITIONS.map((c) => (
          <label key={c} className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={conditions.includes(c)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...conditions, c]
                  : conditions.filter((x) => x !== c);
                update({ condition: next.length ? next.join(',') : null });
              }}
              className="h-4 w-4 rounded accent-brand-700"
            />
            {t(`condition.${c}`)}
          </label>
        ))}
      </FilterGroup>

      <FilterGroup title={t('search.filters.price')}>
        <PriceFilter params={params} update={update} />
      </FilterGroup>

      <div className="pt-4">
        <DisplayCurrencySelect />
      </div>
    </div>
  );
}

function ActiveFilters({
  params,
  update,
  clear,
}: {
  params: URLSearchParams;
  update: (u: Record<string, string | null>) => void;
  clear: () => void;
}) {
  const { t } = useTranslation();
  const catName = useCategoryName();
  const { data: categories } = useCategories();
  const chips: { key: string; label: string; remove: Record<string, string | null> }[] = [];
  const catSlug = params.get('category');
  if (catSlug) {
    const all = categories?.flatMap((c) => [c, ...c.children]) ?? [];
    chips.push({
      key: 'category',
      label: ((c) => (c ? catName(c) : catSlug))(all.find((c) => c.slug === catSlug)),
      remove: { category: null },
    });
  }
  const availableIn = params.get('availableIn');
  if (availableIn)
    chips.push({
      key: 'availableIn',
      label: t('search.filters.buyersIn', { country: t(`countries.${availableIn}`) }),
      remove: { availableIn: null },
    });
  const country = params.get('country');
  if (country)
    chips.push({
      key: 'country',
      label: t('search.chips.from', { country: t(`countries.${country}`) }),
      remove: { country: null },
    });
  for (const c of (params.get('condition') ?? '').split(',').filter(Boolean)) {
    const rest = (params.get('condition') ?? '').split(',').filter((x) => x && x !== c);
    chips.push({
      key: `condition-${c}`,
      label: t(`condition.${c}`),
      remove: { condition: rest.length ? rest.join(',') : null },
    });
  }
  const min = params.get('minPrice');
  const max = params.get('maxPrice');
  if (min || max) {
    const cur = (params.get('currency') as CurrencyCode | null) ?? 'TZS';
    const label =
      min && max
        ? `${formatMoney(+min, cur)} – ${formatMoney(+max, cur)}`
        : min
          ? `≥ ${formatMoney(+min, cur)}`
          : `≤ ${formatMoney(+max!, cur)}`;
    chips.push({ key: 'price', label, remove: { minPrice: null, maxPrice: null, currency: null } });
  }
  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => update(c.remove)}
          className="flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-800 hover:bg-brand-100"
          aria-label={t('search.chips.remove', { label: c.label })}
        >
          {c.label} <span aria-hidden="true">✕</span>
        </button>
      ))}
      <button
        type="button"
        onClick={clear}
        className="text-sm text-stone-600 underline hover:text-stone-900"
      >
        {t('search.chips.clearAll')}
      </button>
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  go,
}: {
  page: number;
  pageCount: number;
  go: (p: number) => void;
}) {
  const { t } = useTranslation();
  if (pageCount <= 1) return null;
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);
  const btn = 'min-w-9 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40';
  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-1.5"
      aria-label={t('search.pagination')}
    >
      <button
        type="button"
        className={`${btn} border-stone-300`}
        disabled={page <= 1}
        onClick={() => go(page - 1)}
      >
        {t('search.prev')}
      </button>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - pages[i - 1]! > 1 && <span className="text-stone-500">…</span>}
          <button
            type="button"
            onClick={() => go(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`${btn} ${p === page ? 'border-brand-700 bg-brand-700 text-white' : 'border-stone-300'}`}
          >
            {p}
          </button>
        </span>
      ))}
      <button
        type="button"
        className={`${btn} border-stone-300`}
        disabled={page >= pageCount}
        onClick={() => go(page + 1)}
      >
        {t('search.next')}
      </button>
    </nav>
  );
}

export function SearchPage() {
  const { t } = useTranslation();
  const catName = useCategoryName();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const apiQuery = toApiQuery(params);
  const { data, isPending, isFetching, isError } = useSearch(apiQuery);
  const q = params.get('q') ?? '';

  /** Changes some parameters; any filter change goes back to page 1. */
  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }
  const clear = () => setParams(q ? { q } : {});

  useEffect(() => {
    if ('scrollTo' in window && params.get('page')) window.scrollTo({ top: 0 });
  }, [params]);

  const heading = data?.category
    ? q
      ? t('search.inCategory', { q, category: catName(data.category) })
      : catName(data.category)
    : q
      ? t('search.resultsFor', { q })
      : t('search.browseAll');
  const activeCount = [
    'category',
    'availableIn',
    'country',
    'condition',
    'minPrice',
    'maxPrice',
  ].filter((k) => params.get(k)).length;

  return (
    <div className="space-y-5">
      <div>
        {data?.category?.parent && (
          <Link
            to={`/search?category=${data.category.parent.slug}`}
            className="text-sm text-brand-700 hover:underline"
          >
            {catName(data.category.parent)}
          </Link>
        )}
        <h1 className="text-2xl font-semibold">{heading}</h1>
        {data && (
          <p className="mt-1 text-sm text-stone-600" aria-live="polite">
            {t('search.count', { count: data.total })}
          </p>
        )}
      </div>

      {data?.category && data.category.children.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {data.category.children.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                onClick={() => update({ category: c.slug })}
                className="rounded-full border border-stone-300 bg-white px-3 py-1 text-sm hover:border-brand-600"
              >
                {catName(c)}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside aria-label={t('search.filters.title')}>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-controls="search-filters"
            className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium lg:hidden"
          >
            {t('search.filters.toggle', { count: activeCount })}
          </button>
          <div
            id="search-filters"
            className={`${filtersOpen ? 'mt-3 block' : 'hidden'} rounded-xl border border-stone-200 bg-white p-4 lg:mt-0 lg:block`}
          >
            <Filters data={data} params={params} update={update} />
          </div>
        </aside>

        <section className="min-w-0 space-y-4" aria-busy={isFetching}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ActiveFilters params={params} update={update} clear={clear} />
            <label className="ml-auto flex items-center gap-2 text-sm">
              <span className="text-stone-600">{t('search.sortLabel')}</span>
              <select
                value={data?.sort ?? params.get('sort') ?? ''}
                onChange={(e) => update({ sort: e.target.value })}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1.5"
              >
                {SEARCH_SORTS.filter((s) => s !== 'relevance' || q).map((s) => (
                  <option key={s} value={s}>
                    {t(`search.sort.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {data?.matchMode === 'any' && <Alert kind="info">{t('search.anyMatch', { q })}</Alert>}
          {isError && <Alert>{t('search.error')}</Alert>}

          {isPending ? (
            <ul
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              aria-label={t('common.loading')}
            >
              {Array.from({ length: 8 }, (_, i) => (
                <li key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-stone-200" />
              ))}
            </ul>
          ) : data && data.results.length > 0 ? (
            <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
              <ListingGrid listings={data.results} />
            </div>
          ) : (
            data && (
              <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center">
                <p className="font-medium">
                  {t(q ? 'search.empty.titleQuery' : 'search.empty.title', { q })}
                </p>
                <ul className="mt-3 space-y-1 text-sm text-stone-600">
                  <li>{t('search.empty.tipSpelling')}</li>
                  {activeCount > 0 && (
                    <li>
                      <button
                        type="button"
                        onClick={clear}
                        className="font-medium text-brand-700 underline"
                      >
                        {t('search.empty.tipFilters')}
                      </button>
                    </li>
                  )}
                  <li>
                    <Link to="/search" className="font-medium text-brand-700 underline">
                      {t('search.empty.tipBrowse')}
                    </Link>
                  </li>
                </ul>
              </div>
            )
          )}

          {data && (
            <Pagination
              page={data.page}
              pageCount={data.pageCount}
              go={(p) => update({ page: String(p) })}
            />
          )}
        </section>
      </div>
    </div>
  );
}
