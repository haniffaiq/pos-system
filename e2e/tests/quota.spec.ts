import { expect, type Page, test } from "@playwright/test";

const freeSlug = process.env.E2E_QUOTA_FREE_SLUG;
const inactiveSlug = process.env.E2E_QUOTA_INACTIVE_SLUG;
const ownerPassword = process.env.E2E_QUOTA_OWNER_PASSWORD ?? "secret12";

const quotaEnvReady = Boolean(freeSlug && inactiveSlug);
test.skip(!quotaEnvReady, "E2E_QUOTA_FREE_SLUG and E2E_QUOTA_INACTIVE_SLUG are required. Run: source <(bash e2e/seed-quota.sh)");

async function login(page: Page, slug: string, expectedPath: RegExp = new RegExp(`/t/${slug}$`)) {
  await page.goto(`/t/${slug}/login`, { waitUntil: "commit" });
  await page.getByLabel("Email").fill(`owner@${slug}.com`);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(expectedPath);
}

async function tryCreateProduct(page: Page) {
  const unique = Date.now();
  await page.goto(`/t/${freeSlug}/products`);
  await expect(page.getByRole("heading", { name: "Produk" })).toBeVisible();
  await page.getByRole("button", { name: "+ Produk baru" }).click();
  await page.getByLabel("SKU").fill(`OVER-${unique}`);
  await page.getByLabel("Nama").fill(`Over quota ${unique}`);
  await page.getByLabel("Satuan dasar (eceran)").selectOption({ label: "pcs" });
  await page.getByLabel("Harga beli (per eceran)").fill("1000");
  await page.getByLabel("Harga jual eceran").fill("1500");
  await page.getByLabel("Harga jual grosir (per satuan grosir)").fill("0");
  await page.getByLabel("Stok minimum").fill("1");
  await page.getByRole("button", { name: "Simpan" }).click();
}

test.describe.serial("quota and subscription gating", () => {
  test("free tenant sees the quota upgrade CTA after exhausting SKU quota", async ({ page }) => {
    await login(page, freeSlug!);

    await tryCreateProduct(page);

    const dialog = page.getByRole("dialog", { name: "Kuota tercapai" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Produk (SKU) sudah memakai 100 / 100");
    await expect(dialog.getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", /\/billing$/);
  });

  test("inactive tenant is redirected to billing instead of tenant app routes", async ({ page }) => {
    await login(page, inactiveSlug!, new RegExp(`/t/${inactiveSlug}/billing$`));
    await expect(page).toHaveURL(new RegExp(`/t/${inactiveSlug}/billing$`));

    await page.goto(`/t/${inactiveSlug}/products`);

    await expect(page).toHaveURL(new RegExp(`/t/${inactiveSlug}/billing$`));
  });
});
