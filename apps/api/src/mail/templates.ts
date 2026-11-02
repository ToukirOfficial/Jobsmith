export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** One simple, readable email layout. Paragraphs are plain text and are escaped. */
export function email(opts: { subject: string; heading: string; paragraphs: string[]; button?: { label: string; url: string }; footnote?: string }): EmailContent {
  const text = [
    opts.heading,
    '',
    ...opts.paragraphs.flatMap((p) => [p, '']),
    ...(opts.button ? [`${opts.button.label}: ${opts.button.url}`, ''] : []),
    ...(opts.footnote ? [opts.footnote, ''] : []),
    'Sent by your Jobsmith.',
  ].join('\n');
  const html = `<!doctype html><html lang="en-GB"><body style="margin:0;background:#f5f6f9;font-family:Arial,Helvetica,sans-serif;color:#161a2b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e0e3eb">
<tr><td style="padding:20px 28px;border-bottom:1px solid #e0e3eb;font-weight:bold;color:#3346d3;font-size:16px">Jobsmith</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#161a2b">${esc(opts.heading)}</h1>
${opts.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n')}
${opts.button ? `<p style="margin:24px 0"><a href="${esc(opts.button.url)}" style="display:inline-block;background:#3346d3;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:15px">${esc(opts.button.label)}</a></p>` : ''}
${opts.footnote ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#596079">${esc(opts.footnote)}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e0e3eb;font-size:12px;color:#596079">Sent by your Jobsmith.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: opts.subject, text, html };
}
