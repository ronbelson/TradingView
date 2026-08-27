/**
 * Alert channels for TWS bridge down / up.
 * Email via Resend · SMS via Twilio. Skip quietly if env missing.
 */

function env(name) {
  return String(process.env[name] || '').trim();
}

export async function sendAlertEmail({ subject, text }) {
  const key = env('RESEND_API_KEY');
  const to = env('CHEF_ALERT_EMAIL');
  const from = env('RESEND_FROM') || env('CHEF_ALERT_FROM') || 'BTC CHEF <onboarding@resend.dev>';
  if (!key || !to) {
    return { ok: false, skipped: true, channel: 'email', reason: 'missing RESEND_API_KEY or CHEF_ALERT_EMAIL' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: String(subject || 'BTC CHEF'),
      text: String(text || ''),
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    return { ok: false, channel: 'email', status: res.status, body: body.slice(0, 300) };
  }
  return { ok: true, channel: 'email' };
}

export async function sendAlertSms(text) {
  const sid = env('TWILIO_ACCOUNT_SID');
  const token = env('TWILIO_AUTH_TOKEN');
  const from = env('TWILIO_FROM_NUMBER');
  const to = env('CHEF_ALERT_PHONE');
  if (!sid || !token || !from || !to) {
    return {
      ok: false,
      skipped: true,
      channel: 'sms',
      reason: 'missing Twilio or CHEF_ALERT_PHONE',
    };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: String(text || '').slice(0, 400),
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, channel: 'sms', status: res.status, body: raw.slice(0, 300) };
  }
  return { ok: true, channel: 'sms' };
}

export async function sendChefAlerts({ subject, text }) {
  const [email, sms] = await Promise.all([
    sendAlertEmail({ subject, text }),
    sendAlertSms(text),
  ]);
  return { email, sms };
}
