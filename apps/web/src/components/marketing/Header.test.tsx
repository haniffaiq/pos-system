import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";
import id from "../../../messages/id.json";
import en from "../../../messages/en.json";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("Header", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    refresh.mockClear();
  });

  it("renders the BroSolution brand, marketing nav, CTA, and language toggle in Indonesian", () => {
    render(
      <NextIntlClientProvider locale="id" messages={id}>
        <Header locale="id" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("BroSolution")).toBeTruthy();
    expect(screen.getByText("Fitur")).toBeTruthy();
    expect(screen.getByText("Harga")).toBeTruthy();
    expect(screen.getByText("FAQ")).toBeTruthy();
    expect(screen.getByText("Coba Gratis 14 Hari")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ID" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "EN" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("uses English i18n strings when the English catalog is active", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Header locale="en" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Features")).toBeTruthy();
    expect(screen.getByText("Pricing")).toBeTruthy();
    expect(screen.getByText("Start 14-Day Free Trial")).toBeTruthy();
    expect(screen.getByRole("button", { name: "EN" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens the login dropdown with admin and tenant destinations", () => {
    render(
      <NextIntlClientProvider locale="id" messages={id}>
        <Header locale="id" />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Login/ }));

    expect(screen.getByRole("menuitem", { name: "Admin" }).getAttribute("href")).toBe("/admin/login");
    expect(screen.getByRole("menuitem", { name: "Cari Tenant" }).getAttribute("href")).toBe("/find-tenant");
  });
});
