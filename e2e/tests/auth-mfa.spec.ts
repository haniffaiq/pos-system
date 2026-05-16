import { expect, test, type Page } from "@playwright/test";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const tenantId = "11111111-1111-4111-8111-111111111111";
const loginCookies = [
  "brs_access=e2e-access; Path=/; HttpOnly; SameSite=Lax",
  "brs_refresh=e2e-refresh; Path=/api/v1/auth; HttpOnly; SameSite=Lax",
  "brs_csrf=e2e-csrf; Path=/; SameSite=Lax",
].join(", ");
const clearCookies = [
  "brs_access=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
  "brs_refresh=; Path=/api/v1/auth; Max-Age=0; HttpOnly; SameSite=Lax",
  "brs_csrf=; Path=/; Max-Age=0; SameSite=Lax",
].join(", ");

test.setTimeout(90_000);

async function mockTenantApp(page: Page) {
  await page.route(`${apiBase}/api/v1/t/${tenantId}/me`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ userId: "owner-e2e", tenantId, role: "owner", sector: "grosir" }),
    });
  });
  await page.route(`${apiBase}/api/v1/t/${tenantId}/m/dashboard`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ todaySalesTotal: 125000, todayTxnCount: 3, lowStockCount: 1, topProducts: [] }),
    });
  });
  await page.route(`${apiBase}/api/v1/billing/summary`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ plan: { quota: { skus: 5000, tx_count: 20000 } }, usage: { skus: 10, tx_count: 3 } }),
    });
  });
}

async function expectNoLocalStorageTokens(page: Page) {
  await expect
    .poll(async () => page.evaluate(() => window.localStorage.getItem("owa.session")))
    .toBeNull();

  const storageSnapshot = await page.evaluate(() => JSON.stringify(window.localStorage));
  expect(storageSnapshot).not.toMatch(/accessToken|refreshToken|bearer|e2e-access|e2e-refresh/i);
}

test.describe("auth hardening", () => {
  test("normal tenant login uses HTTP-only cookies and never stores tokens in localStorage", async ({ page }) => {
    await mockTenantApp(page);
    let loginCookieHeader = "";

    await page.route(`${apiBase}/api/v1/auth/tenant-login`, async (route) => {
      const body = await route.request().postDataJSON();
      expect(body).toEqual({ slug: "demo", email: "owner@demo.test", password: "password123" });
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "set-cookie": loginCookies },
        body: JSON.stringify({ user: { role: "owner", tenantId } }),
      });
    });
    await page.route(`${apiBase}/api/v1/t/${tenantId}/m/dashboard`, async (route) => {
      loginCookieHeader = route.request().headers().cookie ?? "";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ todaySalesTotal: 125000, todayTxnCount: 3, lowStockCount: 1, topProducts: [] }),
      });
    });

    await page.goto("/t/demo/login", { waitUntil: "commit" });
    await page.getByLabel("Email").fill("owner@demo.test");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/t\/demo$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    expect(loginCookieHeader).toContain("brs_access=e2e-access");
    await expectNoLocalStorageTokens(page);
  });

  test("MFA login completes only after a TOTP challenge and still keeps tokens out of localStorage", async ({ page }) => {
    await mockTenantApp(page);
    const challengeToken = "challenge-e2e-token";
    const verifyRequests: unknown[] = [];

    await page.route(`${apiBase}/api/v1/auth/tenant-login`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "MFA_REQUIRED",
            message: "Multi-factor authentication is required",
            details: { challengeToken, methods: ["totp", "email_otp"] },
          },
        }),
      });
    });
    await page.route(`${apiBase}/api/v1/auth/mfa/challenge/verify`, async (route) => {
      const body = await route.request().postDataJSON();
      verifyRequests.push(body);
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "set-cookie": loginCookies },
        body: JSON.stringify({ user: { role: "owner", tenantId } }),
      });
    });

    await page.goto("/t/demo/login", { waitUntil: "commit" });
    await page.getByLabel("Email").fill("owner@demo.test");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("heading", { name: "Multi-factor authentication" })).toBeVisible();
    await page.getByLabel("Method").selectOption("totp");
    await page.getByLabel("6-digit MFA code").fill("123456");
    await page.getByRole("button", { name: "Verify code" }).click();

    await expect(page).toHaveURL(/\/t\/demo$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    expect(verifyRequests).toEqual([{ challengeToken, method: "totp", code: "123456" }]);
    await expectNoLocalStorageTokens(page);
  });

  test("logout posts to the auth API with CSRF so the refresh cookie can be invalidated", async ({ page }) => {
    await mockTenantApp(page);
    await page.context().addCookies([
      { name: "brs_access", value: "e2e-access", url: apiBase, httpOnly: true, sameSite: "Lax" },
      { name: "brs_refresh", value: "e2e-refresh", url: `${apiBase}/api/v1/auth`, httpOnly: true, sameSite: "Lax" },
      { name: "brs_csrf", value: "e2e-csrf", url: apiBase, sameSite: "Lax" },
    ]);
    await page.addInitScript(({ tenantId }) => {
      window.sessionStorage.setItem("owa.session", JSON.stringify({ role: "owner", tenantId }));
      window.localStorage.setItem("owa.session", JSON.stringify({ accessToken: "stale-token", refreshToken: "stale-refresh" }));
    }, { tenantId });

    let logoutCookieHeader = "";
    let logoutCsrfHeader = "";
    await page.route(`${apiBase}/api/v1/auth/logout`, async (route) => {
      logoutCookieHeader = route.request().headers().cookie ?? "";
      logoutCsrfHeader = route.request().headers()["x-csrf-token"] ?? "";
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "set-cookie": clearCookies },
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/t/demo", { waitUntil: "commit" });
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();

    await expect(page).toHaveURL(/\/t\/demo\/login$/);
    expect(logoutCookieHeader).toContain("brs_refresh=e2e-refresh");
    expect(logoutCsrfHeader).toBe("e2e-csrf");
    await expect(page.evaluate(() => window.sessionStorage.getItem("owa.session"))).resolves.toBeNull();
    await expectNoLocalStorageTokens(page);
  });

  test("login rate limiting surfaces the 429 response without creating a browser session", async ({ page }) => {
    await page.route(`${apiBase}/api/v1/auth/tenant-login`, async (route) => {
      await route.fulfill({
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "60" },
        body: JSON.stringify({ code: "RATE_LIMITED", message: "Too many requests" }),
      });
    });

    await page.goto("/t/demo/login", { waitUntil: "commit" });
    await page.getByLabel("Email").fill("owner@demo.test");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Too many requests")).toBeVisible();
    await expect(page).toHaveURL(/\/t\/demo\/login$/);
    await expect(page.evaluate(() => window.sessionStorage.getItem("owa.session"))).resolves.toBeNull();
    await expectNoLocalStorageTokens(page);
  });
});
