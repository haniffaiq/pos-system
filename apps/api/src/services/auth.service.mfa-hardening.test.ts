import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "test_access";
process.env.JWT_REFRESH_SECRET = "test_refresh";
process.env.ACCESS_TOKEN_TTL = "900";
process.env.REFRESH_TOKEN_TTL = "1209600";
process.env.MFA_KMS_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

const mocks = vi.hoisted(() => ({
  redis: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
  },
  issueEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
  verifyTotp: vi.fn(),
  decryptStoredSecret: vi.fn(),
  sendMfaEmail: vi.fn(),
  signAccess: vi.fn(),
  signRefresh: vi.fn(),
  verifyRefresh: vi.fn(),
}));

vi.mock("../lib/redis", () => ({ redis: mocks.redis }));
vi.mock("../lib/jwt", () => ({
  signAccess: mocks.signAccess,
  signRefresh: mocks.signRefresh,
  verifyRefresh: mocks.verifyRefresh,
}));
vi.mock("../db/withTenant", () => ({ withAdmin: vi.fn() }));
vi.mock("../lib/refreshStore", () => ({
  isRefreshValid: vi.fn(),
  revokeRefresh: vi.fn(),
  saveRefresh: vi.fn(),
}));
vi.mock("../lib/refreshBlacklist", () => ({
  isRefreshBlacklisted: vi.fn(),
  blacklistRefreshToken: vi.fn(),
}));
vi.mock("./email.service", () => ({ sendMfaEmail: mocks.sendMfaEmail }));
vi.mock("./mfa.service", () => ({
  decryptStoredSecret: mocks.decryptStoredSecret,
  issueEmailOtp: mocks.issueEmailOtp,
  verifyEmailOtp: mocks.verifyEmailOtp,
  verifyTotp: mocks.verifyTotp,
}));

import { AppError } from "../lib/errors";
import { assertMfaBypassSafe, sendMfaChallengeEmail, verifyMfaChallenge } from "./auth.service";

const challengeRecord = {
  payload: { sub: "user-1", tenantId: "tenant-1", role: "owner" as const },
  identity: { user: { id: "user-1", tenantId: "tenant-1", email: "owner@example.test", name: "Owner", role: "owner" as const } },
  email: "owner@example.test",
  methods: ["email_otp" as const],
};

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv };
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
  process.env.REFRESH_TOKEN_TTL = "1209600";
  process.env.MFA_KMS_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
  mocks.redis.get.mockResolvedValue(JSON.stringify(challengeRecord));
  mocks.redis.incr.mockResolvedValue(1);
  mocks.redis.ttl.mockResolvedValue(120);
  mocks.issueEmailOtp.mockResolvedValue("123456");
  mocks.verifyEmailOtp.mockResolvedValue(false);
});

describe("MFA auth hardening", () => {
  it("rate limits challenge email sends by challenge token and user", async () => {
    process.env.MFA_CHALLENGE_RATE_LIMIT_POINTS = "1";
    mocks.redis.incr
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    await sendMfaChallengeEmail("challenge-1");

    await expect(sendMfaChallengeEmail("challenge-1")).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    } satisfies Partial<AppError>);
    expect(mocks.redis.incr).toHaveBeenNthCalledWith(1, "mfa:challenge:rate:send:challenge-1");
    expect(mocks.redis.incr).toHaveBeenNthCalledWith(2, "mfa:user:rate:send:user-1");
    expect(mocks.redis.incr).toHaveBeenNthCalledWith(3, "mfa:challenge:rate:send:challenge-1");
    expect(mocks.issueEmailOtp).toHaveBeenCalledTimes(1);
  });

  it("deletes an MFA challenge after the configured max failed verifications", async () => {
    process.env.MFA_CHALLENGE_MAX_FAILURES = "2";
    mocks.redis.get.mockResolvedValue(JSON.stringify({ ...challengeRecord, failures: 1 }));

    await expect(verifyMfaChallenge("challenge-1", "email_otp", "000000")).rejects.toMatchObject({
      status: 401,
      code: "invalid_mfa",
    } satisfies Partial<AppError>);

    expect(mocks.verifyEmailOtp).toHaveBeenCalledWith("user-1", "000000");
    expect(mocks.redis.del).toHaveBeenCalledWith("mfa:challenge:challenge-1");
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });

  it("refuses AUTH_MFA_BYPASS_EMAILS in production-like environments only", () => {
    process.env.AUTH_MFA_BYPASS_EMAILS = "owner@example.test";
    process.env.NODE_ENV = "production";

    expect(() => assertMfaBypassSafe()).toThrow(/test\/development-only/);

    process.env.NODE_ENV = "test";
    process.env.APP_ENV = "development";
    expect(() => assertMfaBypassSafe()).not.toThrow();
  });
});
