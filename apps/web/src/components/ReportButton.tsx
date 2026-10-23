import { REPORT_REASONS, reportSchema, type ReportReason, type ReportTarget } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMe } from '../lib/auth';
import { apiErrors, validate, type FieldErrors } from '../lib/forms';
import { useReport } from '../lib/support';
import { Alert } from './Form';

/** A small "Report" link that opens a reason form. Hidden for guests. */
export function ReportButton({
  targetType,
  targetId,
  className = '',
}: {
  targetType: ReportTarget;
  targetId: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const report = useReport();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  if (!me) return null;

  if (report.isSuccess)
    return (
      <p className={`text-xs text-brand-800 ${className}`} role="status">
        {t('report.thanks')}
      </p>
    );
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xs text-stone-500 underline hover:text-red-700 ${className}`}
      >
        {t(`report.open.${targetType}`)}
      </button>
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const values = { targetType, targetId, reason, details };
    const { errors } = validate(reportSchema, values);
    setErrors(errors ?? {});
    if (!errors) report.mutate(values as Parameters<typeof report.mutate>[0]);
  }
  const server = apiErrors(report.error);
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={`space-y-2 rounded-xl border border-red-200 bg-white p-3 text-sm ${className}`}
      aria-label={t(`report.open.${targetType}`)}
    >
      <fieldset>
        <legend className="mb-1 font-medium">{t('report.why')}</legend>
        <div className="space-y-1">
          {REPORT_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input
                type="radio"
                name={`report-${targetType}-${targetId}`}
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="accent-red-700"
              />
              {t(`report.reason.${r}`)}
            </label>
          ))}
        </div>
        {(errors.reason ?? server.fields.reason) && (
          <p className="mt-1 text-red-700">{errors.reason ?? server.fields.reason}</p>
        )}
      </fieldset>
      <label className="block">
        <span className="mb-1 block font-medium">{t('report.details')}</span>
        <textarea
          rows={2}
          maxLength={1000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="block w-full rounded-lg border border-stone-300 px-2 py-1.5"
        />
        {(errors.details ?? server.fields.details) && (
          <span className="mt-1 block text-red-700">{errors.details ?? server.fields.details}</span>
        )}
      </label>
      {server.message && <Alert>{server.message}</Alert>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={report.isPending}
          className="rounded-lg bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-800"
        >
          {t('report.send')}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 hover:bg-stone-100"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
