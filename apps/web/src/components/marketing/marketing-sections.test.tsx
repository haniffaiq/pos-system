import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import id from "../../../messages/id.json";
import { FAQ } from "./FAQ";
import { Footer } from "./Footer";
import { Pricing } from "./Pricing";
import { Screenshot } from "./Screenshot";

function renderWithMessages(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="id" messages={id}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("marketing lower landing sections", () => {
  it("renders the screenshot section with a non-billing app preview", () => {
    renderWithMessages(<Screenshot />);

    expect(screen.getByRole("heading", { name: "Antarmuka yang Familiar" })).toBeTruthy();
    expect(screen.getByText("[App screenshot]")).toBeTruthy();
    expect(screen.getByText(/Kasirmu langsung produktif/)).toBeTruthy();
  });

  it("renders Free, Pro, and Business pricing from the approved plan tiers", () => {
    renderWithMessages(<Pricing />);

    expect(screen.getByRole("heading", { name: "Harga Sederhana" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Free" })).toBeTruthy();
    expect(screen.getByText("Rp 0")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pro" })).toBeTruthy();
    expect(screen.getByText("Rp 299.000")).toBeTruthy();
    expect(screen.getByText("Paling Populer")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Business" })).toBeTruthy();
    expect(screen.getByText("Rp 999.000")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Mulai Sekarang" })).toHaveLength(3);
  });

  it("keeps payment FAQ PSP-neutral until the P5 checkout flow lands", () => {
    renderWithMessages(<FAQ />);

    fireEvent.click(screen.getByRole("button", { name: /Bagaimana cara bayar/ }));

    expect(screen.getByText(/Midtrans dan Xendit/)).toBeTruthy();
    expect(screen.getByText(/checkout aktif menyusul di fase billing/)).toBeTruthy();
  });

  it("renders footer CTA, legal/resource columns, and login links", () => {
    renderWithMessages(<Footer />);

    expect(screen.getByRole("heading", { name: "Operasional grosir, tanpa ribet." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Coba Gratis 14 Hari" }).getAttribute("href")).toBe("/signup");
    expect(screen.getByText("Produk")).toBeTruthy();
    expect(screen.getByText("Sumber Daya")).toBeTruthy();
    expect(screen.getByText("Legal")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Admin" }).getAttribute("href")).toBe("/admin/login");
    expect(screen.getByRole("link", { name: "Cari Tenant" }).getAttribute("href")).toBe("/find-tenant");
  });
});
