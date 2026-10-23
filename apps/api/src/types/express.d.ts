import type { AuthUser } from '../middleware/auth.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by loadUser when the request has a valid signed-in session. */
      user?: AuthUser;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    csrfToken?: string;
  }
}

export {};
