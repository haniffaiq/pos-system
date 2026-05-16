"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type VerifyState = "verifying" | "success" | "error";

function apiMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = body as { message?: unknown; error?: { message?: unknown } };
  if (typeof value.error?.message === "string") return value.error.message;
  if (typeof value.message === "string") return value.message;
  return null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

function verifiedSlug(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = body as { slug?: unknown; tenantSlug?: unknown };
  if (typeof value.slug === "string") return value.slug;
  if (typeof value.tenantSlug === "string") return value.tenantSlug;
  return null;
}

function VerifyContent() {
  const t = useTranslations("verify");
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<VerifyState>("verifying");
  const [message, setMessage] = useState(t("verifyingBody"));

  useEffect(() => {
    let active = true;
    const token = params.get("token");

    if (!token) {
      setState("error");
      setMessage(t("missingToken"));
      return () => {
        active = false;
      };
    }

    async function verify(tokenValue: string) {
      try {
        const response = await fetch(`${API_BASE}/api/v1/signup/verify`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: tokenValue }),
        });
        const body = await readJson(response);

        if (!active) return;
        if (!response.ok) {
          setState("error");
          setMessage(apiMessage(body) ?? t("invalidToken"));
          return;
        }

        const slug = verifiedSlug(body);
        if (!slug) {
          setState("error");
          setMessage(t("missingSlug"));
          return;
        }

        setState("success");
        setMessage(t("success"));
        router.push(`/t/${slug}/login`);
      } catch {
        if (!active) return;
        setState("error");
        setMessage(t("networkError"));
      }
    }

    void verify(token);

    return () => {
      active = false;
    };
  }, [params, router, t]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6 text-fg">
      <section className="w-full max-w-lg border-2 border-fg bg-card p-6 text-center shadow-brutal">
        <p className="font-display text-xs font-black uppercase tracking-wide text-accent">BroSolution</p>
        <h1 className="mt-3 font-display text-3xl font-black">
          {state === "verifying" ? t("verifyingTitle") : state === "success" ? t("successTitle") : t("errorTitle")}
        </h1>
        <p className="mt-4 text-sm font-bold" role="status">
          {message}
        </p>
        {state === "error" && (
          <Link href="/signup" className="mt-6 inline-block border-2 border-fg bg-fg px-4 py-2 font-black text-bg shadow-brutal">
            {t("retry")}
          </Link>
        )}
      </section>
    </main>
  );
}

export default function VerifyPage() {
  const t = useTranslations("verify");
  return (
    <Suspense fallback={<p>{t("verifyingBody")}</p>}>
      <VerifyContent />
    </Suspense>
  );
}
