import { describe, expect, it, vi } from "vitest";

import { AppError } from "../lib/errors";
import { verifyPassword } from "../lib/password";
import { consumeSignup, startSignup } from "./signup.service";

describe("signup.service", () => {
  it("startSignup creates a 24-hour token with normalized safe onboarding payload and enqueues verification email", async () => {
    const insertToken = vi.fn().mockResolvedValue(undefined);
    const isSlugAvailable = vi.fn().mockResolvedValue(true);
    const hasActiveSignupForEmail = vi.fn().mockResolvedValue(false);
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const out = await startSignup(
      { email: " Owner@Example.COM ", password: "secret123", businessName: " ABC Grosir ", slug: "ABC-Grosir" },
      { insertToken, isSlugAvailable, hasActiveSignupForEmail, enqueue, publicAppUrl: "https://app.example.test" },
    );

    expect(out).toEqual({ tokenSent: true });
    expect(isSlugAvailable).toHaveBeenCalledWith("abc-grosir");
    expect(hasActiveSignupForEmail).toHaveBeenCalledWith("owner@example.com");
    expect(insertToken).toHaveBeenCalledOnce();
    const row = insertToken.mock.calls[0]![0];
    expect(row.token).toMatch(/^[a-f0-9]{64}$/);
    expect(row.email).toBe("owner@example.com");
    expect(row.payload).toMatchObject({
      email: "owner@example.com",
      businessName: "ABC Grosir",
      slug: "abc-grosir",
      ownerName: "ABC Grosir Owner",
      trialPlanCode: "pro",
    });
    expect(row.payload.passwordHash).not.toBe("secret123");
    await expect(verifyPassword(row.payload.passwordHash, "secret123")).resolves.toBe(true);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
    expect(enqueue).toHaveBeenCalledWith({
      to: "owner@example.com",
      template: "signup_verify",
      vars: expect.objectContaining({
        businessName: "ABC Grosir",
        verifyUrl: `https://app.example.test/verify?token=${row.token}`,
      }),
    });
  });

  it("startSignup rejects taken slugs and active pending signups", async () => {
    await expect(
      startSignup(
        { email: "a@example.test", password: "secret123", businessName: "A", slug: "taken" },
        {
          insertToken: vi.fn(),
          isSlugAvailable: vi.fn().mockResolvedValue(false),
          hasActiveSignupForEmail: vi.fn().mockResolvedValue(false),
          enqueue: vi.fn(),
        },
      ),
    ).rejects.toMatchObject<AppError>({ status: 409, code: "slug_taken" });

    await expect(
      startSignup(
        { email: "a@example.test", password: "secret123", businessName: "A", slug: "open" },
        {
          insertToken: vi.fn(),
          isSlugAvailable: vi.fn().mockResolvedValue(true),
          hasActiveSignupForEmail: vi.fn().mockResolvedValue(true),
          enqueue: vi.fn(),
        },
      ),
    ).rejects.toMatchObject<AppError>({ status: 409, code: "signup_already_pending" });
  });

  it("consumeSignup rejects invalid, used, and expired tokens before bootstrapping", async () => {
    const bootstrapTenant = vi.fn();
    const markConsumed = vi.fn();

    await expect(
      consumeSignup({ token: "missing", loadToken: vi.fn().mockResolvedValue(null), bootstrapTenant, markConsumed }),
    ).rejects.toMatchObject<AppError>({ status: 400, code: "SIGNUP_TOKEN_INVALID" });

    await expect(
      consumeSignup({
        token: "used",
        loadToken: vi.fn().mockResolvedValue({ payload: {}, consumed_at: new Date(), expires_at: new Date(Date.now() + 1_000) }),
        bootstrapTenant,
        markConsumed,
      }),
    ).rejects.toMatchObject<AppError>({ status: 400, code: "SIGNUP_TOKEN_INVALID" });

    await expect(
      consumeSignup({
        token: "expired",
        loadToken: vi.fn().mockResolvedValue({ payload: {}, consumed_at: null, expires_at: new Date(Date.now() - 1_000) }),
        bootstrapTenant,
        markConsumed,
      }),
    ).rejects.toMatchObject<AppError>({ status: 400, code: "SIGNUP_TOKEN_EXPIRED" });

    expect(bootstrapTenant).not.toHaveBeenCalled();
    expect(markConsumed).not.toHaveBeenCalled();
  });

  it("consumeSignup bootstraps the tenant then consumes the token", async () => {
    const payload = { slug: "abc", email: "owner@example.test" };
    const bootstrapTenant = vi.fn().mockResolvedValue({ tenantId: "tenant-1", slug: "abc" });
    const markConsumed = vi.fn().mockResolvedValue(undefined);

    const out = await consumeSignup({
      token: "valid",
      loadToken: vi.fn().mockResolvedValue({ payload, consumed_at: null, expires_at: new Date(Date.now() + 1_000) }),
      bootstrapTenant,
      markConsumed,
    });

    expect(out).toEqual({ tenantId: "tenant-1", slug: "abc" });
    expect(bootstrapTenant).toHaveBeenCalledWith(payload, "valid");
    expect(markConsumed).toHaveBeenCalledWith("valid");
  });
});
