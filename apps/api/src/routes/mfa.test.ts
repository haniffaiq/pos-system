import type { JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateSecret } from "otplib";

import { encrypt } from "../lib/crypto";
import { generateCurrentTotp } from "../services/mfa.service";
import { createMfaRouter } from "./mfa";

const KEY = Buffer.alloc(32, 1).toString("base64");
const USER_AUTH: JwtPayload = {
  sub: "00000000-0000-4000-8000-000000000101",
  tenantId: "00000000-0000-4000-8000-000000000001",
  role: "owner",
};
const ADMIN_AUTH: JwtPayload = {
  sub: "00000000-0000-4000-8000-000000000201",
  tenantId: null,
  role: "platform_admin",
};

type StoredMfa = { secret_encrypted: string; enabled: boolean; enrolled_at?: string; verified_at?: string };

const authStub = (auth: JwtPayload) => vi.fn(async (c, next) => {
  c.set("auth", auth);
  await next();
});

const appFor = (auth: JwtPayload, store: Map<string, StoredMfa>) => {
  const statements: string[] = [];
  const app = new Hono();
  app.route(
    "/mfa",
    createMfaRouter({
      authMiddleware: authStub(auth),
      makeQrDataUrl: async (otpauth) => `data:qr,${otpauth}`,
      runForAuth: async (_auth, fn) =>
        fn(async (text, params = []) => {
          statements.push(text);
          const key = `${params[0]}:totp`;
          if (text.startsWith("insert into")) {
            store.set(key, { secret_encrypted: String(params[1]), enabled: false });
            return { rows: [], rowCount: 1 } as never;
          }
          if (text.startsWith("select secret_encrypted")) {
            const row = store.get(key);
            return { rows: row ? [{ secret_encrypted: row.secret_encrypted }] : [], rowCount: row ? 1 : 0 } as never;
          }
          if (text.startsWith("update")) {
            const row = store.get(key);
            if (row) {
              row.enabled = true;
              row.enrolled_at = "now";
              row.verified_at = "now";
            }
            return { rows: [], rowCount: row ? 1 : 0 } as never;
          }
          throw new Error(`unexpected query: ${text}`);
        }),
    }),
  );
  return { app, statements };
};

describe("mfa routes", () => {
  beforeEach(() => {
    process.env.MFA_KMS_KEY = KEY;
  });

  it("enrolls a tenant user TOTP secret as encrypted pending MFA and returns a QR code", async () => {
    const store = new Map<string, StoredMfa>();
    const { app, statements } = appFor(USER_AUTH, store);

    const response = await app.request("/mfa/enroll", { method: "POST", body: "{}" });
    const body = await response.json();
    const stored = store.get(`${USER_AUTH.sub}:totp`)!;

    expect(response.status).toBe(200);
    expect(body.qr).toMatch(/^data:qr,otpauth:\/\/totp\//);
    expect(body.otpauth).toMatch(/^otpauth:\/\/totp\//);
    expect(stored.enabled).toBe(false);
    expect(stored.secret_encrypted).toBeTruthy();
    expect(stored.secret_encrypted).not.toContain(body.otpauth);
    expect(statements[0]).toContain("insert into user_mfa");
  });

  it("enables TOTP after a valid verification code", async () => {
    const secret = generateSecret();
    const store = new Map<string, StoredMfa>([[`${USER_AUTH.sub}:totp`, { secret_encrypted: encrypt(secret), enabled: false }]]);
    const { app } = appFor(USER_AUTH, store);

    const response = await app.request("/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ code: generateCurrentTotp(secret) }),
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
    expect(store.get(`${USER_AUTH.sub}:totp`)!.enabled).toBe(true);
  });

  it("rejects invalid or missing TOTP enrollments without enabling MFA", async () => {
    const secret = generateSecret();
    const store = new Map<string, StoredMfa>([[`${USER_AUTH.sub}:totp`, { secret_encrypted: encrypt(secret), enabled: false }]]);
    const { app } = appFor(USER_AUTH, store);

    const bad = await app.request("/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ code: "000000" }),
      headers: { "content-type": "application/json" },
    });
    const missing = await appFor(USER_AUTH, new Map()).app.request("/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ code: "000000" }),
      headers: { "content-type": "application/json" },
    });

    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: { code: "MFA_INVALID", message: "Invalid MFA code" } });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: { code: "MFA_NOT_ENROLLED", message: "TOTP is not enrolled" } });
    expect(store.get(`${USER_AUTH.sub}:totp`)!.enabled).toBe(false);
  });

  it("uses the platform admin MFA table for platform admin enrollment", async () => {
    const store = new Map<string, StoredMfa>();
    const { app, statements } = appFor(ADMIN_AUTH, store);

    const response = await app.request("/mfa/enroll", { method: "POST", body: "{}" });

    expect(response.status).toBe(200);
    expect(statements[0]).toContain("insert into platform_admin_mfa");
    expect(store.has(`${ADMIN_AUTH.sub}:totp`)).toBe(true);
  });
});
