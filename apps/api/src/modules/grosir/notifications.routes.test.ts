import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JwtPayload } from "@app/shared";
import { AppError } from "../../lib/errors";

const listNotifications = vi.hoisted(() => vi.fn());
const markRead = vi.hoisted(() => vi.fn());

vi.mock("./notifications.service", () => ({
  listNotifications,
  markRead,
}));

function testApp(role: JwtPayload["role"] = "owner", tenantId = "tenant-1") {
  const app = new Hono<{ Variables: { auth: JwtPayload } }>();
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as never);
    }
    throw err;
  });
  app.use("*", async (c, next) => {
    c.set("auth", { sub: "user-1", tenantId, role });
    await next();
  });
  return app;
}

describe("notifications routes", () => {
  beforeEach(() => {
    listNotifications.mockReset();
    markRead.mockReset();
  });

  it.each(["owner", "manager", "cashier"] as const)("allows %s to list unread tenant notifications", async (role) => {
    const { notificationsRoutes } = await import("./notifications.routes");
    const app = testApp(role, "tenant-123");
    app.route("/notifications", notificationsRoutes);
    listNotifications.mockResolvedValueOnce([
      { id: "notif-1", type: "low_stock", title: "Stok menipis", body: null, is_read: false, created_at: "2026-05-15T00:00:00Z" },
    ]);

    const response = await app.request("/notifications?unreadOnly=true");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { id: "notif-1", type: "low_stock", title: "Stok menipis", body: null, is_read: false, created_at: "2026-05-15T00:00:00Z" },
    ]);
    expect(listNotifications).toHaveBeenCalledWith("tenant-123", { unreadOnly: true });
  });

  it.each(["owner", "manager", "cashier"] as const)("allows %s to mark a tenant notification read", async (role) => {
    const { notificationsRoutes } = await import("./notifications.routes");
    const app = testApp(role, "tenant-123");
    app.route("/notifications", notificationsRoutes);
    markRead.mockResolvedValueOnce(undefined);

    const response = await app.request("/notifications/notif-1/read", { method: "PATCH" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(markRead).toHaveBeenCalledWith("tenant-123", "notif-1");
  });
});
