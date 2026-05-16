"use client";

import React from "react";
import { useTranslations } from "next-intl";

const FEATURE_KEYS = ["pos", "stock", "report", "rbac", "audit", "export"] as const;

const FEATURE_ACCENTS: Record<(typeof FEATURE_KEYS)[number], string> = {
  pos: "bg-primary",
  stock: "bg-secondary",
  report: "bg-accent",
  rbac: "bg-card",
  audit: "bg-primary",
  export: "bg-secondary",
};

export function Features() {
  const t = useTranslations("features");

  return (
    <section id="features" className="border-b-2 border-fg" aria-labelledby="features-heading">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <h2 id="features-heading" className="text-center text-4xl font-black">
          {t("title")}
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURE_KEYS.map((key) => (
            <article key={key} className="border-2 border-fg bg-bg p-6 shadow-brutal">
              <div className={`mb-5 h-3 w-16 border-2 border-fg ${FEATURE_ACCENTS[key]}`} aria-hidden="true" />
              <h3 className="text-xl font-black">{t(`items.${key}.title`)}</h3>
              <p className="mt-2 text-fg/80">{t(`items.${key}.body`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
