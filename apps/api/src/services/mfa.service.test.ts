import { describe, expect, it } from "vitest";

import { AppError } from "../lib/errors";
import { createMfaOtpService } from "./mfa.service";

type Entry = { value: string; expiresAt?: number };

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
