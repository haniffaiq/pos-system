import { beforeEach, describe, expect, it, vi } from "vitest";
import { setSession } from "./auth";
import { fetchTenantContext, tenantContextKey, tenantQueryKey } from "./tenant";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fetchTenantContext", () => {
  it("loads the tenant context for the active tenant session and matching URL slug", async () => {
    setSession({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      role: "owner",
      tenantId: "tenant-123",
      tenantSlug: "warung-maju",
    });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ userId: "user-1", tenantId: "tenant-123", role: "owner", sector: "retail" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTenantContext("warung-maju")).resolves.toEqual({
      userId: "user-1",
      tenantId: "tenant-123",
      tenantSlug: "warung-maju",
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

  it("rejects before calling the API when the URL slug does not match the session tenant", async () => {
    setSession({ role: "owner", tenantId: "tenant-123", tenantSlug: "warung-maju" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTenantContext("kopi-pagi")).rejects.toThrow("tenant slug mismatch");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("tenant query keys", () => {
  it("scopes tenant context keys by URL slug", () => {
    expect(tenantContextKey("warung-maju")).toEqual(["tenant-ctx", "warung-maju"]);
  });

  it("scopes tenant data keys by authenticated tenant identity", () => {
    expect(tenantQueryKey("tenant-123", "grosir-products", "active")).toEqual([
      "tenant",
      "tenant-123",
      "grosir-products",
      "active",
    ]);
  });
});
