import { MAX_IMAGE_BYTES, MAX_LISTING_IMAGES, type ListingDetail } from '@tzed/shared';
import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/Form';
import { apiErrors } from '../../lib/forms';
import { useListingPhotos } from '../../lib/listings';

export function PhotoManager({
  listing,
  onSentForReview,
}: {
  listing: ListingDetail;
  onSentForReview: () => void;
}) {
  const { t } = useTranslation();
  const { upload, remove, reorder } = useListingPhotos(listing.id);
  const input = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const images = listing.images;
  const room = MAX_LISTING_IMAGES - images.length;

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    setLocalError(null);
    if (!files.length) return;
    if (files.length > room)
      return setLocalError(t('photos.tooMany', { max: MAX_LISTING_IMAGES, room }));
    const big = files.find((f) => f.size > MAX_IMAGE_BYTES);
    if (big) return setLocalError(t('photos.tooBig', { name: big.name }));
    upload.mutate(files, { onSuccess: (d) => d.sentForReview && onSentForReview() });
  }

  function move(index: number, by: -1 | 1) {
    const ids = images.map((i) => i.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved!);
    reorder.mutate(ids);
  }

  const error = localError ?? apiErrors(upload.error ?? remove.error ?? reorder.error).message;
  const busy = upload.isPending || remove.isPending || reorder.isPending;

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('photos.title')}</h2>
        <p className="text-sm text-stone-500">
          {t('photos.count', { count: images.length, max: MAX_LISTING_IMAGES })}
        </p>
      </div>
      <p className="mt-1 text-sm text-stone-600">{t('photos.intro')}</p>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((img, i) => (
          <li
            key={img.id}
            className="relative overflow-hidden rounded-lg border border-stone-200 bg-stone-50"
          >
            <img
              src={img.thumbUrl}
              alt={t('photos.alt', { n: i + 1 })}
              className="aspect-square w-full object-cover"
            />
            {i === 0 && (
              <span className="absolute left-1.5 top-1.5 rounded bg-brand-700 px-1.5 py-0.5 text-xs font-medium text-white">
                {t('photos.cover')}
              </span>
            )}
            <div className="flex items-center justify-between gap-1 border-t border-stone-200 bg-white p-1">
              <span className="flex gap-1">
                <button
                  type="button"
                  disabled={i === 0 || busy}
                  onClick={() => move(i, -1)}
                  className="rounded px-2 py-1 text-sm hover:bg-stone-100 disabled:opacity-30"
                  aria-label={t('photos.moveLeft', { n: i + 1 })}
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={i === images.length - 1 || busy}
                  onClick={() => move(i, 1)}
                  className="rounded px-2 py-1 text-sm hover:bg-stone-100 disabled:opacity-30"
                  aria-label={t('photos.moveRight', { n: i + 1 })}
                >
                  →
                </button>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove.mutate(img.id)}
                className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-30"
                aria-label={t('photos.remove', { n: i + 1 })}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
        {room > 0 && (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-300 text-sm text-stone-600 hover:border-brand-600 hover:text-brand-700 disabled:opacity-50"
            >
              <span className="text-2xl" aria-hidden="true">
                +
              </span>
              {upload.isPending ? t('photos.uploading') : t('photos.add')}
            </button>
          </li>
        )}
      </ul>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label={t('photos.add')}
        onChange={onFiles}
      />
    </section>
  );
}
