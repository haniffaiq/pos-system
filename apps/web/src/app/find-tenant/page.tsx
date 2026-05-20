"use client";

import React, { useState } from "react";
import { Button, Card, Input } from "@app/ui";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export default function FindTenantPage() {
  const router = useRouter();
  const t = useTranslations("findTenant");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeSlug(slug);
    if (!normalized) {
      setError(t("errorEmpty"));
      return;
    }
    setError(null);
    router.push(`/t/${normalized}/login`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-4 space-y-1">
          <p className="font-display text-xs font-black uppercase tracking-wide text-accent">
            {t("eyebrow")}
          </p>
          <h1 className="font-display text-2xl font-black text-fg">{t("title")}</h1>
          <p className="text-sm font-bold text-fg/70">{t("subtitle")}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <Input
            label={t("label")}
            placeholder={t("placeholder")}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            error={error ?? undefined}
          />
          <Button type="submit" variant="primary" className="w-full justify-center">
            {t("submit")}
          </Button>
        </form>
        <p className="mt-4 text-sm font-bold text-fg/70">
          <Link href="/" className="underline underline-offset-4 hover:text-fg">
            {t("back")}
          </Link>
        </p>
      </Card>
    </main>
  );
}
