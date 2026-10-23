import type { AdminCategoryRow } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/Form';
import { adminPost, adminPut, useAdminAction, useAdminCategories } from '../../lib/admin';
import { apiErrors } from '../../lib/forms';
import { inputClass, PageHeader } from './shared';

function CategoryRow({ c, parents }: { c: AdminCategoryRow; parents: AdminCategoryRow[] }) {
  const { t } = useTranslation();
  const [name, setName] = useState(c.name);
  const [sortOrder, setSortOrder] = useState(String(c.sortOrder));
  const save = useAdminAction((input: object) => adminPut(`categories/${c.id}`, input));
  const send = (extra: object = {}) =>
    save.mutate({
      name,
      sortOrder: Number(sortOrder),
      parentId: c.parentId,
      isActive: c.isActive,
      ...extra,
    });
  return (
    <li className={`flex flex-wrap items-center gap-2 py-2 ${c.parentId ? 'pl-6' : ''}`}>
      <input
        aria-label={t('admin.categories.name')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`${inputClass} min-w-40 flex-1`}
      />
      <input
        aria-label={t('admin.categories.order')}
        type="number"
        min={0}
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
        className={`${inputClass} w-20`}
      />
      <span className="text-xs text-stone-500">
        {t('admin.categories.listings', { count: c.listings })}
        {c.parentId ? ` · ${parents.find((p) => p.id === c.parentId)?.name}` : ''}
      </span>
      <button
        type="button"
        onClick={() => send()}
        disabled={save.isPending}
        className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
      >
        {t('account.save')}
      </button>
      <button
        type="button"
        onClick={() => send({ isActive: !c.isActive })}
        className={`rounded-lg px-3 py-1.5 text-sm ${c.isActive ? 'text-stone-600 hover:bg-stone-100' : 'bg-amber-100 text-amber-900'}`}
      >
        {c.isActive ? t('admin.categories.hide') : t('admin.categories.show')}
      </button>
      {save.isError && (
        <span className="w-full text-sm text-red-700">{apiErrors(save.error).message}</span>
      )}
    </li>
  );
}

export function CategoriesPage() {
  const { t } = useTranslation();
  const { data } = useAdminCategories();
  const create = useAdminAction((input: { name: string; parentId: number | null }) =>
    adminPost('categories', input),
  );
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const all = data?.categories ?? [];
  const parents = all.filter((c) => !c.parentId);
  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name, parentId: parentId ? Number(parentId) : null },
      { onSuccess: () => setName('') },
    );
  };
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title={t('admin.nav.categories')} intro={t('admin.categories.intro')} />
      <form
        onSubmit={onCreate}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 bg-white p-4"
      >
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t('admin.categories.new')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t('admin.categories.parent')}</span>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={inputClass}
          >
            <option value="">{t('admin.categories.topLevel')}</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={name.trim().length < 2 || create.isPending}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {t('admin.categories.add')}
        </button>
        {create.isError && (
          <div className="w-full">
            <Alert>{apiErrors(create.error).message}</Alert>
          </div>
        )}
      </form>
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white px-4">
        {parents
          .flatMap((p) => [p, ...all.filter((c) => c.parentId === p.id)])
          .map((c) => (
            <CategoryRow
              key={`${c.id}-${c.name}-${c.isActive}-${c.sortOrder}`}
              c={c}
              parents={parents}
            />
          ))}
      </ul>
    </div>
  );
}
