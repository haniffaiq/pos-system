import { beforeEach, describe, expect, it, vi } from "vitest";

const withAdmin = vi.hoisted(() => vi.fn());

vi.mock("../../db/withTenant", () => ({
  withAdmin,
}));

import { purgeExpiredRefreshTokenBlacklist } from "./purgeBlacklist";

describe("purge refresh-token blacklist job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes only expired blacklist rows", async () => {
    const q = vi.fn().mockResolvedValue({ rowCount: 2, rows: [] });
    withAdmin.mockImplementationOnce((fn: (query: typeof q) => Promise<unknown>) => fn(q));

    await purgeExpiredRefreshTokenBlacklist();

    expect(q).toHaveBeenCalledWith("delete from refresh_token_blacklist where expires_at < now()");
  });
});
