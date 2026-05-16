import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { type JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { z } from "zod";

import { enforceQuota } from "../../middleware/enforceQuota";
import { requireRole } from "../../middleware/requireRole";
import { incrementUsage } from "../../services/quota.service";
import { getExportDownload, listExports, requestExport, salesReport, stockReport, type ReportRange } from "./reports.service";

export const reportsRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

const rangeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const parseRange = (from: string | undefined, to: string | undefined): ReportRange =>
  rangeSchema.parse({ from, to }) as ReportRange;

const exportRequestSchema = z.object({
  type: z.enum(["sales", "stock"]),
  params: z.record(z.string(), z.string()).default({}),
});

reportsRoutes.use("*", requireRole("owner", "manager"));

reportsRoutes.get("/sales", async (c) => {
  const range = parseRange(c.req.query("from"), c.req.query("to"));
  return c.json(await salesReport(c.get("auth").tenantId!, range));
});

reportsRoutes.get("/stock", async (c) => {
  const range = parseRange(c.req.query("from"), c.req.query("to"));
  return c.json(await stockReport(c.get("auth").tenantId!, range));
});

reportsRoutes.get("/exports", async (c) => c.json(await listExports(c.get("auth").tenantId!)));

reportsRoutes.post("/exports", enforceQuota("exports"), async (c) => {
  const auth = c.get("auth");
  const body = exportRequestSchema.parse(await c.req.json());
  const exportRequest = await requestExport(auth.tenantId!, auth.sub, body.type, body.params);
  await incrementUsage(auth.tenantId!, "export_count");
  return c.json(exportRequest, 202);
});

reportsRoutes.get("/exports/:id/download", async (c) => {
  const download = await getExportDownload(c.get("auth").tenantId!, c.req.param("id"));
  const data = await readFile(download.filePath);
  c.header("content-type", "text/csv; charset=utf-8");
  c.header("content-disposition", `attachment; filename="${basename(download.filename)}"`);
  return c.body(data);
});
