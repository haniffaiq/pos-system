import { Queue, type JobsOptions } from "bullmq";

import { redis } from "../lib/redis";

export const QUEUE_NAMES = ["provisioning", "email", "low-stock-scan", "export-generation"] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export interface ProvisioningJob {
  tenantId: string;
}

export interface EmailJob {
  to: string;
  template: "welcome" | "invite" | "password_reset";
  vars: Record<string, string>;
}

export type LowStockScanJob = Record<string, never>;

export interface ExportGenerationJob {
  tenantId: string;
  exportJobId: string;
}

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1_000,
  },
  removeOnComplete: {
    age: 86_400,
    count: 1_000,
  },
  removeOnFail: {
    age: 604_800,
    count: 5_000,
  },
};

const queueOptions = {
  connection: redis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
  prefix: process.env.BULLMQ_QUEUE_PREFIX,
};

export const provisioningQueue = new Queue<ProvisioningJob>("provisioning", queueOptions);
export const emailQueue = new Queue<EmailJob>("email", queueOptions);
export const lowStockScanQueue = new Queue<LowStockScanJob>("low-stock-scan", queueOptions);
export const exportGenerationQueue = new Queue<ExportGenerationJob>("export-generation", queueOptions);

export const queues = [provisioningQueue, emailQueue, lowStockScanQueue, exportGenerationQueue] as const;
