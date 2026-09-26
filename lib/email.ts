// Server-only Resend helper (free tier, REST API — no SDK dependency).
// Configure RESEND_API_KEY + EMAIL_FROM; without them sending is a no-op
// so features that notify by email keep working (just without email).

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendEmail(msg: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
