import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/mailer", () => ({
  MAIL_FROM: "noreply@example.test",
  mailer: {
    sendMail: vi.fn().mockResolvedValue({ messageId: "test-message" }),
  },
}));

import { mailer } from "../../lib/mailer";
import { emailProcessor, renderEmail } from "./email";

beforeEach(() => {
  vi.mocked(mailer.sendMail).mockClear();
});

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
      link: "https://example.test/reset?code=abc&next=/pos",
    });

    expect(out.subject).toMatch(/reset/i);
    expect(out.html).toContain("https://example.test/reset?code=abc&amp;next=/pos");
  });

  it("renders MFA OTP emails with an escaped code and no surrounding log text", () => {
    const out = renderEmail("mfa_otp", { code: "123<56" });

    expect(out.subject).toMatch(/verification code/i);
    expect(out.html).toContain("123&lt;56");
    expect(out.html).not.toContain("123<56");
  });

  it("renders signup verification through the dedicated BroSolution template", () => {
    const out = renderEmail("signup_verify", {
      businessName: 'ABC "<Grosir>"',
      verifyUrl: 'https://brosolution.test/verify?code=abc&next="<bad>"',
    });

    expect(out.subject).toBe("Verifikasi akun BroSolution kamu");
    expect(out.html).toContain("untuk ABC &quot;&lt;Grosir&gt;&quot;");
    expect(out.html).toContain("dalam 24 jam");
    expect(out.html).toContain("https://brosolution.test/verify?code=abc&amp;next=&quot;&lt;bad&gt;&quot;");
    expect(out.html).not.toContain("<bad>");
    expect(out.html).not.toContain('"<Grosir>"');
  });
});

describe("emailProcessor", () => {
  it("sends rendered email through the SMTP mailer", async () => {
    await emailProcessor({
      name: "send",
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

  it("dispatches signup-verify jobs to the BroSolution verification worker handler", async () => {
    await emailProcessor({
      name: "signup-verify",
      data: {
        to: "owner@example.test",
        template: "signup_verify",
        vars: {
          businessName: "ABC Grosir",
          verifyUrl: "https://brosolution.test/verify?code=abc",
        },
      },
    });

    expect(mailer.sendMail).toHaveBeenCalledWith({
      from: "noreply@example.test",
      to: "owner@example.test",
      subject: "Verifikasi akun BroSolution kamu",
      html: expect.stringContaining("https://brosolution.test/verify?code=abc"),
    });
  });
});
