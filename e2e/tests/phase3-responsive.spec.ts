import { expect, type Page, test } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@local";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "admin123";
const tenantSlug = process.env.E2E_GROSIR_SLUG;

test.describe.configure({ mode: "serial" });

async function loginAdmin(page: Page) {
  await page.goto("/admin/login", { waitUntil: "commit" });
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

function isNarrow(page: Page): boolean {
  const size = page.viewportSize();
  return !!size && size.width < 768;
}

test.describe("admin shell", () => {
  test("admin login + dashboard layout fits viewport", async ({ page }) => {
    await loginAdmin(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const toggle = page.getByRole("button", { name: "Toggle menu" });
    if (isNarrow(page)) {
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.getByRole("link", { name: "Tenants" })).toBeVisible();
    } else {
      await expect(toggle).toBeHidden();
      await expect(page.getByRole("link", { name: "Tenants" })).toBeVisible();
    }
  });

  test("admin tenants list renders + table scrolls horizontally", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/admin/tenants");
    await expect(page.getByRole("heading", { name: "Tenants" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const tableWrap = page.locator(".overflow-x-auto").first();
    await expect(tableWrap).toBeVisible();
  });

  test("admin register-tenant form fits viewport", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/admin/tenants/new");
    await expect(page.getByRole("heading", { name: "Register tenant" })).toBeVisible();
    await expect(page.getByLabel("Company name")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("tenant shell", () => {
  test.skip(!tenantSlug, "E2E_GROSIR_SLUG required. Run: export E2E_GROSIR_SLUG=$(bash e2e/seed-grosir.sh)");

  test("tenant login layout fits viewport", async ({ page }) => {
    await page.goto(`/t/${tenantSlug}/login`, { waitUntil: "commit" });
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("tenant dashboard + drawer toggles on mobile", async ({ page }) => {
    const ownerEmail = `owner@${tenantSlug}.com`;
    const ownerPassword = process.env.E2E_GROSIR_OWNER_PASSWORD ?? "secret12";

    await page.goto(`/t/${tenantSlug}/login`);
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill(ownerPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(new RegExp(`/t/${tenantSlug}$`));
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const toggle = page.getByRole("button", { name: "Toggle menu" });
    if (isNarrow(page)) {
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.getByRole("link", { name: "POS / Penjualan" })).toBeVisible();
    } else {
      await expect(toggle).toBeHidden();
      await expect(page.getByRole("link", { name: "POS / Penjualan" })).toBeVisible();
    }
  });

  test("tenant products page table scrolls horizontally", async ({ page }) => {
    const ownerEmail = `owner@${tenantSlug}.com`;
    const ownerPassword = process.env.E2E_GROSIR_OWNER_PASSWORD ?? "secret12";

    await page.goto(`/t/${tenantSlug}/login`);
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill(ownerPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${tenantSlug}$`));

    await page.goto(`/t/${tenantSlug}/products`);
    await expect(page.getByRole("heading", { name: "Produk" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page.locator(".overflow-x-auto").first()).toBeVisible();
  });
});
