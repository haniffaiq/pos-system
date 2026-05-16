import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/mailer", () => ({
  MAIL_FROM: "noreply@example.test",
  mailer: {
    sendMail: vi.fn().mockResolvedValue({ messageId: "signup-message" }),
  },
}));

import { mailer } from "../../lib/mailer";
import { handleSignupVerify, renderSignupVerifyEmail } from "./signup-verify";

beforeEach(() => {
  vi.mocked(mailer.sendMail).mockClear();
});

describe("renderSignupVerifyEmail", () => {
  it("renders a BroSolution verification email with an escaped 24h verification link", () => {
    const out = renderSignupVerifyEmail({
      to: "owner@example.test",
      template: "signup_verify",
      vars: {
        businessName: 'ABC "<Grosir>"',
        verifyUrl: 'https://brosolution.test/verify?code=abc&next="<bad>"',
      },
    });

    expect(out.subject).toBe("Verifikasi akun BroSolution kamu");
    expect(out.html).toContain("untuk ABC &quot;&lt;Grosir&gt;&quot;");
    expect(out.html).toContain("dalam 24 jam");
    expect(out.html).toContain("https://brosolution.test/verify?code=abc&amp;next=&quot;&lt;bad&gt;&quot;");
    expect(out.html).not.toContain("<bad>");
    expect(out.html).not.toContain('"<Grosir>"');
  });
});

describe("handleSignupVerify", () => {
  it("sends verification mail to the signup email through the SMTP mailer", async () => {
    await handleSignupVerify({
      to: "owner@example.test",
      template: "signup_verify",
      vars: {
        businessName: "ABC Grosir",
        verifyUrl: "https://brosolution.test/verify?code=abc",
      },
    });

    expect(mailer.sendMail).toHaveBeenCalledWith({
      from: "noreply@example.test",
      to: "owner@example.test",
      subject: "Verifikasi akun BroSolution kamu",
      html: expect.stringContaining("https://brosolution.test/verify?code=abc"),
    });
  });

  it("rejects malformed signup-verify jobs before sending", async () => {
    await expect(
      handleSignupVerify({
        to: "owner@example.test",
        template: "welcome",
        vars: { name: "Owner" },
      }),
    ).rejects.toThrow(/signup-verify email jobs require/);

    expect(mailer.sendMail).not.toHaveBeenCalled();
  });
});
