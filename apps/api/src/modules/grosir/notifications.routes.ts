import type { JwtPayload } from "@app/shared";
import { Hono } from "hono";

import { listNotifications, markRead } from "./notifications.service";

export const notificationsRoutes = new Hono<{
  Variables: { auth: JwtPayload };
}>();

notificationsRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  return c.json(
    await listNotifications(auth.tenantId!, {
      unreadOnly: c.req.query("unreadOnly") === "true",
    }),
  );
});

notificationsRoutes.patch("/:id/read", async (c) => {
  const auth = c.get("auth");
  await markRead(auth.tenantId!, c.req.param("id"));
  return c.json({ ok: true });
});
