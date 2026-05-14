import type { JwtPayload, Sector } from "@app/shared";
import { Hono } from "hono";

import { authMiddleware } from "../../middleware/auth";

/**
 * Base router for the grosir module. The tenant router already ran auth,
 * tenant-match, and sector lookup. Fetch delegation starts a fresh Hono
 * context, so re-run bearer auth here to repopulate c.get("auth") for
 * later grosir subrouters.
 */
export const grosirRouter = new Hono<{
  Variables: { auth: JwtPayload; sector: Sector };
}>();

grosirRouter.use("*", authMiddleware);

// Sub-routers are mounted here in later tasks:
// grosirRouter.route("/masterdata", masterdataRoutes);
// grosirRouter.route("/products", productsRoutes);
// grosirRouter.route("/stock-in", stockInRoutes);
// grosirRouter.route("/sales", salesRoutes);
// grosirRouter.route("/adjustments", adjustmentsRoutes);
// grosirRouter.route("/dashboard", dashboardRoutes);
// grosirRouter.route("/reports", reportsRoutes);
// grosirRouter.route("/notifications", notificationsRoutes);
