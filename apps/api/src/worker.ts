import { Worker, type Job, type Processor, type WorkerOptions } from "bullmq";

import { redis } from "./lib/redis";
import { emailProcessor } from "./queue/jobs/email";
import {
  type EmailJob,
  type ExportGenerationJob,
  type LowStockScanJob,
  type ProvisioningJob,
  QUEUE_NAMES,
  lowStockScanQueue,
} from "./queue/queues";

export const WORKER_QUEUE_NAMES = QUEUE_NAMES;

const workerOptions: WorkerOptions = {
  connection: redis,
  prefix: process.env.BULLMQ_QUEUE_PREFIX,
};

const provisioningProcessor: Processor<ProvisioningJob> = async () => {
  // Task 18 wires tenant provisioning behavior.
};

const lowStockScanProcessor: Processor<LowStockScanJob> = async () => {
  // Phase 2 wires low-stock notification generation.
};

const exportGenerationProcessor: Processor<ExportGenerationJob> = async () => {
  // Phase 2 wires report CSV generation.
};

function logFailedJob(queueName: string, job: Job | undefined, error: Error): void {
  console.error("worker job failed", {
    queueName,
    jobId: job?.id,
    jobName: job?.name,
    failedReason: job?.failedReason,
    error: error.message,
  });
}

function createWorker<JobData>(queueName: string, processor: Processor<JobData>): Worker<JobData> {
  const worker = new Worker<JobData>(queueName, processor, workerOptions);
  worker.on("failed", (job, error) => logFailedJob(queueName, job, error));
  return worker;
}

export function createWorkers(): Worker[] {
  return [
    createWorker<ProvisioningJob>("provisioning", provisioningProcessor),
    createWorker<EmailJob>("email", emailProcessor),
    createWorker<LowStockScanJob>("low-stock-scan", lowStockScanProcessor),
    createWorker<ExportGenerationJob>("export-generation", exportGenerationProcessor),
  ];
}

export async function scheduleLowStockScan(): Promise<void> {
  await lowStockScanQueue.add("scan", {}, { repeat: { pattern: "0 * * * *" }, jobId: "low-stock-hourly" });
}

type ShutdownSignal = "SIGTERM" | "SIGINT";
type ShutdownSignalTarget = {
  once: (signal: ShutdownSignal, listener: () => void | Promise<void>) => unknown;
};

type ClosableWorker = Pick<Worker, "close">;

export function installGracefulShutdown(
  workers: ClosableWorker[],
  signalTarget: ShutdownSignalTarget = process,
  logger: (message: string) => void = console.log,
): void {
  const closeWorkers = async (signal: ShutdownSignal): Promise<void> => {
    logger(`worker received ${signal}; shutting down gracefully`);
    await Promise.all(workers.map((worker) => worker.close()));
    logger("worker shutdown complete");
  };

  signalTarget.once("SIGTERM", () => closeWorkers("SIGTERM"));
  signalTarget.once("SIGINT", () => closeWorkers("SIGINT"));
}

export async function startWorker(): Promise<Worker[]> {
  const workers = createWorkers();
  installGracefulShutdown(workers);
  await scheduleLowStockScan();
  return workers;
}

const entrypoint = process.argv[1];
const isWorkerEntrypoint = entrypoint?.endsWith("/worker.ts") || entrypoint?.endsWith("/worker.js");

if (process.env.NODE_ENV !== "test" && isWorkerEntrypoint) {
  void startWorker()
    .then(() => {
      console.log("worker started: provisioning, email, low-stock-scan, export-generation");
    })
    .catch((error: unknown) => {
      console.error("worker failed to start", error);
      process.exitCode = 1;
    });
}
