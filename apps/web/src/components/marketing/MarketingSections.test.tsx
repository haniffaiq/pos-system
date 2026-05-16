import React from "react";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import id from "../../../messages/id.json";
import { Features } from "./Features";
import { SocialProof } from "./SocialProof";

function renderWithMessages(ui: React.ReactElement, locale: "id" | "en" = "id") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "id" ? id : en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("marketing SocialProof", () => {
  it("renders the localized Indonesian social proof bar and placeholder logos", () => {
    renderWithMessages(<SocialProof />);

    expect(screen.getByRole("heading", { name: "Dipakai oleh UMKM se-Indonesia" })).toBeTruthy();
    expect(screen.getByText("Toko Sumber Rejeki")).toBeTruthy();
    expect(screen.getByText("Grosir Makmur")).toBeTruthy();
    expect(screen.getByText("CV Maju Jaya")).toBeTruthy();
  });

  it("uses the English social proof copy when the locale changes", () => {
    renderWithMessages(<SocialProof />, "en");

    expect(screen.getByRole("heading", { name: "Trusted by SMBs across Indonesia" })).toBeTruthy();
  });
});

describe("marketing Features", () => {
  it("renders all six localized feature cards", () => {
    renderWithMessages(<Features />);

    expect(screen.getByRole("heading", { name: "Fitur Lengkap" })).toBeTruthy();
    const features = screen.getByRole("region", { name: "Fitur Lengkap" });
    expect(within(features).getByRole("heading", { name: "POS Multi-Outlet" })).toBeTruthy();
    expect(within(features).getByRole("heading", { name: "Manajemen Stok" })).toBeTruthy();
    expect(within(features).getByRole("heading", { name: "Laporan Real-Time" })).toBeTruthy();
    expect(within(features).getByRole("heading", { name: "Multi-User & Peran" })).toBeTruthy();
    expect(within(features).getByRole("heading", { name: "Audit Trail" })).toBeTruthy();
    expect(within(features).getByRole("heading", { name: "Export Excel/CSV" })).toBeTruthy();
  });

  it("renders the English feature catalog", () => {
    renderWithMessages(<Features />, "en");

    expect(screen.getByRole("heading", { name: "Complete Features" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Inventory Management" })).toBeTruthy();
    expect(screen.getByText("Real-time in/out tracking.")).toBeTruthy();
  });
});
