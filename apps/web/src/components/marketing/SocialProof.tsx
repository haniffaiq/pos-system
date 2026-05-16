"use client";

import React from "react";
import { useTranslations } from "next-intl";

const LOGOS = ["Toko Sumber Rejeki", "Grosir Makmur", "UD Berkah", "PT Nusantara", "CV Maju Jaya"] as const;

export function SocialProof() {
  const t = useTranslations();

  return (
    <section className="border-b-2 border-fg bg-card" aria-labelledby="social-proof-heading">
      <div className="mx-auto max-w-7xl px-4 py-10 text-center sm:px-6">
        <h2 id="social-proof-heading" className="text-sm font-bold uppercase tracking-wide text-fg/60">
          {t("social")}
        </h2>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 sm:gap-8" aria-label={t("social")}>
          {LOGOS.map((name) => (
            <span key={name} className="border-2 border-fg bg-bg px-3 py-1 text-lg font-black shadow-brutal-sm">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
