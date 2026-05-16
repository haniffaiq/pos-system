import { expect, type Page, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("marketing home", () => {
  test("renders localized home page sections, nav, login menu, and CTAs", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page).toHaveTitle(/BroSolution/);
    await expect(page.getByRole("link", { name: "Beranda BroSolution" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kelola Grosirmu Lebih Cepat" })).toBeVisible();
    await expect(page.getByText("Dipakai oleh UMKM se-Indonesia")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fitur Lengkap" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Antarmuka yang Familiar" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Harga Sederhana" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pertanyaan Sering Ditanya" })).toBeVisible();
    await expect(page.getByText("© 2026 BroSolution. Semua hak dilindungi.")).toBeVisible();

    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 768) {
      await expect(page.getByRole("navigation", { name: "Navigasi marketing" }).getByRole("link", { name: "Fitur" })).toHaveAttribute("href", "#features");
      await expect(page.getByRole("navigation", { name: "Navigasi marketing" }).getByRole("link", { name: "Harga" })).toHaveAttribute("href", "#pricing");
      await expect(page.getByRole("navigation", { name: "Navigasi marketing" }).getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "#faq");
    } else {
      await expect(page.getByRole("navigation", { name: "Navigasi marketing" })).toBeHidden();
    }

    const signupLinks = page.getByRole("link", { name: "Coba Gratis 14 Hari" });
    await expect(signupLinks.first()).toHaveAttribute("href", "/signup");
    await expect(page.getByRole("link", { name: "Lihat Demo" })).toHaveAttribute("href", "#screenshot");
    await expect(page.getByRole("link", { name: "Mulai Sekarang" }).first()).toHaveAttribute("href", "/signup");

    const loginButton = page.getByRole("button", { name: /Login/ });
    await loginButton.click();
    await expect(loginButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("menuitem", { name: "Admin" })).toHaveAttribute("href", "/admin/login");
    await expect(page.getByRole("menuitem", { name: "Cari Tenant" })).toHaveAttribute("href", "/find-tenant");
  });

  test("language toggle persists English and Indonesian marketing copy", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("button", { name: "ID" })).toHaveAttribute("aria-pressed", "true");
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/lang") && response.ok()),
      page.getByRole("button", { name: "EN" }).click(),
    ]);
    await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === "lang")?.value).toBe("en");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Run Your Wholesale Faster" })).toBeVisible();
    await expect(page.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: "Start 14-Day Free Trial" }).first()).toHaveAttribute("href", "/signup");

    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/lang") && response.ok()),
      page.getByRole("button", { name: "ID" }).click(),
    ]);
    await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === "lang")?.value).toBe("id");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Kelola Grosirmu Lebih Cepat" })).toBeVisible();
  });

  test("responsive marketing layout fits viewport without horizontal overflow", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: /Kelola Grosirmu Lebih Cepat|Run Your Wholesale Faster/ })).toBeVisible();
    await expect(page.locator("#features")).toBeVisible();
    await expect(page.locator("#screenshot")).toBeVisible();
    await expect(page.locator("#pricing")).toBeVisible();
    await expect(page.locator("#faq")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      await expect(page.getByRole("navigation", { name: /Navigasi marketing|Marketing navigation/ })).toBeHidden();
      await expect(page.getByRole("link", { name: /Coba Gratis 14 Hari|Start 14-Day Free Trial/ }).first()).toBeVisible();
    } else {
      await expect(page.getByRole("navigation", { name: /Navigasi marketing|Marketing navigation/ })).toBeVisible();
    }
  });
});
