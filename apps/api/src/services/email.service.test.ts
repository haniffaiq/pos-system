import { describe, expect, it, vi } from "vitest";

vi.mock("../queue/queues", () => ({
  emailQueue: {
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
  },
}));

import { emailQueue } from "../queue/queues";
import { sendMfaEmail } from "./email.service";

describe("email service", () => {
  it("queues MFA OTP email without putting the code in the job name or id", async () => {
    await sendMfaEmail("owner@example.test", "123456", "user-1");

    expect(emailQueue.add).toHaveBeenCalledWith(
      "mfa-otp",
      { to: "owner@example.test", template: "mfa_otp", vars: { code: "123456" } },
      expect.objectContaining({ jobId: expect.not.stringContaining("123456") }),
    );
  });

  it("uses a fresh queue job id for each OTP so retries are not dropped as duplicates", async () => {
    await sendMfaEmail("owner@example.test", "111111", "user-1");
    await sendMfaEmail("owner@example.test", "222222", "user-1");

    const firstOptions = vi.mocked(emailQueue.add).mock.calls[0]?.[2];
    const secondOptions = vi.mocked(emailQueue.add).mock.calls[1]?.[2];
    expect(firstOptions?.jobId).toEqual(expect.any(String));
    expect(secondOptions?.jobId).toEqual(expect.any(String));
    expect(firstOptions?.jobId).not.toBe(secondOptions?.jobId);
  });
});
