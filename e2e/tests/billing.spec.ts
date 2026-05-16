import { expect, test, type Page } from "@playwright/test";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const tenantId = "11111111-1111-4111-8111-111111111111";

test.setTimeout(120_000);

async function seedTenantSession(page: Page) {
  await page.addInitScript(({ tenantId }) => {
    window.localStorage.setItem("owa.session", JSON.stringify({ accessToken: "stale-local-storage-token", role: "owner", tenantId }));
    window.sessionStorage.setItem("owa.session", JSON.stringify({ role: "owner", tenantId }));
  }, { tenantId });
}

async function mockTenantContext(page: Page) {
  await page.route(`${apiBase}/api/v1/t/${tenantId}/me`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ userId: "owner-1", tenantId, role: "owner", sector: "grosir" }),
    });
  });
}

async function mockBillingSummary(page: Page): Promise<{ sawCookie: () => boolean }> {
  const seen: string[] = [];
  await page.route(`${apiBase}/api/v1/billing/summary`, async (route) => {
    seen.push(route.request().headers().cookie ?? "");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        plan: { code: "free", name: "Free", priceIdr: 0, quota: { outlets: 1 } },
        subscription: { status: "trialing", currentPeriodEnd: "2026-06-01T00:00:00.000Z" },
        invoices: [],
      }),
    });
  });
  return { sawCookie: () => seen.some((cookie) => cookie.includes("owa.access=")) };
}

async function openBilling(page: Page): Promise<{ summarySawCookie: () => boolean }> {
  await page.context().addCookies([
    { name: "owa.access", value: "http-only-access-cookie", url: apiBase, sameSite: "Lax", httpOnly: true },
  ]);
  await seedTenantSession(page);
  await mockTenantContext(page);
  const summary = await mockBillingSummary(page);
  await page.goto("/t/demo/billing", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Billing").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /paket dan invoice|plans and invoices/i })).toBeVisible();
  await expect(page.getByText(/Free/)).toBeVisible();
  return { summarySawCookie: summary.sawCookie };
}

test.describe("billing checkout sandbox/mocks", () => {
  test("Pro checkout uses Midtrans Snap sandbox redirect and HTTP-only cookie auth", async ({ page }) => {
    await page.route("https://app.sandbox.midtrans.com/**", async (route) => {
      await route.fulfill({ contentType: "text/html", body: "<title>Midtrans sandbox</title>" });
    });
    let checkoutCookie = "";
    await page.route(`${apiBase}/api/v1/billing/checkout`, async (route) => {
      checkoutCookie = route.request().headers().cookie ?? "";
      const body = await route.request().postDataJSON();
      expect(body).toEqual({ plan: "pro" });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ provider: "midtrans", redirectUrl: "https://app.sandbox.midtrans.com/snap/v2/vtweb/snap-token" }),
      });
    });

    const billing = await openBilling(page);
    expect(await page.evaluate(() => window.localStorage.getItem("owa.session"))).toBeNull();

    await page.getByRole("button", { name: /pro/i }).click();

    await expect(page).toHaveURL(/app\.sandbox\.midtrans\.com\/snap/);
    expect(billing.summarySawCookie()).toBe(true);
    expect(checkoutCookie).toContain("owa.access=");
  });

  test("Business checkout can use Xendit sandbox invoice redirect", async ({ page }) => {
    await page.route("https://checkout-staging.xendit.co/**", async (route) => {
      await route.fulfill({ contentType: "text/html", body: "<title>Xendit sandbox</title>" });
    });
    await page.route(`${apiBase}/api/v1/billing/checkout`, async (route) => {
      const body = await route.request().postDataJSON();
      expect(body).toEqual({ plan: "business" });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ provider: "xendit", redirectUrl: "https://checkout-staging.xendit.co/web/inv-123" }),
      });
    });

    await openBilling(page);
    await page.getByRole("button", { name: /business/i }).click();

    await expect(page).toHaveURL(/checkout-staging\.xendit\.co\/web/);
  });

  test("selected-provider fallback uses configured Xendit sandbox when active Midtrans config is incomplete", async ({ page }) => {
    await page.route("https://checkout-staging.xendit.co/**", async (route) => {
      await route.fulfill({ contentType: "text/html", body: "<title>Xendit fallback sandbox</title>" });
    });
    await page.route(`${apiBase}/api/v1/billing/checkout`, async (route) => {
      const body = await route.request().postDataJSON();
      expect(body).toEqual({ plan: "pro" });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          provider: "xendit",
          activePsp: "midtrans",
          fallbackPsp: "xendit",
          redirectUrl: "https://checkout-staging.xendit.co/web/fallback-inv-123",
        }),
      });
    });

    await openBilling(page);
    await page.getByRole("button", { name: /pro/i }).click();

    await expect(page).toHaveURL(/checkout-staging\.xendit\.co\/web\/fallback/);
  });
});
