import { reviewSchema, type OrderDetail } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/Form';
import { Stars, StarInput } from '../../components/Stars';
import { apiErrors, validate, type FieldErrors } from '../../lib/forms';
import { useSubmitReview } from '../../lib/reviews';

/** The buyer rates the seller after a completed order; both sides then see the review. */
export function ReviewSection({ order }: { order: OrderDetail }) {
  const { t, i18n } = useTranslation();
  const submit = useSubmitReview(order.id);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  if (order.review) {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
        <h2 className="font-semibold">
          {t(order.role === 'buyer' ? 'reviews.yours' : 'reviews.buyersReview')}
        </h2>
        <p className="mt-1">
          <Stars value={order.review.rating} />{' '}
          <span className="text-stone-500">
            {new Date(order.review.createdAt).toLocaleDateString(i18n.language, {
              dateStyle: 'medium',
            })}
          </span>
        </p>
        {order.review.comment && (
          <p className="mt-1 whitespace-pre-line text-stone-700">“{order.review.comment}”</p>
        )}
        {order.review.hidden && (
          <p className="mt-2 rounded-lg bg-stone-100 px-3 py-2 text-stone-700">
            {t('reviews.hiddenNote')}
          </p>
        )}
      </section>
    );
  }
  if (!order.canReview) return null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { errors } = validate(reviewSchema, { rating, comment });
    setErrors(errors ?? {});
    if (!errors) submit.mutate({ rating, comment });
  }

  const server = apiErrors(submit.error);
  return (
    <section className="rounded-xl border border-brand-100 bg-white p-4">
      <h2 className="font-semibold">
        {t('reviews.rateSeller', { seller: order.seller.shopName ?? order.seller.name })}
      </h2>
      <p className="mt-1 text-sm text-stone-600">{t('reviews.rateIntro')}</p>
      <form onSubmit={onSubmit} noValidate className="mt-3 space-y-3">
        {server.message && <Alert>{server.message}</Alert>}
        <StarInput
          value={rating}
          onChange={setRating}
          error={errors.rating ?? server.fields.rating}
        />
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t('reviews.comment')}</span>
          <textarea
            rows={3}
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('reviews.commentPlaceholder')}
            className="block w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={submit.isPending}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {t('reviews.submit')}
        </button>
      </form>
    </section>
  );
}
