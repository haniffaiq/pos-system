import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../messages/en.json";
import idMessages from "../../../messages/id.json";
import VerifyPage from "./page";

const push = vi.fn();
let token: string | null = "signup-token";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: (key: string) => (key === "token" ? token : null) }),
}));

function renderVerify(locale: "id" | "en" = "id") {
  render(<NextIntlClientProvider locale={locale} messages={locale === "id" ? idMessages : enMessages}><VerifyPage /></NextIntlClientProvider>);
}

describe("VerifyPage", () => {
  beforeEach(() => { token = "signup-token"; push.mockReset(); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

  it("renders a localized verifying state", () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ slug: "warung-maju" }), { status: 200 }));
    renderVerify("en");
    expect(screen.getByRole("heading", { name: "Verifying your account…" })).toBeTruthy();
  });

  it("posts the token using cookie credentials and redirects to tenant login after success", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ slug: "warung-maju" }), { status: 200 }));
    renderVerify("id");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/v1/signup/verify", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "signup-token" }),
    }));
    expect(await screen.findByText("Berhasil! Mengarahkan ke login tenant…")).toBeTruthy();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/t/warung-maju/login"));
  });

  it("shows a localized missing-token error and skips the API", async () => {
    token = null;
    const fetchMock = vi.mocked(fetch);
    renderVerify("id");
    expect(await screen.findByText("Token verifikasi tidak ada.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the API verification error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Token sudah kedaluwarsa" } }), { status: 400 }));
    renderVerify("id");
    expect(await screen.findByText("Token sudah kedaluwarsa")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
