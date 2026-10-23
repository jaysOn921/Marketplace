import { Prisma } from '@prisma/client';
import type { HelpArticleResponse, HelpArticlesResponse, HelpArticleSummary } from '@tzed/shared';
import { prisma } from '../../db.js';
import { AppError } from '../../lib/errors.js';
import { booleanExpression, parseTextQuery, type TextQuery } from '../search/text-query.js';

type ArticleRow = { slug: string; title: string; topic: string; body: string };

const summary = (a: ArticleRow): HelpArticleSummary => ({
  slug: a.slug,
  title: a.title,
  topic: a.topic,
  excerpt: a.body.replace(/\s+/g, ' ').slice(0, 160).trim() + (a.body.length > 160 ? '…' : ''),
});

function match(text: TextQuery, mode: 'all' | 'any') {
  const parts = [
    ...(text.long.length
      ? [
          Prisma.sql`MATCH(f.title, f.body) AGAINST (${booleanExpression(text.long, mode)} IN BOOLEAN MODE)`,
        ]
      : []),
    ...text.short.map((w) => Prisma.sql`(f.title LIKE ${`%${w}%`} OR f.body LIKE ${`%${w}%`})`),
  ];
  return Prisma.join(parts, mode === 'all' ? ' AND ' : ' OR ');
}

function score(text: TextQuery, mode: 'all' | 'any') {
  const parts: Prisma.Sql[] = [];
  if (text.long.length)
    parts.push(
      Prisma.sql`MATCH(f.title, f.body) AGAINST (${booleanExpression(text.long, mode)} IN BOOLEAN MODE)`,
    );
  for (const w of [...text.long, ...text.short])
    parts.push(Prisma.sql`(f.title LIKE ${`%${w}%`}) * 3`);
  return Prisma.join(parts, ' + ');
}

/** Help articles, searched the same way as listings (prefixes, all words then any word). */
export async function searchArticles(
  q: string | undefined,
  topic: string | undefined,
): Promise<HelpArticlesResponse> {
  const text = parseTextQuery(q);
  const topicFilter = topic ? Prisma.sql`AND f.topic = ${topic}` : Prisma.empty;
  let matchMode: 'all' | 'any' | null = null;
  let rows: ArticleRow[];

  if (text) {
    const run = (mode: 'all' | 'any') => prisma.$queryRaw<ArticleRow[]>`
      SELECT f.slug, f.title, f.topic, f.body FROM faq_articles f
      WHERE f.isPublished = 1 ${topicFilter} AND (${match(text, mode)})
      ORDER BY (${score(text, mode)}) DESC, f.sortOrder ASC LIMIT 20`;
    matchMode = 'all';
    rows = await run('all');
    if (!rows.length && text.long.length + text.short.length > 1) {
      matchMode = 'any';
      rows = await run('any');
    }
  } else {
    rows = await prisma.faqArticle.findMany({
      where: { isPublished: true, ...(topic ? { topic } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  const topics = await prisma.faqArticle.groupBy({
    by: ['topic'],
    where: { isPublished: true },
    _count: true,
  });
  return {
    articles: rows.map(summary),
    topics: topics.map((t) => ({ topic: t.topic, count: t._count })),
    matchMode,
  };
}

export async function getArticle(slug: string): Promise<HelpArticleResponse> {
  const article = await prisma.faqArticle.findUnique({ where: { slug } });
  if (!article || !article.isPublished) throw AppError.notFound('Help article not found.');
  const related = await prisma.faqArticle.findMany({
    where: { isPublished: true, topic: article.topic, slug: { not: slug } },
    orderBy: { sortOrder: 'asc' },
    take: 4,
  });
  return {
    article: {
      ...summary(article),
      body: article.body,
      updatedAt: article.updatedAt.toISOString(),
    },
    related: related.map(summary),
  };
}
