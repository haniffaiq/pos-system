import { Hono, type MiddlewareHandler } from "hono";
import * as client from "prom-client";

import { adminPool, tenantPool } from "../db/pool";
import { QUEUE_NAMES, type QueueName } from "../queue/queues";
export type QueueJobStatus = "completed" | "failed";

let defaultMetricsStarted = false;

export const metricsRegistry = new client.Registry();

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total API HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "API HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

const queueJobsTotal = new client.Counter({
  name: "bullmq_job_total",
  help: "Total BullMQ jobs by queue and terminal status",
  labelNames: ["queue", "status"],
  registers: [metricsRegistry],
});

const queueJobDurationSeconds = new client.Histogram({
  name: "bullmq_job_duration_seconds",
  help: "BullMQ job duration in seconds by queue and terminal status",
  labelNames: ["queue", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 30, 60, 300],
  registers: [metricsRegistry],
});

function activePoolClients(pool: Pick<typeof adminPool, "totalCount" | "idleCount">): number {
  return Math.max(0, pool.totalCount - pool.idleCount);
}

new client.Gauge({
  name: "db_pool_active",
  help: "Active PostgreSQL clients by pool",
  labelNames: ["pool"],
  registers: [metricsRegistry],
  collect() {
    this.set({ pool: "admin" }, activePoolClients(adminPool));
    this.set({ pool: "tenant" }, activePoolClients(tenantPool));
  },
});

function startDefaultMetrics(): void {
  if (defaultMetricsStarted || process.env.NODE_ENV === "test") {
    return;
  }

  client.collectDefaultMetrics({
    register: metricsRegistry,
  });
  defaultMetricsStarted = true;
}

startDefaultMetrics();

function safeRouteLabel(routePath: string | undefined): string {
  return routePath && routePath.length <= 120 ? routePath : "unknown";
}

function safeMethodLabel(method: string): string {
  return method.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10) || "UNKNOWN";
}

function toDurationSeconds(durationMs: number): number {
  return Math.max(0, durationMs) / 1_000;
}

function assertKnownQueue(queue: string): asserts queue is QueueName {
  if (!(QUEUE_NAMES as readonly string[]).includes(queue)) {
    throw new Error(`Unknown queue metric label: ${queue}`);
  }
}

export const metricsMiddleware: MiddlewareHandler = async (c, next) => {
  if (c.req.path === "/metrics") {
    await next();
    return;
  }

  const startedAt = performance.now();
  let thrownError: unknown;

  try {
    await next();
  } catch (error) {
    thrownError = error;
    throw error;
  } finally {
    const method = safeMethodLabel(c.req.method);
    const route = safeRouteLabel(c.req.routePath);
    const status = String(thrownError ? 500 : c.res.status);
    const durationSeconds = (performance.now() - startedAt) / 1_000;

    httpRequestsTotal.inc({ method, route, status });
    httpRequestDurationSeconds.observe({ method, route, status }, durationSeconds);
  }
};

export function recordQueueJob(queue: string, status: QueueJobStatus, durationMs: number): void {
  assertKnownQueue(queue);
  queueJobsTotal.inc({ queue, status });
  queueJobDurationSeconds.observe({ queue, status }, toDurationSeconds(durationMs));
}

export const metricsRoute = new Hono().get("/metrics", async (c) => {
  c.header("content-type", metricsRegistry.contentType);
  return c.body(await metricsRegistry.metrics());
});

export function resetMetricsForTests(): void {
  metricsRegistry.resetMetrics();
}
