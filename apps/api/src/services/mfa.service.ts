import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { AppError } from "../lib/errors";
import { redis } from "../lib/redis";

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

const mfaOtpService = createMfaOtpService(redis as unknown as OtpStore);

export const issueEmailOtp = mfaOtpService.issueEmailOtp;
export const verifyEmailOtp = mfaOtpService.verifyEmailOtp;
