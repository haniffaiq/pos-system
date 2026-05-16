import React from "react";
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe, { type RunOptions } from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import idMessages from "../../messages/id.json";
import Home from "../app/page";
import AdminLoginPage from "../app/(auth)/admin/login/page";
import TenantLoginPage from "../app/(auth)/t/[slug]/login/page";
import { ProductForm } from "../components/grosir/ProductForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const axeOptions: RunOptions = {
  rules: {
    // jsdom lacks canvas text metrics used by axe's color-contrast rule.
    "color-contrast": { enabled: false },
  },
};

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="id" messages={idMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

async function expectNoAxeViolations(container: HTMLElement) {
  const result = await axe.run(container, axeOptions);
  expect(result.violations).toEqual([]);
}

describe("axe accessibility audit", () => {
  afterEach(() => cleanup());

  it("has no axe violations on public and login entry points", async () => {
    const pages = [
      withIntl(<Home key="home" />),
      <AdminLoginPage key="admin-login" />,
      <TenantLoginPage key="tenant-login" params={{ slug: "toko-sumber" }} />,
    ];

    for (const page of pages) {
      const { container, unmount } = render(page);
      await expectNoAxeViolations(container);
      unmount();
    }
  });

  it("has no axe violations on the grosir product form", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["grosir-masterdata", "/masterdata/categories"], [{ id: "cat-1", name: "Beras" }]);
    client.setQueryData(["grosir-masterdata", "/masterdata/units"], [{ id: "unit-1", name: "pcs" }]);

    const { container } = render(
      <QueryClientProvider client={client}>
        <ProductForm onDone={vi.fn()} />
      </QueryClientProvider>,
    );

    await expectNoAxeViolations(container);
  });
});
