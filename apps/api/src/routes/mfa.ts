import type { JwtPayload } from "@app/shared";
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { toDataURL } from "qrcode";
import { z } from "zod";

import type { Query } from "../db/withTenant";
import { withAdmin, withTenant } from "../db/withTenant";
import { authMiddleware as defaultAuthMiddleware } from "../middleware/auth";
import { decryptStoredSecret, enrollTotp, verifyTotp } from "../services/mfa.service";

const verifyBody = z.object({ code: z.string().regex(/^\d{6}$/) });

type MfaRouterDeps = {
  authMiddleware?: MiddlewareHandler;
  makeQrDataUrl?: (otpauth: string) => Promise<string>;
  runForAuth?: (auth: JwtPayload, fn: (q: Query) => Promise<unknown>) => Promise<unknown>;
};

const principal = (auth: JwtPayload) => {
  if (auth.role === "platform_admin") {
    return {
      id: auth.sub,
      label: "platform-admin",
      table: "platform_admin_mfa",
      idColumn: "admin_id",
    } as const;
  }

  return {
    id: auth.sub,
    label: auth.sub,
    table: "user_mfa",
    idColumn: "user_id",
  } as const;
};

const defaultRunForAuth = (auth: JwtPayload, fn: (q: Query) => Promise<unknown>) => {
  if (auth.role === "platform_admin") {
    return withAdmin(fn);
  }
  if (!auth.tenantId) {
    throw new Error("Tenant user MFA requires tenant context");
  }
  return withTenant(auth.tenantId, { userId: auth.sub }, fn);
};

const jsonError = (c: Context, status: 400 | 401, code: string, message: string) =>
  c.json({ error: { code, message } }, status);

export function createMfaRouter(deps: MfaRouterDeps = {}) {
  const router = new Hono();
  const requireAuth = deps.authMiddleware ?? defaultAuthMiddleware;
  const makeQrDataUrl = deps.makeQrDataUrl ?? toDataURL;
  const runForAuth = deps.runForAuth ?? defaultRunForAuth;

  router.use("*", requireAuth);

  router.post("/enroll", async (c) => {
    const auth = c.get("auth");
    const subject = principal(auth);
    const out = await enrollTotp({
      label: subject.label,
      saveSecret: async (cipher) => {
        await runForAuth(auth, (q) =>
          q(
            `insert into ${subject.table} (${subject.idColumn}, method, secret_encrypted, enabled)
             values ($1, 'totp', $2, false)
             on conflict (${subject.idColumn}, method) do update
             set secret_encrypted = excluded.secret_encrypted,
                 enabled = false,
                 enrolled_at = null,
                 verified_at = null,
                 updated_at = now()`,
            [subject.id, cipher],
          ),
        );
      },
    });

    return c.json({ qr: await makeQrDataUrl(out.otpauth), otpauth: out.otpauth });
  });

  router.post("/verify", async (c) => {
    const auth = c.get("auth");
    const subject = principal(auth);
    const { code } = verifyBody.parse(await c.req.json());

    const row = (await runForAuth(auth, async (q) => {
      const result = await q<{ secret_encrypted: string }>(
        `select secret_encrypted from ${subject.table} where ${subject.idColumn} = $1 and method = 'totp'`,
        [subject.id],
      );
      return result.rows[0];
    })) as { secret_encrypted: string } | undefined;

    if (!row?.secret_encrypted) {
      return jsonError(c, 400, "MFA_NOT_ENROLLED", "TOTP is not enrolled");
    }

    if (!verifyTotp(decryptStoredSecret(row.secret_encrypted), code)) {
      return jsonError(c, 401, "MFA_INVALID", "Invalid MFA code");
    }

    await runForAuth(auth, (q) =>
      q(
        `update ${subject.table}
         set enabled = true, enrolled_at = coalesce(enrolled_at, now()), verified_at = now(), updated_at = now()
         where ${subject.idColumn} = $1 and method = 'totp'`,
        [subject.id],
      ),
    );

    return c.json({ enabled: true });
  });

  return router;
}

export const mfaRouter = createMfaRouter();
