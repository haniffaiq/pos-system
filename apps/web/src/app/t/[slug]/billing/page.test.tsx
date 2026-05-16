import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BillingPage from "./page";
import { setSession } from "../../../../lib/auth";

const messages = {
  billing: {
    title: "Plans & invoices",
    loading: "Loading billing…",
    loadError: "Unable to load billing",
    currentPlan: "Current plan",
    noPlan: "No plan",
    none: "none",
    status: "Status: {status}",
    renews: "Renews: {date}",
    upgradePro: "Upgrade Pro",
    upgradeBusiness: "Upgrade Business",
    invoiceHistory: "Invoice history",
    latestInvoices: "Latest invoices",
    date: "Date",
    amount: "Amount",
    invoiceStatus: "Status",
    noInvoices: "No invoices yet.",
  },
};

describe("BillingPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    sessionStorage.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setSession({ role: "owner", tenantId: "tenant-1" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows current plan, quota, invoices, and starts provider-neutral checkout", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            plan: { code: "free", name: "Free", priceIdr: 0, quota: { outlets: 1, users: 3 } },
            subscription: { status: "active", currentPeriodEnd: "2026-06-16T00:00:00.000Z" },
            invoices: [
              { id: "invoice-1", amountIdr: 299000, status: "paid", pspProvider: "xendit", createdAt: "2026-05-16T00:00:00.000Z" },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ redirectUrl: "https://checkout.example/pay", provider: "midtrans" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { assign }, writable: true });

    await renderPage();
    await flushReact();

    expect(container.textContent).toContain("Billing");
    expect(container.textContent).toContain("Free");
    expect(container.textContent).toContain("outlets: 1");
    expect(container.textContent).toContain("Rp299.000");
    expect(container.textContent).toContain("xendit");

    container.querySelector<HTMLButtonElement>('button[data-plan="pro"]')?.click();
    await flushReact();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/api/v1/billing/summary",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/api/v1/billing/checkout",
      expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify({ plan: "pro" }) }),
    );
    expect(assign).toHaveBeenCalledWith("https://checkout.example/pay");
  });

  async function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <NextIntlClientProvider locale="en" messages={messages}>
            <BillingPage />
          </NextIntlClientProvider>
        </QueryClientProvider>,
      );
    });
  }

  async function flushReact() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
});
