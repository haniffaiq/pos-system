import { expect, test, type APIRequestContext } from "@playwright/test";

const mailhogBaseUrl = process.env.E2E_MAILHOG_URL ?? "http://localhost:8025";
const ownerPassword = "password123";

type MailHogMessage = {
  Content?: {
    Body?: string;
    Headers?: Record<string, string[]>;
  };
  Raw?: { Data?: string };
};

type MailHogResponse = {
  items?: MailHogMessage[];
};

function messageText(message: MailHogMessage): string {
  return [message.Content?.Body, message.Raw?.Data].filter(Boolean).join("\n");
}

function messageRecipients(message: MailHogMessage): string[] {
  return [
    ...(message.Content?.Headers?.To ?? []),
    ...(message.Content?.Headers?.DeliveredTo ?? []),
    ...(message.Content?.Headers?.["X-Original-To"] ?? []),
  ];
}

function decodeMailBody(value: string): string {
  return value
    .replace(/=3D/g, "=")
    .replace(/=2F/g, "/")
    .replace(/=26/g, "&")
    .replace(/=\r?\n/g, "")
    .replace(/&amp;/g, "&");
}

function extractVerificationToken(message: MailHogMessage): string | null {
  const body = decodeMailBody(messageText(message));
  const match = body.match(/https?:\/\/[^\s"'<>]+\/verify\?token=([a-f0-9]{64})/i);
  return match?.[1] ?? null;
}

async function latestSignupToken(request: APIRequestContext, email: string): Promise<string> {
  await expect
    .poll(
      async () => {
        const response = await request.get(`${mailhogBaseUrl}/api/v2/messages?limit=50`);
        if (!response.ok()) return null;

        const payload = (await response.json()) as MailHogResponse;
        const message = (payload.items ?? []).find((item) => {
          const recipients = messageRecipients(item).join(" ").toLowerCase();
          return recipients.includes(email.toLowerCase()) && extractVerificationToken(item);
        });
        return message ? extractVerificationToken(message) : null;
      },
      { message: `signup verification email for ${email}`, timeout: 15_000 },
    )
    .not.toBeNull();

  const response = await request.get(`${mailhogBaseUrl}/api/v2/messages?limit=50`);
  const payload = (await response.json()) as MailHogResponse;
  const message = (payload.items ?? []).find((item) => messageRecipients(item).join(" ").toLowerCase().includes(email.toLowerCase()));
  const token = message ? extractVerificationToken(message) : null;
  if (!token) throw new Error(`No signup verification token found for ${email}`);
  return token;
}

test.describe.configure({ mode: "serial" });

test("self-serve signup verifies email and lands on tenant login", async ({ page, request }) => {
  const runId = Date.now().toString(36);
  const email = `owner+signup-${runId}@e2e.test`;
  const slug = `signup-${runId}`;

  await page.goto("/signup", { waitUntil: "commit" });
  await page.getByLabel(/work email|email kerja/i).fill(email);
  await page.getByLabel(/password/i).fill(ownerPassword);
  await page.getByLabel(/business name|nama bisnis/i).fill("E2E Signup Co");
  await page.getByLabel(/tenant slug|slug tenant/i).fill(slug);
  await page.getByRole("button", { name: /create account|buat akun/i }).click();

  await expect(page.getByRole("status")).toContainText(/check your email|cek email/i);

  const token = await latestSignupToken(request, email);

  await page.goto(`/verify?token=${token}`, { waitUntil: "commit" });
  await expect(page).toHaveURL(new RegExp(`/t/${slug}/login$`), { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
});
