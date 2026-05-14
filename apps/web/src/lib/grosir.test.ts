import { beforeEach, describe, expect, it, vi } from "vitest";
import { setSession } from "./auth";
import { grosirApi } from "./grosir";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("grosirApi", () => {
  it("calls the tenant module API path using the active tenant session", async () => {
    setSession({ accessToken: "access-1", refreshToken: "refresh-1", role: "manager", tenantId: "tenant-1" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(grosirApi<{ ok: boolean }>("/products", { method: "GET" })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/t/tenant-1/m/products",
      expect.objectContaining({ method: "GET", headers: expect.any(Headers) }),
    );
  });

  it("throws without a tenant session", () => {
    setSession({ accessToken: "access-1", refreshToken: "refresh-1", role: "admin", tenantId: null });

    expect(() => grosirApi("/products")).toThrow("no tenant session");
  });
});
