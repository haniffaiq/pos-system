import { Hono } from "hono";
import { z } from "zod";

import { adminPool } from "../db/pool";
import { AppError } from "../lib/errors";
import { signupIpRateLimit, rateLimitMiddleware, requestIpKey } from "../middleware/rateLimit";
import { emailQueue, type EmailJob } from "../queue/queues";
import { consumeSignup, startSignup, type SignupPayload, type SignupTokenRecord } from "../services/signup.service";

const signupBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  businessName: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9-]+$/),
});

const verifyBodySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});

const signupLimiter = rateLimitMiddleware(signupIpRateLimit, requestIpKey);

async function insertSignupToken(row: {
  token: string;
  email: string;
  payload: SignupPayload;
  expiresAt: Date;
}): Promise<void> {
  await adminPool.query(
    `insert into signup_tokens (token, email, payload, expires_at)
     values ($1, $2, $3::jsonb, $4)`,
    [row.token, row.email, JSON.stringify(row.payload), row.expiresAt],
  );
}

async function isSlugAvailable(slug: string): Promise<boolean> {
  const result = await adminPool.query("select 1 from tenants where slug = $1", [slug]);
  return result.rowCount === 0;
}

async function hasActiveSignupForEmail(email: string): Promise<boolean> {
  const result = await adminPool.query(
    `select 1
     from signup_tokens
     where lower(email) = lower($1)
       and consumed_at is null
       and expires_at > now()
     limit 1`,
    [email],
  );
  return Boolean(result.rowCount);
}

async function enqueueSignupEmail(job: EmailJob): Promise<void> {
  await emailQueue.add("signup-verify", job, { jobId: `signup-verify-${job.vars.verifyUrl.split("token=")[1]}` });
}

async function loadSignupToken(token: string): Promise<SignupTokenRecord | null> {
  const result = await adminPool.query<SignupTokenRecord>(
    "select payload, consumed_at, expires_at from signup_tokens where token = $1",
    [token],
  );
  return result.rows[0] ?? null;
}

async function bootstrapTenantFromSignup(payload: SignupPayload, token: string): Promise<{ tenantId: string; slug: string }> {
  const client = await adminPool.connect();
  try {
    await client.query("begin");
    const consumed = await client.query(
      `update signup_tokens
       set consumed_at = now()
       where token = $1 and consumed_at is null and expires_at > now()
       returning token`,
      [token],
    );
    if (consumed.rowCount === 0) {
      throw new AppError(400, "SIGNUP_TOKEN_INVALID", "Signup token is invalid");
    }

    const tenantResult = await client.query<{ id: string; slug: string }>(
      `insert into tenants (name, slug, sector)
       values ($1, $2, 'grosir')
       returning id, slug`,
      [payload.businessName, payload.slug],
    );
    const tenant = tenantResult.rows[0]!;

    const userResult = await client.query<{ id: string }>(
      `insert into users (tenant_id, email, password_hash, name, role)
       values ($1, $2, $3, $4, 'owner')
       returning id`,
      [tenant.id, payload.email, payload.passwordHash, payload.ownerName],
    );
    const owner = userResult.rows[0]!;

    const planResult = await client.query<{ id: string }>("select id from plans where code = $1 and is_active = true", [
      payload.trialPlanCode,
    ]);
    const plan = planResult.rows[0];
    if (!plan) {
      throw new AppError(500, "plan_not_configured", "The Pro trial plan is not configured");
    }

    await client.query(
      `insert into subscriptions (tenant_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
       values ($1, $2, 'trialing', now() + interval '14 days', now(), now() + interval '14 days')`,
      [tenant.id, plan.id],
    );

    await client.query(
      `insert into platform_audit_log (admin_id, action, target, meta)
       values (null, 'tenant.signup', $1, $2::jsonb)`,
      [tenant.id, JSON.stringify({ ownerUserId: owner.id, email: payload.email, plan: payload.trialPlanCode })],
    );

    await client.query("commit");
    return { tenantId: tenant.id, slug: tenant.slug };
  } catch (error) {
    await client.query("rollback");
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new AppError(409, "slug_taken", "That slug is already in use");
    }
    throw error;
  } finally {
    client.release();
  }
}

async function markSignupConsumed(token: string): Promise<void> {
  await adminPool.query("update signup_tokens set consumed_at = coalesce(consumed_at, now()) where token = $1", [token]);
}

export const signupRoutes = new Hono();

signupRoutes.post("/", signupLimiter, async (c) => {
  const body = signupBodySchema.parse(await c.req.json());
  const out = await startSignup(body, {
    insertToken: insertSignupToken,
    isSlugAvailable,
    hasActiveSignupForEmail,
    enqueue: enqueueSignupEmail,
  });
  return c.json(out, 202);
});

signupRoutes.post("/verify", async (c) => {
  const { token } = verifyBodySchema.parse(await c.req.json());
  const out = await consumeSignup({
    token,
    loadToken: loadSignupToken,
    bootstrapTenant: bootstrapTenantFromSignup,
    markConsumed: markSignupConsumed,
  });
  return c.json(out);
});
