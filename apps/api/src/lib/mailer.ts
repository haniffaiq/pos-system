import * as nodemailer from "nodemailer";

const smtpPort = Number(process.env.SMTP_PORT ?? 1025);

export const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number.isNaN(smtpPort) ? 1025 : smtpPort,
  secure: process.env.SMTP_SECURE === "true",
  auth:
    process.env.SMTP_USER && process.env.SMTP_PASSWORD
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        }
      : undefined,
});

export const MAIL_FROM = process.env.SMTP_FROM ?? "no-reply@operational.app";
