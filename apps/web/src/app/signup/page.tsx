"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type SignupForm = {
  email: string;
  password: string;
  businessName: string;
  slug: string;
};

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

export default function SignupPage() {
  const t = useTranslations("signup");
  const [form, setForm] = useState<SignupForm>({ email: "", password: "", businessName: "", slug: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<"success" | "error" | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof SignupForm>(key: K, value: SignupForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);
    setStatusKind(null);

    try {
      const response = await fetch(`${API_BASE}/api/v1/signup`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await readJson(response);

      if (!response.ok) {
        setStatus(apiMessage(body) ?? t("genericError"));
        setStatusKind("error");
        return;
      }

      setStatus(t("success"));
      setStatusKind("success");
    } catch {
      setStatus(t("networkError"));
      setStatusKind("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg px-6 py-10 text-fg">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <section className="grid w-full gap-6 md:grid-cols-[0.9fr_1.1fr]">
          <div className="border-2 border-fg bg-accent p-6 shadow-brutal">
            <Link href="/" className="font-display text-sm font-black uppercase tracking-wide">
              {t("back")}
            </Link>
            <h1 className="mt-6 font-display text-4xl font-black leading-tight">{t("title")}</h1>
            <p className="mt-4 text-lg font-bold text-fg/80">{t("subtitle")}</p>
            <ul className="mt-6 space-y-3 text-sm font-bold">
              <li>✓ {t("benefits.pro")}</li>
              <li>✓ {t("benefits.noCard")}</li>
              <li>✓ {t("benefits.verify")}</li>
            </ul>
          </div>

          <form onSubmit={submit} className="space-y-4 border-2 border-fg bg-card p-6 shadow-brutal" noValidate>
            <div>
              <label htmlFor="signup-email" className="text-sm font-black">
                {t("fields.email")}
              </label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                className="mt-1 w-full border-2 border-fg bg-bg px-3 py-2 font-bold outline-none focus:shadow-brutal"
                required
              />
            </div>

            <div>
              <label htmlFor="signup-password" className="text-sm font-black">
                {t("fields.password")}
              </label>
              <input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => update("password", event.target.value)}
                className="mt-1 w-full border-2 border-fg bg-bg px-3 py-2 font-bold outline-none focus:shadow-brutal"
                required
              />
            </div>

            <div>
              <label htmlFor="signup-business" className="text-sm font-black">
                {t("fields.businessName")}
              </label>
              <input
                id="signup-business"
                type="text"
                autoComplete="organization"
                value={form.businessName}
                onChange={(event) => update("businessName", event.target.value)}
                className="mt-1 w-full border-2 border-fg bg-bg px-3 py-2 font-bold outline-none focus:shadow-brutal"
                required
              />
            </div>

            <div>
              <label htmlFor="signup-slug" className="text-sm font-black">
                {t("fields.slug")}
              </label>
              <input
                id="signup-slug"
                type="text"
                autoComplete="off"
                value={form.slug}
                onChange={(event) => update("slug", event.target.value)}
                className="mt-1 w-full border-2 border-fg bg-bg px-3 py-2 font-bold outline-none focus:shadow-brutal"
                required
              />
              <p className="mt-1 text-xs font-bold text-fg/60">{t("slugHelp")}</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full border-2 border-fg bg-fg px-4 py-3 font-display font-black text-bg shadow-brutal disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? t("loading") : t("submit")}
            </button>

            {status && (
              <p className={`text-sm font-black ${statusKind === "error" ? "text-accent" : "text-fg"}`} role="status">
                {status}
              </p>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
