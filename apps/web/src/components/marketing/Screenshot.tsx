"use client";

import React from "react";
import { useTranslations } from "next-intl";

export function Screenshot() {
  const t = useTranslations("screenshot");

  return (
    <section id="screenshot" className="border-b-2 border-fg bg-card">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-2">
        <div className="border-2 border-fg bg-bg shadow-brutal">
          <div className="flex aspect-video items-center justify-center p-6">
            <span className="font-bold text-fg/40">[App screenshot]</span>
          </div>
        </div>
        <div>
          <h2 className="text-4xl font-black">{t("title")}</h2>
          <p className="mt-4 text-lg text-fg/80">{t("body")}</p>
        </div>
      </div>
    </section>
  );
}
