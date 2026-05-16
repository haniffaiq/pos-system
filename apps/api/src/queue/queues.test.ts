import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const describeWithRedis = process.env.REDIS_URL ? describe : describe.skip;

const queuePrefix = `test-${process.pid}-${Date.now()}`;
process.env.BULLMQ_QUEUE_PREFIX = queuePrefix;

let redis: typeof import("../lib/redis")["redis"];
let provisioningQueue: typeof import("./queues")["provisioningQueue"];
let emailQueue: typeof import("./queues")["emailQueue"];
let lowStockScanQueue: typeof import("./queues")["lowStockScanQueue"];
let exportGenerationQueue: typeof import("./queues")["exportGenerationQueue"];
let reconcileInvoicesQueue: typeof import("./queues")["reconcileInvoicesQueue"];
let dunningQueue: typeof import("./queues")["dunningQueue"];
let purgeRefreshBlacklistQueue: typeof import("./queues")["purgeRefreshBlacklistQueue"];
let QUEUE_NAMES: typeof import("./queues")["QUEUE_NAMES"];
let WORKER_QUEUE_NAMES: typeof import("../worker")["WORKER_QUEUE_NAMES"];

const queueKeyPattern = `${queuePrefix}:*`;

async function cleanupQueueKeys(): Promise<void> {
  if (!redis) {
    return;
  }

  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", queueKeyPattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== "0");
}

describeWithRedis("queues", () => {
  beforeAll(async () => {
    ({ redis } = await import("../lib/redis"));
    ({
      provisioningQueue,
      emailQueue,
      lowStockScanQueue,
      exportGenerationQueue,
      reconcileInvoicesQueue,
      dunningQueue,
      purgeRefreshBlacklistQueue,
      QUEUE_NAMES,
    } = await import("./queues"));
    ({ WORKER_QUEUE_NAMES } = await import("../worker"));
  });

  afterEach(async () => {
    await provisioningQueue?.drain(true);
    await emailQueue?.drain(true);
    await lowStockScanQueue?.drain(true);
    await exportGenerationQueue?.drain(true);
    await reconcileInvoicesQueue?.drain(true);
    await dunningQueue?.drain(true);
    await purgeRefreshBlacklistQueue?.drain(true);
    await cleanupQueueKeys();
  });

  afterAll(async () => {
    await provisioningQueue?.close();
    await emailQueue?.close();
    await lowStockScanQueue?.close();
    await exportGenerationQueue?.close();
    await reconcileInvoicesQueue?.close();
    await dunningQueue?.close();
    await purgeRefreshBlacklistQueue?.close();
    await cleanupQueueKeys();
    await redis?.quit();
  });

  it("uses stable queue names that match worker registration", () => {
    expect(QUEUE_NAMES).toEqual([
      "provisioning",
      "email",
      "low-stock-scan",
      "export-generation",
      "reconcile-invoices",
      "dunning",
      "purge-refresh-blacklist",
    ]);
    expect(WORKER_QUEUE_NAMES).toEqual(QUEUE_NAMES);

    expect(provisioningQueue.name).toBe("provisioning");
    expect(emailQueue.name).toBe("email");
    expect(lowStockScanQueue.name).toBe("low-stock-scan");
    expect(exportGenerationQueue.name).toBe("export-generation");
    expect(reconcileInvoicesQueue.name).toBe("reconcile-invoices");
    expect(dunningQueue.name).toBe("dunning");
    expect(purgeRefreshBlacklistQueue.name).toBe("purge-refresh-blacklist");
  });

  it("sets bounded attempts, backoff, and removal policies on all queues", () => {
    for (const queue of [
      provisioningQueue,
      emailQueue,
      lowStockScanQueue,
      exportGenerationQueue,
      reconcileInvoicesQueue,
      dunningQueue,
      purgeRefreshBlacklistQueue,
    ]) {
      expect(queue.jobsOpts).toMatchObject({
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      });
    }
  });

  it("enqueues provisioning jobs and reads them back", async () => {
    const job = await provisioningQueue.add("provision", { tenantId: "t-queue-1" });

    expect(job.id).toBeTruthy();
    const fetched = await provisioningQueue.getJob(job.id!);
    expect(fetched?.name).toBe("provision");
    expect(fetched?.data).toEqual({ tenantId: "t-queue-1" });
  });

  it("enqueues email jobs and reads them back", async () => {
    const job = await emailQueue.add("send", {
      to: "owner@example.test",
      template: "welcome",
      vars: { tenantName: "QueueCo" },
    });

    expect(job.id).toBeTruthy();
    const fetched = await emailQueue.getJob(job.id!);
    expect(fetched?.name).toBe("send");
    expect(fetched?.data.template).toBe("welcome");
  });

  it("enqueues low-stock scan and export-generation jobs and reads them back", async () => {
    const lowStockJob = await lowStockScanQueue.add("scan", {});
    const exportJob = await exportGenerationQueue.add("generate", {
      tenantId: "t-queue-1",
      exportJobId: "export-1",
    });

    expect((await lowStockScanQueue.getJob(lowStockJob.id!))?.data).toEqual({});
    expect((await exportGenerationQueue.getJob(exportJob.id!))?.data).toEqual({
      tenantId: "t-queue-1",
      exportJobId: "export-1",
    });
  });
});
