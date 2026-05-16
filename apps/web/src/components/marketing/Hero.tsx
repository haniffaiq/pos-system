"use client";

import React from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

export function Hero() {
  const t = useTranslations("hero");

  return (
    <section className="border-b-2 border-fg bg-bg" aria-labelledby="marketing-hero-title">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-2 lg:py-24">
        <div>
          <p className="inline-flex border-2 border-fg bg-card px-3 py-1 text-sm font-black uppercase tracking-wide shadow-brutal">
            BroSolution
          </p>
          <h1 id="marketing-hero-title" className="mt-6 text-5xl font-black leading-tight md:text-6xl">
            {t("title")}
          </h1>
          <p className="mt-6 max-w-prose text-lg font-medium text-fg/80">{t("subtitle")}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/signup" className="border-2 border-fg bg-fg px-6 py-3 font-black text-bg shadow-brutal transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-accent">
              {t("ctaPrimary")}
            </Link>
            <a href="#screenshot" className="border-2 border-fg bg-bg px-6 py-3 font-black text-fg shadow-brutal transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-accent">
              {t("ctaSecondary")}
            </a>
          </div>
        </div>

        <div className="relative border-2 border-fg bg-card p-5 shadow-brutal" aria-label="Operational Grosir dashboard preview">
          <div className="mb-4 flex items-center justify-between border-b-2 border-fg pb-3">
            <span className="text-sm font-black uppercase tracking-wide">Operational Grosir</span>
            <span className="rounded-full border-2 border-fg bg-accent px-3 py-1 text-xs font-black">LIVE</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {["POS", "Stok", "Laporan"].map((label) => (
              <div key={label} className="border-2 border-fg bg-bg p-3 shadow-brutal-sm">
                <p className="text-xs font-bold text-fg/60">{label}</p>
                <div className="mt-3 h-3 w-3/4 bg-fg" />
                <div className="mt-2 h-3 w-1/2 bg-fg/30" />
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
            <div className="border-2 border-fg bg-bg p-4">
              <div className="h-4 w-2/3 bg-fg" />
              <div className="mt-4 space-y-2">
                <div className="h-3 bg-fg/25" />
                <div className="h-3 bg-fg/25" />
                <div className="h-3 w-3/4 bg-fg/25" />
              </div>
            </div>
            <div className="border-2 border-fg bg-fg p-4 text-bg">
              <p className="text-xs font-bold uppercase">Margin</p>
              <p className="mt-3 text-3xl font-black">32%</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
