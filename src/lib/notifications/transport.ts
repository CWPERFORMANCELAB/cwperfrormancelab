import { business } from "@config/business";
import { forbidInStrict } from "@/lib/env";

/**
 * Email (Resend) and SMS (Twilio). With no API keys configured, messages are logged to the console and marked
 * "logged" — the site runs locally without any third-party accounts.
 * Never log message bodies in production (they can contain health-adjacent info); only recipients + subject.
 */

type Attachment = { filename: string; content: string; contentType: string };

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string; attachments?: Attachment[] }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Outside local dev a missing key is an error (the notification is retried and then marked failed), never a silent drop.
    forbidInStrict("Logging emails to the console (RESEND_API_KEY is not set)");
    console.info(`\n[email:console] to=${msg.to}\nsubject: ${msg.subject}\n${msg.text}\n${msg.attachments?.length ? `(+${msg.attachments.length} attachment)` : ""}\n`);
    return { id: null, logged: true };
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  const from = process.env.EMAIL_FROM || `${business.name} <onboarding@resend.dev>`;
  const { data, error } = await resend.emails.send({
    from,
    to: msg.to,
    replyTo: business.contact.email,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
  return { id: data?.id ?? null, logged: false };
}

/** UK mobile normaliser: 07xxx → +447xxx. Returns null for anything that isn't plausibly a mobile. */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  if (/^\+44\d{10}$/.test(digits)) return digits;
  if (/^07\d{9}$/.test(digits)) return `+44${digits.slice(1)}`;
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  return null;
}

export async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const e164 = toE164(to);
  if (!e164) throw new Error("Invalid phone number for SMS");
  if (!sid || !token || !from) {
    forbidInStrict("Logging SMS to the console (Twilio is not configured)");
    console.info(`\n[sms:console] to=${e164}\n${body}\n`);
    return { id: null, logged: true };
  }
  const twilio = (await import("twilio")).default;
  const client = twilio(sid, token);
  const m = await client.messages.create({ to: e164, from, body });
  return { id: m.sid, logged: false };
}
