import { expect, type Page, test } from "@playwright/test";

const slug = process.env.E2E_GROSIR_SLUG;
const ownerPassword = process.env.E2E_GROSIR_OWNER_PASSWORD ?? "secret12";

test.skip(!slug, "E2E_GROSIR_SLUG is required. Run: export E2E_GROSIR_SLUG=$(bash e2e/seed-grosir.sh)");

const ownerEmail = `owner@${slug}.com`;
const productName = `Gula E2E ${Date.now()}`;
const productSku = `E2E-${Date.now()}`;

test.describe.serial("phase 2 grosir vertical", () => {
  test("owner can log in and see seeded master data", async ({ page }) => {
    await login(page);

    await page.goto(`/t/${slug}/masterdata`);
    await expect(page.getByRole("heading", { name: "Master Data" })).toBeVisible();
    await expect(page.getByText("Sembako").first()).toBeVisible();
    await expect(page.getByText("pcs").first()).toBeVisible();
  });

  test("owner creates a product, stocks it in, sells it, and sees dashboard totals update", async ({ page }) => {
    await login(page);

    await page.goto(`/t/${slug}/products`);
    await page.getByRole("button", { name: "+ Produk baru" }).click();
    await page.getByLabel("SKU").fill(productSku);
    await page.getByLabel("Nama").fill(productName);
    await page.getByLabel("Kategori").selectOption({ label: "Sembako" });
    await page.getByLabel("Satuan dasar (eceran)").selectOption({ label: "pcs" });
    await page.getByLabel("Harga beli (per eceran)").fill("10000");
    await page.getByLabel("Harga jual eceran").fill("12000");
    await page.getByLabel("Harga jual grosir (per satuan grosir)").fill("0");
    await page.getByLabel("Stok minimum").fill("5");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("cell", { name: productSku })).toBeVisible();
    await expect(page.getByRole("cell", { name: productName, exact: true })).toBeVisible();

    await page.goto(`/t/${slug}/stock-in`);
    await page.getByLabel("Produk").selectOption({ label: productName });
    await page.getByLabel("Satuan", { exact: true }).selectOption({ label: "pcs" });
    await page.getByLabel("Qty").fill("50");
    await page.getByLabel("Harga/satuan").fill("10000");
    await page.getByRole("button", { name: "+ Tambah" }).click();
    await expect(page.getByRole("cell", { name: productName, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Simpan barang masuk" }).click();
    await expect(page.getByText("Belum ada item barang masuk.")).toBeVisible();

    await page.goto(`/t/${slug}/pos`);
    await page.getByPlaceholder("Cari produk / SKU").fill(productName);
    await page.getByRole("button", { name: `Tambah ${productName}` }).click();
    await page.getByLabel(`Qty ${productName}`).fill("2");
    await page.getByLabel("Dibayar").fill("50000");
    await page.getByRole("button", { name: "Bayar" }).click();
    await expect(page.getByText(/Sukses: INV-/)).toBeVisible();

    await page.goto(`/t/${slug}`);
    await expect(page.getByText("Transaksi hari ini")).toBeVisible();
    await expect(page.getByText(/Rp\s+[0-9.]+/).first()).toBeVisible();
    await expect(page.getByText(/^[1-9]\d*$/).first()).toBeVisible();
    await expect(page.getByText(new RegExp(productName))).toBeVisible();
  });
});

async function login(page: Page) {
  await page.goto(`/t/${slug}/login`);
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${slug}$`));
}
