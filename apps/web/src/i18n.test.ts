import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import sw from './locales/sw.json';

type Tree = { [k: string]: unknown };

/** Every leaf as "path → text" (lists use their index in the path). */
function leaves(node: unknown, path = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === 'string') out.set(path, node);
  else if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node as Tree))
      for (const [p, t] of leaves(v, path ? `${path}.${k}` : k)) out.set(p, t);
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

describe('Swahili translation', () => {
  const english = leaves(en);
  // Category names live in the database; only translations of them are in the locale files.
  const swahili = new Map([...leaves(sw)].filter(([k]) => !k.startsWith('categoryNames.')));

  it('has exactly the same keys as English', () => {
    expect([...swahili.keys()].filter((k) => !english.has(k))).toEqual([]);
    expect([...english.keys()].filter((k) => !swahili.has(k))).toEqual([]);
  });

  it('keeps every {{placeholder}}', () => {
    const wrong = [...english].filter(
      ([k, text]) => placeholders(text).join() !== placeholders(swahili.get(k) ?? '').join(),
    );
    expect(wrong.map(([k]) => k)).toEqual([]);
  });

  it('has no empty strings', () => {
    expect([...leaves(sw)].filter(([, t]) => !t.trim()).map(([k]) => k)).toEqual([]);
  });

  it('translates every seeded category', async () => {
    const { CATEGORIES } = await import('../../api/prisma/seed-data');
    const slugs = CATEGORIES.flatMap((c) => [c.slug, ...(c.children ?? []).map((ch) => ch.slug)]);
    const names = (sw as { categoryNames: Record<string, string> }).categoryNames;
    expect(slugs.filter((s) => !names[s])).toEqual([]);
  });
});
