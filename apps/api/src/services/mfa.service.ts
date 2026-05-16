import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { generateSecret, generateSync, generateURI, verifySync } from "otplib";

import { decrypt, encrypt } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { redis } from "../lib/redis";

const DEFAULT_ISSUER = "BroSolution";
const TOTP_CODE_PATTERN = /^\d{6}$/;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_WINDOW_SECONDS = TOTP_PERIOD_SECONDS;

type OtpStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: Array<string | number>): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
};

const OTP_TTL_SECONDS = 300;
const OTP_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 3;

const otpKey = (userId: string) => `mfa:otp:${userId}`;
const attemptsKey = (userId: string) => `mfa:otp:attempts:${userId}`;
const cooldownKey = (userId: string) => `mfa:otp:cooldown:${userId}`;

function randomSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createMfaOtpService(store: OtpStore, codeGenerator: () => string = randomSixDigitCode) {
  return {
    async issueEmailOtp(userId: string): Promise<string> {
      const reserved = await store.set(cooldownKey(userId), "1", "EX", OTP_COOLDOWN_SECONDS, "NX");
      if (reserved === null) {
        throw new AppError(429, "otp_rate_limited", "Please wait before requesting another OTP");
      }

      const code = codeGenerator();
      if (!/^\d{6}$/.test(code)) {
        throw new Error("OTP generator must return a six digit code");
      }

      await store.set(otpKey(userId), hashOtp(code), "EX", OTP_TTL_SECONDS);
      await store.del(attemptsKey(userId));
      return code;
    },

    async verifyEmailOtp(userId: string, code: string): Promise<boolean> {
      if (!/^\d{6}$/.test(code)) {
        return false;
      }

      const attempts = Number((await store.get(attemptsKey(userId))) ?? 0);
      if (attempts >= MAX_OTP_ATTEMPTS) {
        return false;
      }

      const storedHash = await store.get(otpKey(userId));
      if (!storedHash) {
        return false;
      }

      if (!hashesMatch(hashOtp(code), storedHash)) {
        await store.incr(attemptsKey(userId));
        await store.expire(attemptsKey(userId), OTP_TTL_SECONDS);
        return false;
      }

      await store.del(otpKey(userId), attemptsKey(userId));
      return true;
    },
  };
}

type EnrollTotpDeps = {
  label: string;
  issuer?: string;
  saveSecret: (cipher: string) => Promise<void>;
};

export async function enrollTotp(deps: EnrollTotpDeps): Promise<{ secret: string; otpauth: string }> {
  const secret = generateSecret();
  const cipher = encrypt(secret);

  await deps.saveSecret(cipher);

  return {
    secret,
    otpauth: generateURI({ issuer: deps.issuer ?? DEFAULT_ISSUER, label: deps.label, secret, period: TOTP_PERIOD_SECONDS }),
  };
}

export function verifyTotp(secret: string, code: string): boolean {
  if (!TOTP_CODE_PATTERN.test(code)) {
    return false;
  }

  try {
    return verifySync({ secret, token: code, period: TOTP_PERIOD_SECONDS, epochTolerance: TOTP_WINDOW_SECONDS }).valid;
  } catch {
    return false;
  }
}

export function generateCurrentTotp(secret: string): string {
  return generateSync({ secret, period: TOTP_PERIOD_SECONDS });
}

export function decryptStoredSecret(cipher: string): string {
  return decrypt(cipher);
}

const mfaOtpService = createMfaOtpService(redis as unknown as OtpStore);

export const issueEmailOtp = mfaOtpService.issueEmailOtp;
export const verifyEmailOtp = mfaOtpService.verifyEmailOtp;
