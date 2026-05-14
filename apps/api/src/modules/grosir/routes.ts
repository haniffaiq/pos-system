import type { JwtPayload, Sector } from "@app/shared";
import { Hono } from "hono";

import { authMiddleware } from "../../middleware/auth";
import { adjustmentsRoutes } from "./adjustments.routes";
import { dashboardRoutes } from "./dashboard.routes";
import { masterdataRoutes } from "./masterdata.routes";
import { notificationsRoutes } from "./notifications.routes";
import { productsRoutes } from "./products.routes";
import { reportsRoutes } from "./reports.routes";
import { salesRoutes } from "./sales.routes";
import { stockInRoutes } from "./stockin.routes";

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

grosirRouter.route("/masterdata", masterdataRoutes);
grosirRouter.route("/products", productsRoutes);
grosirRouter.route("/stock-in", stockInRoutes);
grosirRouter.route("/sales", salesRoutes);
grosirRouter.route("/adjustments", adjustmentsRoutes);
grosirRouter.route("/dashboard", dashboardRoutes);
grosirRouter.route("/reports", reportsRoutes);
grosirRouter.route("/notifications", notificationsRoutes);
