import { afterEach, describe, expect, it, vi } from "vitest";

const workerInstances = vi.hoisted(() => [] as Array<{
  name: string;
  processor: unknown;
  options: unknown;
  handlers: Record<string, Array<(...args: unknown[]) => unknown>>;
  close: ReturnType<typeof vi.fn>;
}>);

const lowStockAdd = vi.hoisted(() => vi.fn());

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

vi.mock("./queue/queues", () => ({
  QUEUE_NAMES: ["provisioning", "email", "low-stock-scan", "export-generation"],
  lowStockScanQueue: { add: lowStockAdd },
}));

afterEach(() => {
  workerInstances.length = 0;
  lowStockAdd.mockReset();
  vi.restoreAllMocks();
});

describe("worker entrypoint", () => {
  it("registers all worker queues with failed-job logging", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createWorkers } = await import("./worker");

    const workers = createWorkers();

    expect(workers).toHaveLength(4);
    expect(workerInstances.map((worker) => worker.name)).toEqual([
      "provisioning",
      "email",
      "low-stock-scan",
      "export-generation",
    ]);
    expect(workerInstances.every((worker) => worker.handlers.failed?.length === 1)).toBe(true);

    await workerInstances[2].handlers.failed[0](
      { id: "job-42", name: "scan", failedReason: "boom" },
      new Error("low stock failure"),
    );

    expect(consoleError).toHaveBeenCalledWith("worker job failed", {
      queueName: "low-stock-scan",
      jobId: "job-42",
      jobName: "scan",
      failedReason: "boom",
      error: "low stock failure",
    });
  });

  it("schedules repeatable low-stock scan with stable jobId", async () => {
    const { scheduleLowStockScan } = await import("./worker");

    await scheduleLowStockScan();

    expect(lowStockAdd).toHaveBeenCalledWith("scan", {}, {
      repeat: { pattern: "0 * * * *" },
      jobId: "low-stock-hourly",
    });
  });

  it("installs graceful shutdown handlers that close every worker", async () => {
    const once = vi.fn();
    const logger = vi.fn();
    const workers = [{ close: vi.fn().mockResolvedValue(undefined) }, { close: vi.fn().mockResolvedValue(undefined) }];
    const { installGracefulShutdown } = await import("./worker");

    installGracefulShutdown(workers, { once }, logger);

    expect(once).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(once).toHaveBeenCalledWith("SIGINT", expect.any(Function));

    const sigtermHandler = once.mock.calls.find(([signal]) => signal === "SIGTERM")?.[1];
    await sigtermHandler?.();

    expect(workers[0].close).toHaveBeenCalledOnce();
    expect(workers[1].close).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenCalledWith("worker received SIGTERM; shutting down gracefully");
    expect(logger).toHaveBeenCalledWith("worker shutdown complete");
  });
});
