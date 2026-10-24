import { useTranslation } from 'react-i18next';

/**
 * A category's name in the current language. Categories live in the database (admins can
 * add and rename them), so translations are looked up by slug and fall back to the stored
 * name: a new category shows its stored name until it's translated.
 */
export function useCategoryName() {
  const { t } = useTranslation();
  return (c: { slug: string; name: string }) =>
    t(`categoryNames.${c.slug}`, { defaultValue: c.name });
}
