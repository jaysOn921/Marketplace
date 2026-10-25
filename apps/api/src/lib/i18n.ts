import type { Request } from 'express';
import { SW } from './i18n-sw.js';

export type Locale = 'en' | 'sw';

/** The site language a request asks for (the web app sends Accept-Language: en or sw). */
export function requestLocale(req: Pick<Request, 'get'>): Locale {
  return localeFrom(req.get('accept-language'));
}

export function localeFrom(value: string | null | undefined): Locale {
  return value?.trim().toLowerCase().startsWith('sw') ? 'sw' : 'en';
}

// The server writes its messages in English; the Swahili catalog is keyed by that English
// text, with {name} standing for the parts that change (a title, an amount, a reason…).
const exact = new Map<string, string>();
const templates: { pattern: RegExp; names: string[]; sw: string }[] = [];
for (const [en, sw] of Object.entries(SW)) {
  if (!/\{\w+\}/.test(en)) {
    exact.set(en, sw);
    continue;
  }
  const names: string[] = [];
  const source = en
    .split(/(\{\w+\})/)
    .map((part) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      if (!name) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(name);
      return '(.+?)';
    })
    .join('');
  templates.push({ pattern: new RegExp(`^${source}$`, 's'), names, sw });
}

/** English server text in the given language; text with no translation stays English. */
export function translate(text: string, locale: Locale, depth = 0): string {
  if (locale === 'en') return text;
  const hit = exact.get(text);
  if (hit !== undefined) return hit;
  for (const t of templates) {
    const m = t.pattern.exec(text);
    if (!m) continue;
    const values = Object.fromEntries(
      t.names.map((n, i) => [n, depth < 2 ? translate(m[i + 1]!, locale, depth + 1) : m[i + 1]!]),
    );
    const out = t.sw.replace(/\{(\w+)\}/g, (_, n: string) => values[n] ?? '');
    // A sentence that starts with a filled-in word ("mnunuzi ameripoti…") still gets a capital.
    return /^\p{Lu}/u.test(text) ? out.charAt(0).toUpperCase() + out.slice(1) : out;
  }
  return text;
}
