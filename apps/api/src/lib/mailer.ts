import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Emails "sent" during tests, for assertions. */
export const testOutbox: MailMessage[] = [];

const outboxDir = fileURLToPath(new URL('../../../../tests/artifacts/outbox/', import.meta.url));
const transport = config.SMTP_URL ? nodemailer.createTransport(config.SMTP_URL) : null;

/**
 * Sends an email. Production uses SMTP; development writes each email to
 * tests/artifacts/outbox/ (and logs it); tests collect them in testOutbox.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  if (config.isTest) {
    testOutbox.push(message);
    return;
  }
  if (transport) {
    await transport.sendMail({ from: config.MAIL_FROM, ...message });
    return;
  }
  mkdirSync(outboxDir, { recursive: true });
  const file = `${outboxDir}${Date.now()}-${message.to.replace(/[^a-z0-9@.]/gi, '_')}.txt`;
  writeFileSync(file, `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
  logger.info({ to: message.to, subject: message.subject, file }, 'Email written to outbox (dev)');
}

/** Sends without failing the request; email problems are logged instead. */
export function sendMailInBackground(message: MailMessage): void {
  sendMail(message).catch((err: unknown) =>
    logger.error({ err, to: message.to, subject: message.subject }, 'Failed to send email'),
  );
}
