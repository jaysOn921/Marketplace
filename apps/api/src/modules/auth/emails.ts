import { APP_NAME } from '@tzed/shared';
import { config } from '../../config.js';
import type { MailMessage } from '../../lib/mailer.js';

const link = (path: string, token: string) =>
  `${config.APP_URL}${path}?token=${encodeURIComponent(token)}`;

export function verifyEmailMessage(to: string, name: string, token: string): MailMessage {
  return {
    to,
    subject: `Confirm your email for ${APP_NAME}`,
    text: `Hi ${name},

Welcome to ${APP_NAME}! Please confirm your email address by opening this link:

${link('/verify-email', token)}

The link expires in 48 hours. If you didn't create an account, you can ignore this email.

— The ${APP_NAME} team`,
  };
}

export function resetPasswordMessage(to: string, name: string, token: string): MailMessage {
  return {
    to,
    subject: `Reset your ${APP_NAME} password`,
    text: `Hi ${name},

We received a request to reset your password. Open this link to choose a new one:

${link('/reset-password', token)}

The link expires in 1 hour and can be used once. If you didn't ask for this, you can ignore this email: your password won't change.

— The ${APP_NAME} team`,
  };
}
