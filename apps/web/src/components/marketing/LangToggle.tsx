"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n";

const labels: Record<Locale, string> = {
  id: "ID",
  en: "EN",
};

export function LangToggle({ current }: { current: Locale }) {
  const router = useRouter();

  async function setLocale(locale: Locale) {
    try {
      const response = await fetch("/api/lang", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch {
      // Keep the current server-rendered locale if persistence fails.
    }
  }

  return (
    <div className="inline-flex overflow-hidden border-2 border-fg text-sm font-black" aria-label="Language">
      {(["id", "en"] as const).map((locale) => {
        const active = current === locale;
        return (
          <button
            key={locale}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(locale)}
            className={active ? "bg-fg px-2 py-1 text-bg" : "bg-bg px-2 py-1 text-fg hover:bg-accent"}
          >
            {labels[locale]}
          </button>
        );
      })}
    </div>
  );
}
