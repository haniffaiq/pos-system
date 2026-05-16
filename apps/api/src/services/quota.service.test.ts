import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const redisGet = vi.fn();
const redisSet = vi.fn();
const redisDel = vi.fn();

vi.mock("../db/pool", () => ({
  adminPool: { query },
}));

vi.mock("../lib/redis", () => ({
  redis: {
    get: redisGet,
    set: redisSet,
    del: redisDel,
  },
}));

const {
  countResource,
  currentMonthlyUsage,
  incrementUsage,
  invalidatePlanCache,
  isOverQuota,
  loadPlanForTenant,
} = await import("./quota.service");

describe("isOverQuota", () => {
  it("unlimited (-1) never over", () => {
    expect(isOverQuota(-1, 999999)).toBe(false);
  });

  it("under limit", () => {
    expect(isOverQuota(100, 50)).toBe(false);
  });

  it("at limit", () => {
    expect(isOverQuota(100, 100)).toBe(true);
  });

  it("over limit", () => {
    expect(isOverQuota(100, 101)).toBe(true);
  });
});

describe("quota plan cache", () => {
  beforeEach(() => {
    vi.useRealTimers();
    query.mockReset();
    redisGet.mockReset();
    redisSet.mockReset();
    redisDel.mockReset();
  });

  it("returns cached plan data without querying Postgres", async () => {
    const cached = { status: "active", quota: { users: 10 } };
    redisGet.mockResolvedValue(JSON.stringify(cached));

    await expect(loadPlanForTenant("tenant-1")).resolves.toEqual(cached);

    expect(redisGet).toHaveBeenCalledWith("sub:plan:tenant-1");
    expect(query).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
  });

  it("loads the newest tenant entitlement plan from Postgres and caches for 60 seconds", async () => {
    redisGet.mockResolvedValue(null);
    query.mockResolvedValue({ rows: [{ status: "trialing", quota: { skus: 100 } }] });

    await expect(loadPlanForTenant("tenant-2")).resolves.toEqual({ status: "trialing", quota: { skus: 100 } });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("s.status in ('trialing', 'active', 'past_due')"),
      ["tenant-2"],
    );
    expect(redisSet).toHaveBeenCalledWith(
      "sub:plan:tenant-2",
      JSON.stringify({ status: "trialing", quota: { skus: 100 } }),
      "EX",
      60,
    );
  });

  it("evicts malformed cached plan data and falls back to Postgres", async () => {
    redisGet.mockResolvedValue("{not-json");
    query.mockResolvedValue({ rows: [{ status: "active", quota: { users: 25 } }] });

    await expect(loadPlanForTenant("tenant-bad-cache")).resolves.toEqual({ status: "active", quota: { users: 25 } });

    expect(redisDel).toHaveBeenCalledWith("sub:plan:tenant-bad-cache");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("from subscriptions s"), ["tenant-bad-cache"]);
    expect(redisSet).toHaveBeenCalledWith(
      "sub:plan:tenant-bad-cache",
      JSON.stringify({ status: "active", quota: { users: 25 } }),
      "EX",
      60,
    );
  });

  it("returns null and does not cache when a tenant has no subscription", async () => {
    redisGet.mockResolvedValue(null);
    query.mockResolvedValue({ rows: [] });

    await expect(loadPlanForTenant("tenant-3")).resolves.toBeNull();

    expect(redisSet).not.toHaveBeenCalled();
  });

  it("invalidates cached plan data for a tenant", async () => {
    redisDel.mockResolvedValue(1);

    await invalidatePlanCache("tenant-4");

    expect(redisDel).toHaveBeenCalledWith("sub:plan:tenant-4");
  });
});

describe("usage helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T12:34:56Z"));
    query.mockReset();
  });

  it("reads current usage for the current UTC month", async () => {
    query.mockResolvedValue({ rows: [{ value: "7" }] });

    await expect(currentMonthlyUsage("tenant-5", "tx_count")).resolves.toBe(7);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("from usage_counters"),
      ["tenant-5", "2026-05-01", "tx_count"],
    );
  });

  it("defaults missing current usage to zero", async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(currentMonthlyUsage("tenant-6", "export_count")).resolves.toBe(0);
  });

  it("increments usage for the current UTC month with an upsert", async () => {
    query.mockResolvedValue({ rows: [] });

    await incrementUsage("tenant-7", "tx_count");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("on conflict (tenant_id, period_start, metric) do update"),
      ["tenant-7", "2026-05-01", "tx_count"],
    );
  });

  it("counts tenant resources only for allow-listed tables", async () => {
    query.mockResolvedValue({ rows: [{ c: 42 }] });

    await expect(countResource("tenant-8", "products")).resolves.toBe(42);

    expect(query).toHaveBeenCalledWith("select count(*)::int as c from products where tenant_id = $1", ["tenant-8"]);
  });

  it("rejects unexpected resource table names", async () => {
    await expect(countResource("tenant-9", "invoices; drop table users;--")).rejects.toThrow("invalid table");

    expect(query).not.toHaveBeenCalled();
  });
});
