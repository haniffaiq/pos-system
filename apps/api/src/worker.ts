import { Worker, type Job, type Processor, type WorkerOptions } from "bullmq";

import { redis } from "./lib/redis";
import { logger, toLogError } from "./lib/logger";
import { recordQueueJob } from "./middleware/metrics";
import { emailProcessor } from "./queue/jobs/email";
import { exportProcessor } from "./queue/jobs/exportGeneration";
import { lowStockProcessor } from "./queue/jobs/lowStockScan";
import { provisioningProcessor } from "./queue/jobs/provisioning";
import { purgeBlacklistProcessor } from "./queue/jobs/purgeBlacklist";
import { reconcileInvoicesProcessor } from "./queue/jobs/reconcile-invoices";
import { dunningProcessor } from "./queue/jobs/dunning";
import {
  type DunningJob,
  type EmailJob,
  type ExportGenerationJob,
  type LowStockScanJob,
  type ProvisioningJob,
  type PurgeRefreshBlacklistJob,
  type ReconcileInvoicesJob,
  QUEUE_NAMES,
  dunningQueue,
  lowStockScanQueue,
  purgeRefreshBlacklistQueue,
  reconcileInvoicesQueue,
} from "./queue/queues";

export const WORKER_QUEUE_NAMES = QUEUE_NAMES;

const workerOptions: WorkerOptions = {
  connection: redis,
  prefix: process.env.BULLMQ_QUEUE_PREFIX,
};

const exportGenerationProcessor: Processor<ExportGenerationJob> = exportProcessor;

function jobDurationMs(job: Job | undefined): number {
  if (!job?.processedOn) {
    return 0;
  }

  return Math.max(0, (job.finishedOn ?? Date.now()) - job.processedOn);
}

function logFailedJob(queueName: string, job: Job | undefined, error: Error): void {
  logger.error({
    queueName,
    jobId: job?.id,
    jobName: job?.name,
    error: toLogError(error),
  }, "worker job failed");
}

function createWorker<JobData>(queueName: string, processor: Processor<JobData>): Worker<JobData> {
  const worker = new Worker<JobData>(queueName, processor, workerOptions);
  worker.on("completed", (job) => recordQueueJob(queueName, "completed", jobDurationMs(job)));
  worker.on("failed", (job, error) => {
    recordQueueJob(queueName, "failed", jobDurationMs(job));
    logFailedJob(queueName, job, error);
  });
  return worker;
}

export function createWorkers(): Worker[] {
  return [
    createWorker<ProvisioningJob>("provisioning", provisioningProcessor),
    createWorker<EmailJob>("email", emailProcessor),
    createWorker<LowStockScanJob>("low-stock-scan", lowStockProcessor),
    createWorker<ExportGenerationJob>("export-generation", exportGenerationProcessor),
    createWorker<ReconcileInvoicesJob>("reconcile-invoices", reconcileInvoicesProcessor),
    createWorker<DunningJob>("dunning", dunningProcessor),
    createWorker<PurgeRefreshBlacklistJob>("purge-refresh-blacklist", purgeBlacklistProcessor),
  ];
}

export async function scheduleLowStockScan(): Promise<void> {
  await lowStockScanQueue.add("scan", {}, { repeat: { pattern: "0 * * * *" }, jobId: "low-stock-hourly" });
}

export async function scheduleBillingJobs(): Promise<void> {
  await reconcileInvoicesQueue.add("reconcile-invoices", {}, { repeat: { pattern: "*/15 * * * *" }, jobId: "billing-reconcile-invoices" });
  await dunningQueue.add("dunning", {}, { repeat: { pattern: "0 * * * *" }, jobId: "billing-dunning-hourly" });
}

export async function scheduleRefreshBlacklistPurge(): Promise<void> {
  await purgeRefreshBlacklistQueue.add("purge-refresh-blacklist", {}, {
    repeat: { pattern: "0 3 * * *" },
    jobId: "refresh-blacklist-daily-purge",
  });
}

type ShutdownSignal = "SIGTERM" | "SIGINT";
type ShutdownSignalTarget = {
  once: (signal: ShutdownSignal, listener: () => void | Promise<void>) => unknown;
};

type ClosableWorker = Pick<Worker, "close">;
type ShutdownLogger = Pick<typeof logger, "info">;

export function installGracefulShutdown(
  workers: ClosableWorker[],
  signalTarget: ShutdownSignalTarget = process,
  shutdownLogger: ShutdownLogger = logger,
): void {
  const closeWorkers = async (signal: ShutdownSignal): Promise<void> => {
    shutdownLogger.info({ signal }, "worker received shutdown signal; shutting down gracefully");
    await Promise.all(workers.map((worker) => worker.close()));
    shutdownLogger.info("worker shutdown complete");
  };

  signalTarget.once("SIGTERM", () => closeWorkers("SIGTERM"));
  signalTarget.once("SIGINT", () => closeWorkers("SIGINT"));
}

export async function startWorker(): Promise<Worker[]> {
  const workers = createWorkers();
  installGracefulShutdown(workers);
  await scheduleLowStockScan();
  await scheduleBillingJobs();
  await scheduleRefreshBlacklistPurge();
  return workers;
}

const entrypoint = process.argv[1];
const isWorkerEntrypoint = entrypoint?.endsWith("/worker.ts") || entrypoint?.endsWith("/worker.js");

if (process.env.NODE_ENV !== "test" && isWorkerEntrypoint) {
  void startWorker()
    .then(() => {
      logger.info({ queues: WORKER_QUEUE_NAMES }, "worker started");
    })
    .catch((error: unknown) => {
      logger.error({ error: toLogError(error) }, "worker failed to start");
      process.exitCode = 1;
    });
}
