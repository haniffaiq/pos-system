import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import id from "../../../messages/id.json";
import { Hero } from "./Hero";

function renderHero(locale: "id" | "en") {
  const messages = locale === "id" ? id : en;

  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Hero />
    </NextIntlClientProvider>,
  );
}

describe("Hero", () => {
  afterEach(() => cleanup());

  it("renders Indonesian hero copy with signup and demo CTAs", () => {
    renderHero("id");

    expect(screen.getByRole("heading", { level: 1, name: "Kelola Grosirmu Lebih Cepat" })).toBeTruthy();
    expect(screen.getByText("POS, stok, dan laporan dalam satu platform. Dirancang untuk grosir Indonesia.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Coba Gratis 14 Hari" }).getAttribute("href")).toBe("/signup");
    expect(screen.getByRole("link", { name: "Lihat Demo" }).getAttribute("href")).toBe("#screenshot");
  });

  it("renders English hero copy from the message catalog", () => {
    renderHero("en");

    expect(screen.getByRole("heading", { level: 1, name: "Run Your Wholesale Faster" })).toBeTruthy();
    expect(screen.getByText("POS, inventory, and reports in one platform. Built for Indonesian wholesale.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start 14-Day Free Trial" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "See Demo" })).toBeTruthy();
  });

  it("uses neobrutalist card styling for the dashboard preview", () => {
    renderHero("id");

    const preview = screen.getByLabelText("Operational Grosir dashboard preview");
    expect(preview.className).toContain("border-2");
    expect(preview.className).toContain("shadow-brutal");
  });
});
