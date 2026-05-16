import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/pool", () => ({
  adminPool: { totalCount: 5, idleCount: 2 },
  tenantPool: { totalCount: 3, idleCount: 1 },
}));

import {
  metricsMiddleware,
  metricsRoute,
  recordQueueJob,
  resetMetricsForTests,
} from "./metrics";

describe("metrics", () => {
  beforeEach(() => {
    resetMetricsForTests();
  });

  it("exposes Prometheus metrics with low-cardinality HTTP labels", async () => {
    const app = new Hono();
    app.use("*", metricsMiddleware);
    app.get("/items/:id", (c) => c.text(`item ${c.req.param("id")}`));
    app.route("/", metricsRoute);

    await app.request("/items/one");
    await app.request("/items/two");
    const response = await app.request("/metrics");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("# HELP http_requests_total Total API HTTP requests");
    expect(body).toContain('http_requests_total{method="GET",route="/items/:id",status="200"} 2');
    expect(body).toContain("http_request_duration_seconds_bucket");
    expect(body).not.toContain("/items/one");
    expect(body).not.toContain("/items/two");
  });

  it("records queue job counters and duration histograms with bounded labels", async () => {
    const app = new Hono();
    app.route("/", metricsRoute);

    recordQueueJob("email", "completed", 42);
    recordQueueJob("email", "failed", 1200);
    const response = await app.request("/metrics");
    const body = await response.text();

    expect(body).toContain('bullmq_job_total{queue="email",status="completed"} 1');
    expect(body).toContain('bullmq_job_total{queue="email",status="failed"} 1');
    expect(body).toContain('bullmq_job_duration_seconds_count{queue="email",status="completed"} 1');
    expect(body).toContain('bullmq_job_duration_seconds_count{queue="email",status="failed"} 1');
  });

  it("exports active DB pool gauges without dynamic labels", async () => {
    const app = new Hono();
    app.route("/", metricsRoute);

    const response = await app.request("/metrics");
    const body = await response.text();

    expect(body).toContain("# HELP db_pool_active Active PostgreSQL clients by pool");
    expect(body).toContain('db_pool_active{pool="admin"} 3');
    expect(body).toContain('db_pool_active{pool="tenant"} 2');
  });
});
