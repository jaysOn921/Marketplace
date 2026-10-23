/**
 * Turns what a user typed into safe pieces for MySQL full-text search.
 *
 * - InnoDB full-text ignores words shorter than 3 characters (innodb_ft_min_token_size),
 *   so short words like "tv" or "4k" are matched with LIKE instead.
 * - InnoDB's default stopwords ("the", "for", "with"…) never match in boolean mode, so
 *   requiring them would return nothing; they are dropped.
 * - Everything except letters and digits is removed, so users can't inject boolean
 *   operators (+ - * " ~ < > @ ( )).
 */
const INNODB_STOPWORDS = new Set([
  'a',
  'about',
  'an',
  'are',
  'as',
  'at',
  'be',
  'by',
  'com',
  'de',
  'en',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'la',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'who',
  'will',
  'with',
  'und',
  'www',
]);

const MAX_TERMS = 8;

export interface TextQuery {
  /** Words for the full-text index (3+ characters). */
  long: string[];
  /** Short words, matched with LIKE. */
  short: string[];
}

export function parseTextQuery(q: string | undefined): TextQuery | null {
  if (!q) return null;
  const words = q
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w && !INNODB_STOPWORDS.has(w));
  const unique = [...new Set(words)].slice(0, MAX_TERMS);
  if (!unique.length) return null;
  return { long: unique.filter((w) => w.length >= 3), short: unique.filter((w) => w.length < 3) };
}

/** Boolean-mode expression: every word required ("all") or any word ("any"), with prefix matching. */
export function booleanExpression(words: string[], mode: 'all' | 'any') {
  return words.map((w) => `${mode === 'all' ? '+' : ''}${w}*`).join(' ');
}
