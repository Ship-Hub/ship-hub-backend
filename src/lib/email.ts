import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = 'ShipHub <noreply@memobank.online>';
const APP_URL = process.env.FRONTEND_URL ?? 'http://localhost:5174';

async function send(to: string, subject: string, html: string) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping email to', to);
    return;
  }
  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) {
      // Resend v2+ SDK returns { error } instead of throwing
      console.error('[email] Send failed:', error);
    }
  } catch (err) {
    console.error('[email] Send exception:', err);
  }
}

function base(content: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#04050A;font-family:'Inter',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#04050A;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0B1020;border:1px solid #1E293B;border-radius:16px;overflow:hidden;max-width:560px;width:100%">
        <!-- Header -->
        <tr><td style="padding:28px 32px;border-bottom:1px solid #1E293B">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:linear-gradient(135deg,#7C3AED,#8B5CF6,#22D3EE);border-radius:8px;width:32px;height:32px;text-align:center;vertical-align:middle">
              <span style="font-size:16px;color:white;font-weight:bold">⚡</span>
            </td>
            <td style="padding-left:10px;font-family:monospace;font-size:16px;font-weight:700;color:white;letter-spacing:1px">SHIP_HUB</td>
          </tr></table>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px">
          ${content}
          <p style="font-size:12px;color:#475569;margin-top:32px;padding-top:24px;border-top:1px solid #1E293B">
            ShipHub — community.memobank.online<br>
            If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function cta(href: string, label: string) {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0">
    <tr><td style="border-radius:10px;background:linear-gradient(135deg,#7C3AED,#8B5CF6,#22D3EE)">
      <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:monospace;font-size:13px;font-weight:700;color:white;text-decoration:none;letter-spacing:0.5px">${label}</a>
    </td></tr>
  </table>
  <p style="font-size:12px;color:#475569;word-break:break-all">Or paste this link: <a href="${href}" style="color:#8B5CF6">${href}</a></p>`;
}

// ── Email templates ────────────────────────────────────────────────────────

export async function sendVerificationEmail(to: string, username: string, token: string) {
  const link = `${APP_URL}/verify-email?token=${token}`;
  await send(to, 'Verify your ShipHub email', base(`
    <h1 style="font-family:monospace;font-size:20px;font-weight:700;color:white;margin:0 0 8px">VERIFY_YOUR_EMAIL</h1>
    <p style="font-size:14px;color:#94A3B8;margin:0 0 4px">Hey @${username} 👋</p>
    <p style="font-size:14px;color:#94A3B8;margin:0 0 24px">
      Thanks for joining ShipHub! Click the button below to confirm your email address and unlock your full account.
    </p>
    ${cta(link, 'VERIFY_EMAIL →')}
    <p style="font-size:12px;color:#475569;margin:0">This link expires in <strong style="color:#94A3B8">24 hours</strong>.</p>
  `));
}

export async function sendPasswordResetEmail(to: string, username: string, token: string) {
  const link = `${APP_URL}/reset-password?token=${token}`;
  await send(to, 'Reset your ShipHub password', base(`
    <h1 style="font-family:monospace;font-size:20px;font-weight:700;color:white;margin:0 0 8px">RESET_PASSWORD</h1>
    <p style="font-size:14px;color:#94A3B8;margin:0 0 4px">Hey @${username} 👋</p>
    <p style="font-size:14px;color:#94A3B8;margin:0 0 24px">
      We received a request to reset your ShipHub password. Click the button below to choose a new one.
    </p>
    ${cta(link, 'RESET_PASSWORD →')}
    <p style="font-size:12px;color:#475569;margin:0">This link expires in <strong style="color:#94A3B8">1 hour</strong>. If you didn't request a reset, no action needed.</p>
  `));
}
