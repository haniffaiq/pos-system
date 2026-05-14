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
  accessToken: string;
  refreshToken: string;
  user?: { role: string; tenantId: string };
  admin?: { id: string };
}

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

export function LoginForm({ mode, slug }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setServerError(null);

    try {
      const path = mode === "admin" ? "/auth/admin-login" : "/auth/tenant-login";
      const payload = mode === "admin" ? values : { ...values, slug };
      const response = await apiFetch<AuthResponse>(path, { method: "POST", body: JSON.stringify(payload) });

      setSession({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        role: response.user?.role ?? "platform_admin",
        tenantId: response.user?.tenantId ?? null,
      });
      router.push(mode === "admin" ? "/admin" : `/t/${slug}`);
    } catch (error) {
      setServerError(loginErrorMessage(error));
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
        <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full justify-center">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Card>
  );
}
