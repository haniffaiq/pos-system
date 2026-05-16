import { afterEach, describe, expect, it, vi } from "vitest";

const workerInstances = vi.hoisted(() => [] as Array<{
  name: string;
  processor: unknown;
  options: unknown;
  handlers: Record<string, Array<(...args: unknown[]) => unknown>>;
  close: ReturnType<typeof vi.fn>;
}>);

const lowStockAdd = vi.hoisted(() => vi.fn());
const reconcileInvoicesAdd = vi.hoisted(() => vi.fn());
const dunningAdd = vi.hoisted(() => vi.fn());
const purgeBlacklistAdd = vi.hoisted(() => vi.fn());
const logInfo = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());
const recordQueueJob = vi.hoisted(() => vi.fn());

vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation((name: string, processor: unknown, options: unknown) => {
    const instance = {
      name,
      processor,
      options,
      handlers: {} as Record<string, Array<(...args: unknown[]) => unknown>>,
      close: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        instance.handlers[event] ??= [];
        instance.handlers[event].push(handler);
        return instance;
      }),
    };
    workerInstances.push(instance);
    return instance;
  }),
}));

vi.mock("./lib/redis", () => ({
  redis: { status: "ready" },
}));

vi.mock("./lib/logger", () => ({
  logger: { info: logInfo, error: logError },
  toLogError: (error: unknown) => (error instanceof Error ? { name: error.name } : { name: typeof error }),
}));

vi.mock("./middleware/metrics", () => ({
  recordQueueJob,
}));

vi.mock("./queue/queues", () => ({
  QUEUE_NAMES: ["provisioning", "email", "low-stock-scan", "export-generation", "reconcile-invoices", "dunning", "purge-refresh-blacklist"],
  lowStockScanQueue: { add: lowStockAdd },
  reconcileInvoicesQueue: { add: reconcileInvoicesAdd },
  dunningQueue: { add: dunningAdd },
  purgeRefreshBlacklistQueue: { add: purgeBlacklistAdd },
}));

afterEach(() => {
  workerInstances.length = 0;
  lowStockAdd.mockReset();
  reconcileInvoicesAdd.mockReset();
  dunningAdd.mockReset();
  purgeBlacklistAdd.mockReset();
  logInfo.mockReset();
  logError.mockReset();
  recordQueueJob.mockReset();
  vi.restoreAllMocks();
});

describe("worker entrypoint", () => {
  it("registers all worker queues with failed-job logging", async () => {
    const { createWorkers } = await import("./worker");

    const workers = createWorkers();

    expect(workers).toHaveLength(7);
    expect(workerInstances.map((worker) => worker.name)).toEqual([
      "provisioning",
      "email",
      "low-stock-scan",
      "export-generation",
      "reconcile-invoices",
      "dunning",
      "purge-refresh-blacklist",
    ]);
    expect(workerInstances.every((worker) => worker.handlers.completed?.length === 1)).toBe(true);
    expect(workerInstances.every((worker) => worker.handlers.failed?.length === 1)).toBe(true);

    await workerInstances[1].handlers.completed[0]({ processedOn: 1_000, finishedOn: 1_250 });

    expect(recordQueueJob).toHaveBeenCalledWith("email", "completed", 250);

    await workerInstances[2].handlers.failed[0](
      { id: "job-42", name: "scan", failedReason: "boom", processedOn: 2_000, finishedOn: 2_100 },
      new Error("low stock failure"),
    );

    expect(recordQueueJob).toHaveBeenCalledWith("low-stock-scan", "failed", 100);
    expect(logError).toHaveBeenCalledWith({
      queueName: "low-stock-scan",
      jobId: "job-42",
      jobName: "scan",
      error: { name: "Error" },
    }, "worker job failed");
  });

  it("schedules repeatable low-stock scan with stable jobId", async () => {
    const { scheduleLowStockScan } = await import("./worker");

    await scheduleLowStockScan();

    expect(lowStockAdd).toHaveBeenCalledWith("scan", {}, {
      repeat: { pattern: "0 * * * *" },
      jobId: "low-stock-hourly",
    });
  });

  it("schedules repeatable billing jobs with stable job IDs", async () => {
    const { scheduleBillingJobs } = await import("./worker");

    await scheduleBillingJobs();

    expect(reconcileInvoicesAdd).toHaveBeenCalledWith("reconcile-invoices", {}, {
      repeat: { pattern: "*/15 * * * *" },
      jobId: "billing-reconcile-invoices",
    });
    expect(dunningAdd).toHaveBeenCalledWith("dunning", {}, {
      repeat: { pattern: "0 * * * *" },
      jobId: "billing-dunning-hourly",
    });
  });

  it("schedules daily refresh blacklist purge with a stable job ID", async () => {
    const { scheduleRefreshBlacklistPurge } = await import("./worker");

    await scheduleRefreshBlacklistPurge();

    expect(purgeBlacklistAdd).toHaveBeenCalledWith("purge-refresh-blacklist", {}, {
      repeat: { pattern: "0 3 * * *" },
      jobId: "refresh-blacklist-daily-purge",
    });
  });

  it("installs graceful shutdown handlers that close every worker", async () => {
    const once = vi.fn();
    const shutdownLogger = { info: vi.fn() };
    const workers = [{ close: vi.fn().mockResolvedValue(undefined) }, { close: vi.fn().mockResolvedValue(undefined) }];
    const { installGracefulShutdown } = await import("./worker");

    installGracefulShutdown(workers, { once }, shutdownLogger);

    expect(once).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(once).toHaveBeenCalledWith("SIGINT", expect.any(Function));

    const sigtermHandler = once.mock.calls.find(([signal]) => signal === "SIGTERM")?.[1];
    await sigtermHandler?.();

    expect(workers[0].close).toHaveBeenCalledOnce();
    expect(workers[1].close).toHaveBeenCalledOnce();
    expect(shutdownLogger.info).toHaveBeenCalledWith(
      { signal: "SIGTERM" },
      "worker received shutdown signal; shutting down gracefully",
    );
    expect(shutdownLogger.info).toHaveBeenCalledWith("worker shutdown complete");
  });
});
