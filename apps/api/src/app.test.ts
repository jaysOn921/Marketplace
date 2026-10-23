import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { redactUrl } from './logger.js';

const app = createApp();

describe('API skeleton', () => {
  it('GET /api/v1/health returns ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', app: 'TZed', db: 'ok' });
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects malformed JSON with a 400', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_JSON');
  });

  it('sets security headers and hides Express', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('keeps private link tokens out of logged URLs', () => {
    expect(redactUrl('/api/v1/support/tickets/4?token=abc123&x=1')).toBe(
      '/api/v1/support/tickets/4?token=[Redacted]&x=1',
    );
    expect(redactUrl('/api/v1/search?q=token')).toBe('/api/v1/search?q=token');
  });

  it('keeps the status of Express errors: missing photo files and oversized bodies', async () => {
    const missing = await request(app).get('/uploads/listings/1/does-not-exist-full.webp');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    const big = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'x'.repeat(1_100_000) }));
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('TOO_LARGE');
  });
});
