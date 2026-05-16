"use client";

import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@app/shared";
import { Button, Card, Input } from "@app/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ApiError, apiFetch } from "@/lib/api";
import { setSession } from "@/lib/auth";

interface AuthResponse {
  user?: { role: string; tenantId: string; tenantSlug?: string | null };
  admin?: { id: string };
}

type MfaMethod = "totp" | "email_otp";

type MfaChallenge = {
  challengeToken: string;
  methods: MfaMethod[];
};

interface Props {
  mode: "admin" | "tenant";
  slug?: string;
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && (error.status === 401 || error.code === "invalid_credentials")) {
    return "Invalid email or password";
  }

  if (error instanceof ApiError) return error.message;
  return "Login failed";
}

function mfaChallengeFromError(error: unknown): MfaChallenge | null {
  if (!(error instanceof ApiError) || error.code !== "MFA_REQUIRED") return null;
  const details = error.details as Partial<MfaChallenge> | undefined;
  if (!details?.challengeToken || !Array.isArray(details.methods)) return null;
  return {
    challengeToken: details.challengeToken,
    methods: details.methods.filter((method): method is MfaMethod => method === "totp" || method === "email_otp"),
  };
}

export function LoginForm({ mode, slug }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const [mfaMethod, setMfaMethod] = useState<MfaMethod>("totp");
  const [mfaCode, setMfaCode] = useState("");
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  React.useEffect(() => {
    setIsHydrated(true);
  }, []);

  function completeAuthentication(response: AuthResponse) {
    setSession({
      role: response.user?.role ?? "platform_admin",
      tenantId: response.user?.tenantId ?? null,
      ...(mode === "tenant" ? { tenantSlug: response.user?.tenantSlug ?? slug ?? null } : {}),
    });
    router.push(mode === "admin" ? "/admin" : `/t/${slug}`);
  }

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    setMfaChallenge(null);

    try {
      const path = mode === "admin" ? "/auth/admin-login" : "/auth/tenant-login";
      const payload = mode === "admin" ? values : { ...values, slug };
      const response = await apiFetch<AuthResponse>(path, { method: "POST", body: JSON.stringify(payload) });
      completeAuthentication(response);
    } catch (error) {
      const challenge = mfaChallengeFromError(error);
      if (challenge) {
        setMfaChallenge(challenge);
        setMfaMethod(challenge.methods.includes("totp") ? "totp" : challenge.methods[0] ?? "email_otp");
        return;
      }
      setServerError(loginErrorMessage(error));
    }
  }

  async function verifyMfa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfaChallenge) return;

    setServerError(null);
    setIsVerifyingMfa(true);
    try {
      const response = await apiFetch<AuthResponse>("/auth/mfa/challenge/verify", {
        method: "POST",
        body: JSON.stringify({ challengeToken: mfaChallenge.challengeToken, method: mfaMethod, code: mfaCode }),
      });
      completeAuthentication(response);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "MFA verification failed");
    } finally {
      setIsVerifyingMfa(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <div className="mb-4 space-y-1">
        <p className="font-display text-xs font-black uppercase tracking-wide text-accent">
          {mode === "admin" ? "Platform console" : slug}
        </p>
        <h1 className="font-display text-2xl font-black text-fg">
          {mode === "admin" ? "Platform Admin" : "Sign in"}
        </h1>
      </div>
      {mfaChallenge ? (
        <form onSubmit={verifyMfa} className="space-y-3" noValidate>
          <div className="space-y-1">
            <h2 className="font-display text-xl font-black text-fg">Multi-factor authentication</h2>
            <p className="text-sm font-bold text-fg/70">Enter a code from your authenticator app or email fallback.</p>
          </div>
          {mfaChallenge.methods.length > 1 ? (
            <label className="block text-sm font-bold text-fg">
              Method
              <select
                className="mt-1 w-full rounded-md border-2 border-fg bg-card px-3 py-2"
                value={mfaMethod}
                onChange={(event) => setMfaMethod(event.target.value as MfaMethod)}
              >
                {mfaChallenge.methods.map((method) => (
                  <option key={method} value={method}>
                    {method === "totp" ? "Authenticator app" : "Email OTP"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Input
            label="6-digit MFA code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value)}
          />
          {serverError && <p className="text-sm font-bold text-accent">{serverError}</p>}
          <Button type="submit" variant="primary" disabled={isVerifyingMfa} className="w-full justify-center">
            {isVerifyingMfa ? "Verifying…" : "Verify code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <Input label="Email" type="email" autoComplete="email" {...register("email")} error={errors.email?.message} />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
            error={errors.password?.message}
          />
          {serverError && <p className="text-sm font-bold text-accent">{serverError}</p>}
          <Button type="submit" variant="primary" disabled={!isHydrated || isSubmitting} className="w-full justify-center">
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      )}
    </Card>
  );
}
