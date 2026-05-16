import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../messages/en.json";
import idMessages from "../../../messages/id.json";
import SignupPage from "./page";

function renderSignup(locale: "id" | "en" = "id") {
  render(<NextIntlClientProvider locale={locale} messages={locale === "id" ? idMessages : enMessages}><SignupPage /></NextIntlClientProvider>);
}

function fillSignup() {
  fireEvent.change(screen.getByLabelText("Email kerja"), { target: { value: "owner@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.change(screen.getByLabelText("Nama bisnis"), { target: { value: "Warung Maju" } });
  fireEvent.change(screen.getByLabelText("Slug tenant"), { target: { value: "warung-maju" } });
}

describe("SignupPage", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

  it("renders a localized signup form for the 14-day Pro trial", () => {
    renderSignup("en");
    expect(screen.getByRole("heading", { name: "Start your 14-day Pro trial" })).toBeTruthy();
    expect(screen.getByLabelText("Work email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByLabelText("Business name")).toBeTruthy();
    expect(screen.getByLabelText("Tenant slug")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
  });

  it("posts the signup payload to the API with cookie credentials and shows verification instructions", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    renderSignup("id");
    fillSignup();
    fireEvent.click(screen.getByRole("button", { name: "Buat akun" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/v1/signup", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.com", password: "password123", businessName: "Warung Maju", slug: "warung-maju" }),
    }));
    expect(await screen.findByText("Cek email kamu untuk link verifikasi.")).toBeTruthy();
  });

  it("shows the API error message without clearing user input", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Slug sudah dipakai" } }), { status: 409 }));
    renderSignup("id");
    fillSignup();
    fireEvent.click(screen.getByRole("button", { name: "Buat akun" }));

    expect(await screen.findByText("Slug sudah dipakai")).toBeTruthy();
    expect(screen.getByLabelText("Slug tenant")).toHaveProperty("value", "warung-maju");
  });
});
