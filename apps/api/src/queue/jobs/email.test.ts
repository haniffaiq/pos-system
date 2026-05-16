import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/mailer", () => ({
  MAIL_FROM: "noreply@example.test",
  mailer: {
    sendMail: vi.fn().mockResolvedValue({ messageId: "test-message" }),
  },
}));

import { mailer } from "../../lib/mailer";
import { emailProcessor, renderEmail } from "./email";

describe("renderEmail", () => {
  it("renders the welcome template with escaped recipient name", () => {
    const out = renderEmail("welcome", { name: "Budi <script>" });

    expect(out.subject).toMatch(/welcome/i);
    expect(out.html).toContain("Budi &lt;script&gt;");
    expect(out.html).not.toContain("<script>");
  });

  it("renders the invite template with escaped tenant name", () => {
    const out = renderEmail("invite", { name: "Siti", tenant: "Toko & Co" });

    expect(out.subject).toContain("Toko & Co");
    expect(out.html).toContain("Toko &amp; Co");
  });

  it("renders the password reset template with escaped reset link", () => {
    const out = renderEmail("password_reset", {
      name: "Ayu",
      link: "https://example.test/reset?token=***<bad>&next=/pos",
    });

    expect(out.subject).toMatch(/reset/i);
    expect(out.html).toContain("https://example.test/reset?token=***&lt;bad&gt;&amp;next=/pos");
  });

  it("renders MFA OTP emails with an escaped code and no surrounding log text", () => {
    const out = renderEmail("mfa_otp", { code: "123<56" });

    expect(out.subject).toMatch(/verification code/i);
    expect(out.html).toContain("123&lt;56");
    expect(out.html).not.toContain("123<56");
  });
});

describe("emailProcessor", () => {
  it("sends rendered email through the SMTP mailer", async () => {
    await emailProcessor({
      data: {
        to: "budi@example.test",
        template: "welcome",
        vars: { name: "Budi" },
      },
    });

    expect(mailer.sendMail).toHaveBeenCalledWith({
      from: "noreply@example.test",
      to: "budi@example.test",
      subject: expect.stringMatching(/welcome/i),
      html: expect.stringContaining("Budi"),
    });
  });
});
