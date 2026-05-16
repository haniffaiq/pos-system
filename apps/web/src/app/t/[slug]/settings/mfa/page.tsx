"use client";

import { Button, Card, Input } from "@app/ui";
import React, { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

interface EnrollResponse {
  qr: string;
  otpauth?: string;
}

export default function MfaPage() {
  const [qr, setQr] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  async function enroll() {
    setError(null);
    setStatus(null);
    setIsEnrolling(true);
    try {
      const response = await apiFetch<EnrollResponse>("/auth/mfa/enroll", { method: "POST" });
      setQr(response.qr);
      setOtpauth(response.otpauth ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to start MFA enrollment");
    } finally {
      setIsEnrolling(false);
    }
  }

  async function verify() {
    setError(null);
    setStatus(null);
    setIsVerifying(true);
    try {
      await apiFetch<{ enabled: true }>("/auth/mfa/verify", { method: "POST", body: JSON.stringify({ code }) });
      setStatus("MFA is enabled for this account.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid MFA code");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <div>
        <p className="font-display text-xs font-black uppercase tracking-wide text-accent">Security settings</p>
        <h1 className="font-display text-3xl font-black text-fg">Two-factor authentication</h1>
        <p className="mt-1 text-sm font-bold text-fg/70">Enroll an authenticator app for owner and admin sign-ins.</p>
      </div>

      <Card className="space-y-4">
        {!qr ? (
          <Button type="button" variant="primary" disabled={isEnrolling} onClick={enroll}>
            {isEnrolling ? "Starting…" : "Start TOTP enrollment"}
          </Button>
        ) : (
          <div className="space-y-4">
            <img
              src={qr}
              alt="Scan this QR code in your authenticator app"
              className="h-48 w-48 rounded-md border-2 border-fg"
            />
            {otpauth ? (
              <p className="break-all rounded-md border-2 border-fg bg-bg p-3 text-xs font-bold">{otpauth}</p>
            ) : null}
            <Input
              label="6-digit authenticator code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button type="button" variant="primary" disabled={isVerifying} onClick={verify}>
              {isVerifying ? "Verifying…" : "Verify and enable MFA"}
            </Button>
          </div>
        )}
        {status ? <p className="text-sm font-black text-green-700">{status}</p> : null}
        {error ? <p className="text-sm font-black text-accent">{error}</p> : null}
      </Card>
    </main>
  );
}
