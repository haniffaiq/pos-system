import { beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";

import { signAccess } from "../lib/jwt";
import { authMiddleware } from "./auth";
import { onError } from "./error";
import { requireRole } from "./requireRole";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
});

function makeApp() {
  const app = new Hono();
  app.onError(onError);
  app.use("/protected/*", authMiddleware);
  app.get("/protected/me", (c) => c.json(c.get("auth")));
  app.get("/protected/owner-only", requireRole("owner"), (c) => c.json({ ok: true }));
  return app;
}

describe("authMiddleware", () => {
  it("rejects a request with no token", async () => {
    const res = await makeApp().request("/protected/me");

    expect(res.status).toBe(401);
  });

  it("rejects a request with an invalid bearer token", async () => {
    const res = await makeApp().request("/protected/me", {
      headers: { authorization: "Bearer not-a-jwt" },
    });

    expect(res.status).toBe(401);
  });

  it("attaches the auth payload for a valid token", async () => {
    const token = await signAccess({ sub: "u1", tenantId: "t1", role: "owner" });
    const res = await makeApp().request("/protected/me", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sub: "u1", tenantId: "t1", role: "owner" });
  });

  it("requireRole blocks the wrong role", async () => {
    const token = await signAccess({ sub: "u1", tenantId: "t1", role: "cashier" });
    const res = await makeApp().request("/protected/owner-only", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(403);
  });
});
