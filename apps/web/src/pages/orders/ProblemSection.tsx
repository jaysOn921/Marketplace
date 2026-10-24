import {
  DISPUTE_REASONS,
  openDisputeSchema,
  type DisputeReason,
  type OrderDetail,
} from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { DisputeThread } from '../../components/DisputeThread';
import { Alert } from '../../components/Form';
import { useDisputeReply, useOpenDispute, useOrderDispute } from '../../lib/disputes';
import { useMe } from '../../lib/auth';
import { apiErrors, validate, type FieldErrors } from '../../lib/forms';

/** "Problem with this order?": raise it, then talk it through with the other side and TZed. */
export function ProblemSection({ order }: { order: OrderDetail }) {
  const { t } = useTranslation();
  const { data: dispute } = useOrderDispute(order.id, Boolean(order.dispute));
  const open = useOpenDispute(order.id);
  const reply = useDisputeReply(order.id);
  const [form, setForm] = useState(false);
  const [reason, setReason] = useState<DisputeReason | ''>('');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { data: me } = useMe();
  // Admins handle problems from Admin → Problems, not as a party here.
  const parties = me?.id === order.buyer.id || me?.id === order.seller.id;
  if (!parties || (!order.dispute && !order.canDispute)) return null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const values = { reason, details };
    const { errors } = validate(openDisputeSchema, values);
    setErrors(errors ?? {});
    if (errors) return;
    open.mutate(values as { reason: DisputeReason; details: string }, {
      onSuccess: () => {
        setForm(false);
        setDetails('');
        setReason('');
      },
    });
  }
  const server = apiErrors(open.error);

  return (
    <section
      id="problem"
      aria-labelledby="problem-heading"
      className="rounded-xl border border-stone-200 bg-white p-4"
    >
      <h2 id="problem-heading" className="font-semibold">
        {dispute && dispute.status === 'OPEN' ? t('dispute.openTitle') : t('dispute.title')}
      </h2>
      {dispute && (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-stone-600">
            {t(`dispute.reason.${dispute.reason}`)} ·{' '}
            {dispute.status === 'OPEN' ? t('dispute.openIntro') : t('dispute.statusResolved')}
          </p>
          <DisputeThread
            dispute={dispute}
            viewer={order.role}
            reply={{
              mutate: (body, opts) => reply.mutate({ disputeId: dispute.id, body }, opts),
              isPending: reply.isPending,
              error: reply.error,
            }}
          />
        </div>
      )}
      {order.canDispute &&
        (form ? (
          <form onSubmit={onSubmit} noValidate className="mt-3 space-y-3">
            {server.message && <Alert>{server.message}</Alert>}
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">{t('dispute.whatHappened')}</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {DISPUTE_REASONS.map((r) => (
                  <label
                    key={r}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
                  >
                    <input
                      type="radio"
                      name="dispute-reason"
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      className="accent-brand-700"
                    />
                    {t(`dispute.reason.${r}`)}
                  </label>
                ))}
              </div>
              {errors.reason && <p className="mt-1 text-sm text-red-700">{errors.reason}</p>}
            </fieldset>
            <div className="text-sm">
              <label htmlFor="dispute-details" className="mb-1 block font-medium">
                {t('dispute.details')}
              </label>
              <textarea
                id="dispute-details"
                rows={4}
                maxLength={2000}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={t('dispute.detailsPlaceholder')}
                aria-invalid={Boolean(errors.details)}
                aria-describedby={errors.details ? 'dispute-details-error' : undefined}
                className="block w-full rounded-lg border border-stone-300 px-3 py-2"
              />
              {errors.details && (
                <p id="dispute-details-error" className="mt-1 text-red-700">
                  {errors.details}
                </p>
              )}
            </div>
            <p className="text-xs text-stone-600">{t('dispute.whoSees')}</p>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={open.isPending}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
              >
                {t('dispute.submit')}
              </button>
              <button
                type="button"
                onClick={() => setForm(false)}
                className="rounded-lg px-4 py-2 text-sm hover:bg-stone-100"
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-2">
            {!dispute && <p className="text-sm text-stone-600">{t('dispute.intro')}</p>}
            <button
              type="button"
              onClick={() => setForm(true)}
              className="mt-2 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
            >
              {dispute ? t('dispute.another') : t('dispute.start')}
            </button>
          </div>
        ))}
    </section>
  );
}
