import { APP_NAME } from '@tzed/shared';
import { config } from '../config.js';

export interface EmailContent {
  name: string;
  /** Paragraphs of plain text. */
  paragraphs: string[];
  action?: { label: string; path: string };
  /** Small print under the button, e.g. "The link expires in 1 hour." */
  note?: string;
}

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** One look for every TZed email: greeting, short text, one clear button, a footer. */
export function renderEmail({ name, paragraphs, action, note }: EmailContent) {
  const url = action ? `${config.APP_URL}${action.path}` : null;
  const footer = `You're receiving this because you have a ${APP_NAME} account. ${APP_NAME} connects buyers and sellers in Tanzania and Zambia.`;

  const text = [
    `Hi ${name},`,
    ...paragraphs,
    ...(action && url ? [`${action.label}: ${url}`] : []),
    ...(note ? [note] : []),
    `— The ${APP_NAME} team`,
    footer,
  ].join('\n\n');

  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e7e5e4">
<tr><td style="padding:20px 24px;border-bottom:1px solid #e7e5e4;font-size:20px;font-weight:bold;color:#065f46">TZ<span style="color:#f59e0b">ed</span></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.5">
<p style="margin:0 0 16px">Hi ${escape(name)},</p>
${paragraphs.map((p) => `<p style="margin:0 0 16px">${escape(p).replace(/\n/g, '<br>')}</p>`).join('\n')}
${action && url ? `<p style="margin:24px 0"><a href="${escape(url)}" style="background:#047857;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${escape(action.label)}</a></p>` : ''}
${note ? `<p style="margin:0 0 16px;font-size:13px;color:#78716c">${escape(note)}</p>` : ''}
<p style="margin:0">— The ${APP_NAME} team</p>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e7e5e4;font-size:12px;color:#78716c">${escape(footer)}</td></tr>
</table></td></tr></table></body></html>`;

  return { text, html };
}
