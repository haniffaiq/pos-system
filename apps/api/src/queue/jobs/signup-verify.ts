import { MAIL_FROM, mailer } from "../../lib/mailer";
import type { EmailJob, SignupVerifyEmailJob } from "../queues";

type RenderedEmail = {
  subject: string;
  html: string;
};

function htmlEscape(value: string | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isSignupVerifyEmailJob(data: EmailJob): data is SignupVerifyEmailJob {
  return data.template === "signup_verify" && typeof data.vars.verifyUrl === "string" && data.vars.verifyUrl.length > 0;
}

export function renderSignupVerifyEmail(data: SignupVerifyEmailJob): RenderedEmail {
  const businessSuffix = data.vars.businessName ? ` untuk ${htmlEscape(data.vars.businessName)}` : "";
  const verifyUrl = htmlEscape(data.vars.verifyUrl);

  return {
    subject: "Verifikasi akun BroSolution kamu",
    html: `<p>Terima kasih sudah mendaftar${businessSuffix}.</p><p>Klik link berikut untuk verifikasi akun kamu dalam 24 jam:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
  };
}

export async function handleSignupVerify(data: EmailJob): Promise<void> {
  if (!isSignupVerifyEmailJob(data)) {
    throw new Error("signup-verify email jobs require template=signup_verify and vars.verifyUrl");
  }

  const { subject, html } = renderSignupVerifyEmail(data);

  await mailer.sendMail({
    from: MAIL_FROM,
    to: data.to,
    subject,
    html,
  });
}
