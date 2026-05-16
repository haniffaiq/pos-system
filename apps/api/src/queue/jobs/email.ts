import type { Job } from "bullmq";

import { MAIL_FROM, mailer } from "../../lib/mailer";
import type { EmailJob } from "../queues";

type RenderedEmail = {
  subject: string;
  html: string;
};

type EmailProcessorJob = Pick<Job<EmailJob>, "data">;

function htmlEscape(value: string | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEmail(template: EmailJob["template"], vars: Record<string, string>): RenderedEmail {
  const name = htmlEscape(vars.name);

  switch (template) {
    case "welcome":
      return {
        subject: "Welcome to Operational Web App",
        html: `<p>Hi ${name}, your workspace is ready.</p>`,
      };
    case "invite": {
      const tenant = vars.tenant ?? vars.tenantName ?? "your workspace";
      return {
        subject: `You have been invited to ${tenant}`,
        html: `<p>Hi ${name}, you were invited to ${htmlEscape(tenant)}.</p>`,
      };
    }
    case "password_reset":
      return {
        subject: "Reset your password",
        html: `<p>Hi ${name}, use this link to reset: ${htmlEscape(vars.link)}</p>`,
      };
    case "signup_verify":
      return {
        subject: "Verifikasi akun BroSolution kamu",
        html: `<p>Terima kasih sudah mendaftar${vars.businessName ? ` untuk ${htmlEscape(vars.businessName)}` : ""}.</p><p>Klik link berikut untuk verifikasi akun kamu dalam 24 jam:</p><p><a href="${htmlEscape(vars.verifyUrl)}">${htmlEscape(vars.verifyUrl)}</a></p>`,
      };
    case "mfa_otp":
      return {
        subject: "Your verification code",
        html: `<p>Your verification code is <strong>${htmlEscape(vars.code)}</strong>. It expires in 5 minutes.</p>`,
      };
  }
}

export async function emailProcessor(job: EmailProcessorJob): Promise<void> {
  const { to, template, vars } = job.data;
  const { subject, html } = renderEmail(template, vars);

  await mailer.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    html,
  });
}
