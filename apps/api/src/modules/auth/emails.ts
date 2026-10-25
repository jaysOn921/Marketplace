import { APP_NAME } from '@tzed/shared';
import { renderEmail } from '../../lib/email-layout.js';
import { translate, type Locale } from '../../lib/i18n.js';
import type { MailMessage } from '../../lib/mailer.js';

interface Recipient {
  email: string;
  name: string;
  locale: string;
}

const withToken = (path: string, token: string) => `${path}?token=${encodeURIComponent(token)}`;

export function verifyEmailMessage(user: Recipient, token: string): MailMessage {
  const locale = user.locale as Locale;
  return {
    to: user.email,
    subject: translate(`Confirm your email for ${APP_NAME}`, locale),
    ...renderEmail({
      locale,
      name: user.name,
      paragraphs: [
        `Welcome to ${APP_NAME}! Please confirm your email address so you can buy and sell.`,
      ],
      action: { label: 'Confirm my email', path: withToken('/verify-email', token) },
      note: "The link expires in 48 hours. If you didn't create an account, you can ignore this email.",
    }),
  };
}

export function resetPasswordMessage(user: Recipient, token: string): MailMessage {
  const locale = user.locale as Locale;
  return {
    to: user.email,
    subject: translate(`Reset your ${APP_NAME} password`, locale),
    ...renderEmail({
      locale,
      name: user.name,
      paragraphs: [
        'We received a request to reset your password. Choose a new one with the button below.',
      ],
      action: { label: 'Choose a new password', path: withToken('/reset-password', token) },
      note: "The link expires in 1 hour and works once. If you didn't ask for this, ignore this email: your password won't change.",
    }),
  };
}
