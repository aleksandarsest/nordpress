import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getSettings } from "./options";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
};

let transport: Transporter | null | undefined;

// SMTP works with practically every email provider (Postmark, Resend,
// SendGrid, SES, Mailgun, your own server): set SMTP_URL, e.g.
// smtps://user:password@smtp.example.com:465
function transporter() {
  if (transport === undefined) {
    transport = process.env.SMTP_URL
      ? nodemailer.createTransport(process.env.SMTP_URL)
      : null;
  }
  return transport;
}

export function mailConfigured() {
  return !!process.env.SMTP_URL;
}

export async function sendMail(mail: Mail) {
  const settings = await getSettings();
  const from =
    process.env.MAIL_FROM ||
    `"${settings.title.replace(/"/g, "")}" <${settings.adminEmail}>`;
  const t = transporter();
  if (!t) {
    // Without SMTP, show the message in the server log so development works
    console.info(
      `[mail] SMTP_URL is not set; not sending.\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`,
    );
    return;
  }
  await t.sendMail({ from, ...mail });
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export async function sendPasswordResetMail(
  to: { name: string; email: string },
  url: string,
) {
  const { title } = await getSettings();
  const text = `Hi ${to.name},

Someone asked to reset the password for your account on ${title}.
To choose a new password, open this link within the next hour:

${url}

If you didn't ask for this, you can ignore this email; your password stays the same.`;
  await sendMail({
    to: to.email,
    subject: `[${title}] Reset your password`,
    text,
    html: `<p>Hi ${escapeHtml(to.name)},</p>
<p>Someone asked to reset the password for your account on ${escapeHtml(title)}. To choose a new password, open this link within the next hour:</p>
<p><a href="${escapeHtml(url)}">Reset your password</a></p>
<p>If you didn't ask for this, you can ignore this email; your password stays the same.</p>`,
  });
}
