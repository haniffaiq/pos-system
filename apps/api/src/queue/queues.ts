import { Queue, type JobsOptions } from "bullmq";

import { redis } from "../lib/redis";

export const QUEUE_NAMES = ["provisioning", "email", "low-stock-scan", "export-generation"] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export interface ProvisioningJob {
  tenantId: string;
}

export interface EmailJob {
  to: string;
  template: "welcome" | "invite" | "password_reset" | "signup_verify" | "mfa_otp";
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

const redisBackedQueuesDisabled = process.env.NODE_ENV === "test" && !process.env.REDIS_URL;

function disabledQueue<T>(name: QueueName): Queue<T> {
  const fail = async (): Promise<never> => {
    throw new Error(`REDIS_URL is required to use the ${name} queue in tests`);
  };

  return {
    name,
    jobsOpts: DEFAULT_JOB_OPTIONS,
    add: fail,
    getJob: fail,
    drain: async () => undefined,
    close: async () => undefined,
  } as unknown as Queue<T>;
}

function createQueue<T>(name: QueueName): Queue<T> {
  return redisBackedQueuesDisabled ? disabledQueue<T>(name) : new Queue<T>(name, queueOptions);
}

export const provisioningQueue = createQueue<ProvisioningJob>("provisioning");
export const emailQueue = createQueue<EmailJob>("email");
export const lowStockScanQueue = createQueue<LowStockScanJob>("low-stock-scan");
export const exportGenerationQueue = createQueue<ExportGenerationJob>("export-generation");

export const queues = [provisioningQueue, emailQueue, lowStockScanQueue, exportGenerationQueue] as const;
