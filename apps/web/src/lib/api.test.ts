import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSession, getSession, setSession } from "./auth";
import { ApiError, apiFetch } from "./api";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("session storage helpers", () => {
  it("stores, reads, and clears the browser session", () => {
    setSession({ accessToken: "access-1", refreshToken: "refresh-1", role: "admin", tenantId: null });

    expect(getSession()).toEqual({ role: "admin", tenantId: null });
    expect(localStorage.getItem("owa.session")).toBeNull();

    clearSession();
    expect(getSession()).toBeNull();
  });
});

describe("apiFetch", () => {
  it("returns parsed JSON on success and prefixes API paths", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const data = await apiFetch<{ ok: boolean }>("/health");

    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/health",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("throws ApiError carrying the uniform error shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: "not_found", message: "Nope", details: { id: 1 } } }), {
          status: 404,
        }),
      ),
    );

    await expect(apiFetch("/missing")).rejects.toMatchObject({
      code: "not_found",
      message: "Nope",
      status: 404,
      details: { id: 1 },
    });
    await expect(apiFetch("/missing")).rejects.toBeInstanceOf(ApiError);
  });

  it("uses HTTP-only cookie credentials and retries once after refreshing a 401", async () => {
    setSession({ accessToken: "old-access", refreshToken: "refresh-1", role: "cashier", tenantId: "tenant-1" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "unauthorized", message: "Expired" } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const data = await apiFetch<{ ok: boolean }>("/sales");

    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("authorization")).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:4000/api/v1/auth/refresh");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect((fetchMock.mock.calls[2][1].headers as Headers).get("authorization")).toBeNull();
    expect(getSession()).toEqual({ role: "cashier", tenantId: "tenant-1" });
  });

  it("clears the session when refresh fails", async () => {
    setSession({ accessToken: "old-access", refreshToken: "bad-refresh", role: "admin", tenantId: null });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "unauthorized", message: "Expired" } }), { status: 401 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "unauthorized", message: "Bad refresh" } }), { status: 401 })),
    );

    await expect(apiFetch("/sales")).rejects.toMatchObject({ code: "unauthorized", message: "Expired" });
    expect(getSession()).toBeNull();
  });
});
