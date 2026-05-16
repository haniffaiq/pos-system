import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const release = vi.fn();
const connect = vi.fn();

vi.mock("./pool", () => ({
  tenantPool: { connect },
  adminPool: { connect: vi.fn() },
}));

const { withTenant } = await import("./withTenant");

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

describe("withTenant request context", () => {
  beforeEach(() => {
    query.mockReset();
    release.mockReset();
    connect.mockReset();
    connect.mockResolvedValue({ query, release });
    query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("sets app.current_user_id when a tenant transaction is user-scoped", async () => {
    await withTenant(tenantId, { userId }, async (q) => {
      await q("select current_setting('app.current_user_id')");
    });

    expect(query).toHaveBeenNthCalledWith(1, "begin");
    expect(query).toHaveBeenNthCalledWith(2, "select set_config('app.current_tenant_id', $1, true)", [tenantId]);
    expect(query).toHaveBeenNthCalledWith(3, "select set_config('app.current_user_id', $1, true)", [userId]);
    expect(query).toHaveBeenNthCalledWith(4, "select current_setting('app.current_user_id')", undefined);
    expect(query).toHaveBeenLastCalledWith("commit");
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not leak a user context into tenant-only transactions", async () => {
    await withTenant(tenantId, async (q) => {
      await q("select current_setting('app.current_user_id', true)");
    });

    expect(query).toHaveBeenCalledWith("select set_config('app.current_tenant_id', $1, true)", [tenantId]);
    expect(query).not.toHaveBeenCalledWith("select set_config('app.current_user_id', $1, true)", expect.anything());
  });

  it("rejects invalid user ids before opening a connection", async () => {
    await expect(withTenant(tenantId, { userId: "not-a-uuid" }, async () => undefined)).rejects.toThrow(
      "userId must be a valid UUID"
    );

    expect(connect).not.toHaveBeenCalled();
  });
});
