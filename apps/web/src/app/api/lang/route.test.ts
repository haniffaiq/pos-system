import { describe, expect, it } from "vitest";
import { POST } from "./route";

function request(locale: unknown) {
  return new Request("http://localhost/api/lang", {
    method: "POST",
    body: JSON.stringify({ locale }),
  });
}

describe("POST /api/lang", () => {
  it("persists supported locales in the lang cookie", async () => {
    const response = await POST(request("en"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain("lang=en");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=31536000");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });

  it("rejects unsupported locales without setting a cookie", async () => {
    const response = await POST(request("fr"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_locale" });
    expect(response.headers.get("set-cookie")).toBeNull();
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
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
