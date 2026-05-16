import { describe, expect, it, beforeEach } from "vitest";

import { generateSecret, generateSync } from "otplib";

import { encrypt } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { createMfaOtpService, decryptStoredSecret, enrollTotp, generateCurrentTotp, verifyTotp } from "./mfa.service";

type Entry = { value: string; expiresAt?: number };

const KEY = Buffer.alloc(32, 1).toString("base64");

beforeEach(() => {
  process.env.MFA_KMS_KEY = KEY;
});

class FakeRedis {
  readonly entries = new Map<string, Entry>();

  async get(key: string): Promise<string | null> {
    return this.entries.get(key)?.value ?? null;
  }

  async set(key: string, value: string, mode?: string, ttl?: number, nx?: string): Promise<"OK" | null> {
    if (nx === "NX" && this.entries.has(key)) {
      return null;
    }
    this.entries.set(key, { value, expiresAt: mode === "EX" && ttl ? ttl : undefined });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.entries.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async incr(key: string): Promise<number> {
    const next = Number(this.entries.get(key)?.value ?? 0) + 1;
    this.entries.set(key, { value: String(next) });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    entry.expiresAt = seconds;
    return 1;
  }
}

describe("mfa TOTP service", () => {
  it("enrolls by encrypting the generated secret and returning a BroSolution otpauth URL", async () => {
    let savedCipher = "";

    const out = await enrollTotp({
      label: "owner@example.com",
      saveSecret: async (cipher) => {
        savedCipher = cipher;
      },
    });

    expect(out.secret).toBeTruthy();
    expect(out.otpauth).toMatch(/^otpauth:\/\/totp\/BroSolution:owner%40example\.com/);
    expect(savedCipher).toBeTruthy();
    expect(savedCipher).not.toContain(out.secret);
    expect(decryptStoredSecret(savedCipher)).toBe(out.secret);
  });

  it("accepts current TOTP codes, adjacent 30s steps, and rejects malformed or incorrect codes", () => {
    const secret = generateSecret();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const previousStepCode = generateSync({ secret, period: 30, epoch: nowSeconds - 30 });
    const nextStepCode = generateSync({ secret, period: 30, epoch: nowSeconds + 30 });

    expect(verifyTotp(secret, generateCurrentTotp(secret))).toBe(true);
    expect(verifyTotp(secret, previousStepCode)).toBe(true);
    expect(verifyTotp(secret, nextStepCode)).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);
    expect(verifyTotp(secret, "not-a-code")).toBe(false);
  });

  it("decrypts persisted MFA secrets with the configured MFA KMS key", () => {
    const secret = generateSecret();
    const cipher = encrypt(secret);

    expect(decryptStoredSecret(cipher)).toBe(secret);
  });
});

describe("mfa email OTP service", () => {
  it("issues a six digit OTP, stores only its hash with five minute expiry, and resets attempts", async () => {
    const redis = new FakeRedis();
    redis.entries.set("mfa:otp:attempts:user-1", { value: "2" });
    const service = createMfaOtpService(redis, () => "123456");

    const code = await service.issueEmailOtp("user-1");

    expect(code).toBe("123456");
    const stored = redis.entries.get("mfa:otp:user-1");
    expect(stored?.value).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.value).not.toBe("123456");
    expect(stored?.expiresAt).toBe(300);
    expect(redis.entries.has("mfa:otp:attempts:user-1")).toBe(false);
  });

  it("rate limits OTP issuance with a cooldown key", async () => {
    const service = createMfaOtpService(new FakeRedis(), () => "123456");

    await service.issueEmailOtp("user-1");

    await expect(service.issueEmailOtp("user-1")).rejects.toMatchObject({
      status: 429,
      code: "otp_rate_limited",
    } satisfies Partial<AppError>);
  });

  it("allows one valid verification then burns the OTP", async () => {
    const service = createMfaOtpService(new FakeRedis(), () => "123456");
    await service.issueEmailOtp("user-1");

    await expect(service.verifyEmailOtp("user-1", "123456")).resolves.toBe(true);
    await expect(service.verifyEmailOtp("user-1", "123456")).resolves.toBe(false);
  });

  it("rejects invalid OTPs after three failed attempts until expiry", async () => {
    const redis = new FakeRedis();
    const service = createMfaOtpService(redis, () => "123456");
    await service.issueEmailOtp("user-1");

    await expect(service.verifyEmailOtp("user-1", "000000")).resolves.toBe(false);
    await expect(service.verifyEmailOtp("user-1", "111111")).resolves.toBe(false);
    await expect(service.verifyEmailOtp("user-1", "222222")).resolves.toBe(false);
    await expect(service.verifyEmailOtp("user-1", "123456")).resolves.toBe(false);
    expect(redis.entries.get("mfa:otp:attempts:user-1")?.expiresAt).toBe(300);
  });
});
