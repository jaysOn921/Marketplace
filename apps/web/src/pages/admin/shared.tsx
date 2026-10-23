import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/Form';
import { apiErrors } from '../../lib/forms';

/** A button that asks for a reason before running an admin action. */
export function ReasonAction({
  label,
  danger,
  pending,
  error,
  onConfirm,
}: {
  label: string;
  danger?: boolean;
  pending?: boolean;
  error?: unknown;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const msg = apiErrors(error);
  const tone = danger
    ? 'border-red-300 text-red-800 hover:bg-red-50'
    : 'border-stone-300 hover:bg-stone-50';
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${tone}`}
      >
        {label}
      </button>
    );
  }
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onConfirm(reason);
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2" aria-label={label}>
      <label className="sr-only" htmlFor={`reason-${label}`}>
        {t('admin.reason')}
      </label>
      <input
        id={`reason-${label}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('admin.reasonPlaceholder')}
        className="min-w-48 flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
        autoFocus
      />
      <button
        type="submit"
        disabled={pending}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${danger ? 'bg-red-700 hover:bg-red-800' : 'bg-brand-700 hover:bg-brand-800'}`}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-lg px-2 py-1.5 text-sm hover:bg-stone-100"
      >
        {t('common.cancel')}
      </button>
      {(msg.message || msg.fields.reason) && (
        <div className="w-full">
          <Alert>{msg.fields.reason ?? msg.message}</Alert>
        </div>
      )}
    </form>
  );
}

export function PageHeader({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {intro && <p className="mt-1 text-sm text-stone-600">{intro}</p>}
      </div>
      {children}
    </div>
  );
}

export function Pager({
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
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
        className="rounded-lg border border-stone-300 px-3 py-1.5 disabled:opacity-40"
      >
        {t('search.prev')}
      </button>
      <span>{t('admin.pageOf', { page, pageCount })}</span>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => go(page + 1)}
        className="rounded-lg border border-stone-300 px-3 py-1.5 disabled:opacity-40"
      >
        {t('search.next')}
      </button>
    </div>
  );
}

export const inputClass = 'rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm';
