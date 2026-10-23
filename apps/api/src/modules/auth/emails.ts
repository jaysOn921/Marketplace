import { APP_NAME } from '@tzed/shared';
import { renderEmail } from '../../lib/email-layout.js';
import type { MailMessage } from '../../lib/mailer.js';

const withToken = (path: string, token: string) => `${path}?token=${encodeURIComponent(token)}`;

export function verifyEmailMessage(to: string, name: string, token: string): MailMessage {
  return {
    to,
    subject: `Confirm your email for ${APP_NAME}`,
    ...renderEmail({
      name,
      paragraphs: [
        `Welcome to ${APP_NAME}! Please confirm your email address so you can buy and sell.`,
      ],
      action: { label: 'Confirm my email', path: withToken('/verify-email', token) },
      note: "The link expires in 48 hours. If you didn't create an account, you can ignore this email.",
    }),
  };
}

export function resetPasswordMessage(to: string, name: string, token: string): MailMessage {
  return {
    to,
    subject: `Reset your ${APP_NAME} password`,
    ...renderEmail({
      name,
      paragraphs: [
        'We received a request to reset your password. Choose a new one with the button below.',
      ],
      action: { label: 'Choose a new password', path: withToken('/reset-password', token) },
      note: "The link expires in 1 hour and works once. If you didn't ask for this, ignore this email: your password won't change.",
    }),
  };
}
