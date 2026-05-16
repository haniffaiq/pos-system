import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import MfaPage from "./page";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("tenant MFA settings page", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => cleanup());

  it("starts TOTP enrollment with cookie credentials and verifies the first code", async () => {
    mockedApiFetch
      .mockResolvedValueOnce({ qr: "data:image/png;base64,qr", otpauth: "otpauth://totp/BroSolution:owner" })
      .mockResolvedValueOnce({ enabled: true });

    render(<MfaPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start TOTP enrollment" }));

    const qrImage = await screen.findByAltText("Scan this QR code in your authenticator app");
    expect(qrImage.getAttribute("src")).toBe("data:image/png;base64,qr");

    fireEvent.change(screen.getByLabelText("6-digit authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and enable MFA" }));

    await waitFor(() => expect(mockedApiFetch).toHaveBeenLastCalledWith("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ code: "123456" }),
    }));
    expect(await screen.findByText("MFA is enabled for this account.")).toBeTruthy();
  });
});
