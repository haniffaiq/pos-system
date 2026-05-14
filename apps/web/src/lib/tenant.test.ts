import { beforeEach, describe, expect, it, vi } from "vitest";
import { setSession } from "./auth";
import { fetchTenantContext } from "./tenant";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fetchTenantContext", () => {
  it("loads the tenant context for the active tenant session", async () => {
    setSession({ accessToken: "access-1", refreshToken: "refresh-1", role: "owner", tenantId: "tenant-123" });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ userId: "user-1", tenantId: "tenant-123", role: "owner", sector: "retail" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTenantContext()).resolves.toEqual({
      userId: "user-1",
      tenantId: "tenant-123",
      role: "owner",
      sector: "retail",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/t/tenant-123/me",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("rejects before calling the API when no tenant session exists", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTenantContext()).rejects.toThrow("no tenant session");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
