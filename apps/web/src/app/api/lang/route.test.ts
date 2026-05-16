import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const setCookie = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => ({ set: setCookie }),
}));

function request(locale: unknown) {
  return new Request("http://localhost/api/lang", {
    method: "POST",
    body: JSON.stringify({ locale }),
  });
}

describe("POST /api/lang", () => {
  beforeEach(() => {
    setCookie.mockReset();
  });

  it("persists supported locales in the lang cookie", async () => {
    const response = await POST(request("en"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(setCookie).toHaveBeenCalledWith("lang", "en", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  });

  it("rejects unsupported locales without setting a cookie", async () => {
    const response = await POST(request("fr"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_locale" });
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without setting a cookie", async () => {
    const response = await POST(
      new Request("http://localhost/api/lang", {
        method: "POST",
        body: "not-json",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_locale" });
    expect(setCookie).not.toHaveBeenCalled();
  });
});
