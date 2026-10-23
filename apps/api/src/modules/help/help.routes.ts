import { Router } from 'express';
import { getArticle, searchArticles } from './help.service.js';

export const helpRouter = Router();

helpRouter.get('/articles', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : undefined;
  const topic = typeof req.query.topic === 'string' ? req.query.topic.slice(0, 64) : undefined;
  res.set('Cache-Control', 'public, max-age=60').json(await searchArticles(q, topic));
});

helpRouter.get('/articles/:slug', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60').json(await getArticle(String(req.params.slug)));
});
