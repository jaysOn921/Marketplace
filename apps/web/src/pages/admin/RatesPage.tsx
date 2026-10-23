import { convertMoney, formatMoney } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/Form';
import { adminPost, useAdminAction, useRateHistory } from '../../lib/admin';
import { ApiRequestError } from '../../lib/api';
import { apiErrors } from '../../lib/forms';
import { inputClass, PageHeader } from './shared';

export function RatesPage() {
  const { t, i18n } = useTranslation();
  const { data } = useRateHistory();
  const save = useAdminAction(
    (input: { rate: number; note?: string; confirmLargeChange?: boolean }) =>
      adminPost('rates', input),
  );
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');
  const current = data?.history[0];
  const value = Number(rate.replace(/,/g, ''));
  const needsConfirm =
    save.error instanceof ApiRequestError && save.error.code === 'LARGE_RATE_CHANGE';

  function submit(confirmLargeChange?: boolean) {
    save.mutate(
      { rate: value, note: note || undefined, confirmLargeChange },
      {
        onSuccess: () => {
          setRate('');
          setNote('');
        },
      },
    );
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };
  const err = apiErrors(save.error);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t('admin.rates.title')} intro={t('admin.rates.intro')} />
      {current && (
        <p className="rounded-xl border border-stone-200 bg-white p-4">
          <span className="text-sm text-stone-600">{t('admin.rates.current')}</span>
          <span className="block text-2xl font-bold">
            K 1 = TSh {current.rate.toLocaleString('en-US', { maximumFractionDigits: 4 })}
          </span>
          <span className="text-sm text-stone-500">
            TSh 1,000 ={' '}
            {formatMoney(
              convertMoney(1000, 'TZS', 'ZMW', { base: 'ZMW', quote: 'TZS', rate: current.rate }),
              'ZMW',
            )}{' '}
            ·{' '}
            {new Date(current.effectiveAt).toLocaleString(i18n.language, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        </p>
      )}
      <form
        onSubmit={onSubmit}
        className="space-y-3 rounded-xl border border-stone-200 bg-white p-4"
      >
        <h2 className="font-semibold">{t('admin.rates.set')}</h2>
        {save.isSuccess && <Alert kind="success">{t('admin.rates.saved')}</Alert>}
        {needsConfirm ? (
          <Alert kind="info">
            {err.message}{' '}
            <button type="button" onClick={() => submit(true)} className="font-medium underline">
              {t('admin.rates.confirm')}
            </button>
          </Alert>
        ) : (
          (err.message || Object.keys(err.fields).length > 0) && (
            <Alert>{err.fields.rate ?? err.message}</Alert>
          )
        )}
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t('admin.rates.rateLabel')}</span>
          <span className="flex items-center gap-2">
            K 1 = TSh{' '}
            <input
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className={`${inputClass} w-32`}
              aria-label={t('admin.rates.rateLabel')}
            />
          </span>
        </label>
        {value > 0 && (
          <p className="text-sm text-stone-600">
            {t('admin.rates.preview', {
              k: formatMoney(
                convertMoney(1000, 'TZS', 'ZMW', { base: 'ZMW', quote: 'TZS', rate: value }),
                'ZMW',
              ),
            })}
          </p>
        )}
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t('admin.rates.note')}</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('admin.rates.notePlaceholder')}
            className={`${inputClass} w-full`}
          />
        </label>
        <button
          type="submit"
          disabled={!value || save.isPending}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {t('admin.rates.save')}
        </button>
      </form>
      <section>
        <h2 className="mb-2 font-semibold">{t('admin.rates.history')}</h2>
        <table className="w-full overflow-hidden rounded-xl border border-stone-200 bg-white text-sm">
          <thead className="bg-stone-50 text-left text-stone-600">
            <tr>
              <th className="px-3 py-2">{t('admin.rates.when')}</th>
              <th className="px-3 py-2">K 1 = TSh</th>
              <th className="px-3 py-2">{t('admin.rates.by')}</th>
              <th className="px-3 py-2">{t('admin.rates.note')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.history.map((h) => (
              <tr key={h.id} className="border-t border-stone-100">
                <td className="px-3 py-2">
                  {new Date(h.effectiveAt).toLocaleString(i18n.language, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="px-3 py-2 tabular-nums">{h.rate}</td>
                <td className="px-3 py-2">{h.setBy ?? t('admin.rates.seed')}</td>
                <td className="px-3 py-2 text-stone-600">{h.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
