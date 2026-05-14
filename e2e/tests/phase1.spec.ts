import { expect, test } from "@playwright/test";

const slug = `e2e-${Date.now()}`;
const ownerEmail = `owner+${slug}@example.test`;
const ownerPassword = "secret12";

test.describe.configure({ mode: "serial" });

test("platform admin logs in and registers a tenant", async ({ page }) => {
  await page.goto("/admin/login", { waitUntil: "commit" });
  await page.getByLabel("Email").fill("admin@local");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/admin/tenants/new");
  await page.getByLabel("Company name").fill("E2E Toko");
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Sector").selectOption("grosir");
  await page.getByLabel("Owner email").fill(ownerEmail);
  await page.getByLabel("Owner password").fill(ownerPassword);
  await page.getByRole("button", { name: "Create tenant" }).click();

  await expect(page).toHaveURL(/\/admin\/tenants\/[0-9a-f-]+$/i);
  await expect(page.getByRole("heading", { name: "E2E Toko" })).toBeVisible();
  await expect(page.getByText(`${slug} · grosir`)).toBeVisible();
  await expect(page.getByText(ownerEmail)).toBeVisible();
});

test("tenant owner logs in and reaches the owner dashboard", async ({ page }) => {
  await page.goto(`/t/${slug}/login`, { waitUntil: "commit" });
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(new RegExp(`/t/${slug}$`));
  await expect(page.getByText("Grosir module loads here (Phase 2).")).toBeVisible();
});
