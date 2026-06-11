// Email + WhatsApp notifications for scheduling events. Both channels are
// fully optional: if the relevant env vars aren't set, the message is logged
// to the console instead of sent, so the rest of the flow (interview/
// assessment creation) never fails because notifications aren't configured.

export interface NotifyResult {
  sent: boolean;
  reason?: string;
}

export interface EmailInput {
  to: string;
  subject: string;
  text: string;
}

export interface WhatsAppInput {
  to: string;
  message: string;
}

export async function sendEmail({ to, subject, text }: EmailInput): Promise<NotifyResult> {
  if (!to) return { sent: false, reason: 'no recipient email on file' };

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST) {
    console.log(`[email:not-configured] to=${to} subject="${subject}"\n${text}`);
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT ? Number(SMTP_PORT) : 587,
      secure: Number(SMTP_PORT) === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to,
      subject,
      text,
    });
    return { sent: true };
  } catch (err: any) {
    console.error('[email:error]', err.message);
    return { sent: false, reason: err.message };
  }
}

export async function sendWhatsApp({ to, message }: WhatsAppInput): Promise<NotifyResult> {
  if (!to) return { sent: false, reason: 'no recipient phone number on file' };

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    console.log(`[whatsapp:not-configured] to=${to}\n${message}`);
    return { sent: false, reason: 'Twilio not configured' };
  }

  try {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const body = new URLSearchParams({
      From: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
      To: `whatsapp:${to}`,
      Body: message,
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[whatsapp:error]', res.status, errText);
      return { sent: false, reason: `Twilio responded ${res.status}` };
    }
    return { sent: true };
  } catch (err: any) {
    console.error('[whatsapp:error]', err.message);
    return { sent: false, reason: err.message };
  }
}
