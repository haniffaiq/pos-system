import { randomUUID } from "node:crypto";

import { emailQueue } from "../queue/queues";

export async function sendMfaEmail(to: string, code: string, userId: string): Promise<void> {
  await emailQueue.add(
    "mfa-otp",
    { to, template: "mfa_otp", vars: { code } },
    { jobId: `mfa-otp:${userId}:${randomUUID()}` },
  );
}
