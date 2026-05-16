import { randomBytes } from "node:crypto";

import type { EmailJob } from "../queue/queues";
import { AppError } from "../lib/errors";
import { hashPassword } from "../lib/password";

export interface SignupInput {
  email: string;
  password: string;
  businessName: string;
  slug: string;
}

export interface SignupPayload {
  email: string;
  passwordHash: string;
  businessName: string;
  slug: string;
  ownerName: string;
  trialPlanCode: "pro";
}

export interface SignupTokenRow {
  token: string;
  email: string;
  payload: SignupPayload;
  expiresAt: Date;
}

export interface StartSignupDeps {
  insertToken: (row: SignupTokenRow) => Promise<void>;
  isSlugAvailable: (slug: string) => Promise<boolean>;
  hasActiveSignupForEmail: (email: string) => Promise<boolean>;
  enqueue: (job: EmailJob) => Promise<void>;
  publicAppUrl?: string;
}

export interface SignupTokenRecord {
  payload: SignupPayload;
  consumed_at: Date | null;
  expires_at: Date | string;
}

export interface ConsumeSignupDeps {
  token: string;
  loadToken: (token: string) => Promise<SignupTokenRecord | null>;
  bootstrapTenant: (payload: SignupPayload, token: string) => Promise<{ tenantId: string; slug: string }>;
  markConsumed: (token: string) => Promise<void>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function normalizeBusinessName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function verifyUrl(baseUrl: string | undefined, token: string): string {
  const normalizedBase = (baseUrl ?? process.env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${normalizedBase}/verify?token=${token}`;
}

export async function startSignup(input: SignupInput, deps: StartSignupDeps): Promise<{ tokenSent: true }> {
  const email = normalizeEmail(input.email);
  const slug = normalizeSlug(input.slug);
  const businessName = normalizeBusinessName(input.businessName);

  if (!(await deps.isSlugAvailable(slug))) {
    throw new AppError(409, "slug_taken", "That slug is already in use");
  }
  if (await deps.hasActiveSignupForEmail(email)) {
    throw new AppError(409, "signup_already_pending", "A signup verification email is already pending");
  }

  const token = randomBytes(32).toString("hex");
  const passwordHash = await hashPassword(input.password);
  const payload: SignupPayload = {
    email,
    passwordHash,
    businessName,
    slug,
    ownerName: `${businessName} Owner`,
    trialPlanCode: "pro",
  };
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await deps.insertToken({ token, email, payload, expiresAt });
  await deps.enqueue({
    to: email,
    template: "signup_verify",
    vars: {
      businessName,
      verifyUrl: verifyUrl(deps.publicAppUrl, token),
    },
  });

  return { tokenSent: true };
}

export async function consumeSignup(deps: ConsumeSignupDeps): Promise<{ tenantId: string; slug: string }> {
  const row = await deps.loadToken(deps.token);
  if (!row || row.consumed_at) {
    throw new AppError(400, "SIGNUP_TOKEN_INVALID", "Signup token is invalid");
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new AppError(400, "SIGNUP_TOKEN_EXPIRED", "Signup token has expired");
  }

  const out = await deps.bootstrapTenant(row.payload, deps.token);
  await deps.markConsumed(deps.token);
  return out;
}
