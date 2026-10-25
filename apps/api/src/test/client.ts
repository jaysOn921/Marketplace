import type { Express } from 'express';
import request from 'supertest';

/** A cookie-keeping test client that sends the CSRF token on every write, like the web app. */
export async function testClient(app: Express) {
  const agent = request.agent(app);
  let csrf: string = (await agent.get('/api/v1/auth/csrf')).body.csrfToken;

  const write =
    (method: 'post' | 'put' | 'patch' | 'delete') =>
    async (url: string, body?: object, headers: Record<string, string> = {}) => {
      const res = await agent[method](`/api/v1${url}`)
        .set({ ...headers, 'X-CSRF-Token': csrf })
        .send(body);
      // Sign-in starts a new session with a new token.
      if (typeof res.body?.csrfToken === 'string') csrf = res.body.csrfToken;
      return res;
    };

  return {
    agent,
    get: (url: string, headers: Record<string, string> = {}) =>
      agent.get(`/api/v1${url}`).set(headers),
    post: write('post'),
    put: write('put'),
    patch: write('patch'),
    delete: write('delete'),
    /** Re-fetch the token, e.g. after logout. */
    refreshCsrf: async () => {
      csrf = (await agent.get('/api/v1/auth/csrf')).body.csrfToken;
    },
  };
}
