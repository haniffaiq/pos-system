import { Worker, type Processor, type WorkerOptions } from "bullmq";

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

export function createWorkers(): Worker[] {
  return [
    new Worker<ProvisioningJob>("provisioning", provisioningProcessor, workerOptions),
    new Worker<EmailJob>("email", emailProcessor, workerOptions),
    new Worker<LowStockScanJob>("low-stock-scan", lowStockScanProcessor, workerOptions),
    new Worker<ExportGenerationJob>("export-generation", exportGenerationProcessor, workerOptions),
  ];
}

export async function scheduleLowStockScan(): Promise<void> {
  await lowStockScanQueue.add("scan", {}, { repeat: { pattern: "0 * * * *" }, jobId: "low-stock-hourly" });
}

export async function startWorker(): Promise<Worker[]> {
  const workers = createWorkers();
  await scheduleLowStockScan();
  return workers;
}

const entrypoint = process.argv[1];
const isWorkerEntrypoint = entrypoint?.endsWith("/worker.ts") || entrypoint?.endsWith("/worker.js");

if (process.env.NODE_ENV !== "test" && isWorkerEntrypoint) {
  void startWorker().then(() => {
    console.log("worker started: provisioning, email, low-stock-scan, export-generation");
  });
}
