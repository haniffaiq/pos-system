import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout, { metadata } from "./layout";

vi.mock("next-intl/server", () => ({ getLocale: async () => "id", getMessages: async () => ({ brand: "BroSolution" }) }));
vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children, locale }: { children: React.ReactNode; locale: string }) => <section data-locale={locale}>{children}</section>,
}));

describe("RootLayout i18n wiring", () => {
  it("uses BroSolution marketing metadata instead of the old app placeholder", () => {
    expect(metadata).toMatchObject({
      title: "BroSolution — Operational Grosir",
      description: "POS, inventory, and reports for Indonesian wholesale teams.",
    });
    expect(metadata.title).not.toBe("Operational Web App");
  });

  it("uses the resolved next-intl locale for the document shell", async () => {
    const html = renderToStaticMarkup(await RootLayout({ children: <main>Dashboard</main> }));
    expect(html).toContain('<html lang="id">');
    expect(html).toContain('data-locale="id"');
  });
});
