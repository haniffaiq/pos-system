import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "test_access";
process.env.JWT_REFRESH_SECRET = "test_refresh";
process.env.ACCESS_TOKEN_TTL = "900";
process.env.REFRESH_TOKEN_TTL = "1209600";
process.env.MFA_KMS_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

const mocks = vi.hoisted(() => ({
  verifyRefresh: vi.fn(),
  signAccess: vi.fn(),
  signRefresh: vi.fn(),
  isRefreshValid: vi.fn(),
  revokeRefresh: vi.fn(),
  saveRefresh: vi.fn(),
  isRefreshBlacklisted: vi.fn(),
  blacklistRefreshToken: vi.fn(),
}));

vi.mock("../lib/jwt", () => ({
  verifyRefresh: mocks.verifyRefresh,
  signAccess: mocks.signAccess,
  signRefresh: mocks.signRefresh,
}));

vi.mock("../lib/refreshStore", () => ({
  isRefreshValid: mocks.isRefreshValid,
  revokeRefresh: mocks.revokeRefresh,
  saveRefresh: mocks.saveRefresh,
}));

vi.mock("../lib/refreshBlacklist", () => ({
  isRefreshBlacklisted: mocks.isRefreshBlacklisted,
  blacklistRefreshToken: mocks.blacklistRefreshToken,
}));

vi.mock("../db/withTenant", () => ({
  withAdmin: vi.fn(),
}));

vi.mock("../lib/redis", () => ({
  redis: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
}));

vi.mock("./email.service", () => ({
  sendMfaEmail: vi.fn(),
}));

vi.mock("./mfa.service", () => ({
  decryptStoredSecret: vi.fn(),
  issueEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
  verifyTotp: vi.fn(),
}));

import { logout, refresh } from "./auth.service";
import { AppError } from "../lib/errors";

const decodedUserRefresh = {
  sub: "user-1",
  tenantId: "tenant-1",
  role: "manager" as const,
  jti: "jti-1",
  exp: 1_800_000_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyRefresh.mockResolvedValue(decodedUserRefresh);
  mocks.isRefreshValid.mockResolvedValue(true);
  mocks.isRefreshBlacklisted.mockResolvedValue(false);
  mocks.signAccess.mockResolvedValue("new-access");
  mocks.signRefresh.mockResolvedValue({ token: "new-refresh", jti: "jti-2" });
});

describe("auth.service refresh-token blacklist", () => {
  it("rejects refresh tokens whose jti is already in the durable blacklist", async () => {
    mocks.isRefreshBlacklisted.mockResolvedValueOnce(true);

    await expect(refresh("revoked-refresh-token")).rejects.toMatchObject({
      status: 401,
      code: "invalid_refresh",
    } satisfies Partial<AppError>);

    expect(mocks.isRefreshBlacklisted).toHaveBeenCalledWith("jti-1");
    expect(mocks.isRefreshValid).not.toHaveBeenCalled();
    expect(mocks.revokeRefresh).not.toHaveBeenCalled();
    expect(mocks.signRefresh).not.toHaveBeenCalled();
  });

  it("persists the refresh token jti to the durable blacklist on logout", async () => {
    await logout("refresh-token");

    expect(mocks.revokeRefresh).toHaveBeenCalledWith("user-1", "jti-1");
    expect(mocks.blacklistRefreshToken).toHaveBeenCalledWith(decodedUserRefresh, "logout");
  });

  it("does not hide blacklist persistence failures during logout", async () => {
    const persistenceError = new Error("blacklist unavailable");
    mocks.blacklistRefreshToken.mockRejectedValueOnce(persistenceError);

    await expect(logout("refresh-token")).rejects.toThrow(persistenceError);

    expect(mocks.revokeRefresh).toHaveBeenCalledWith("user-1", "jti-1");
  });
});
