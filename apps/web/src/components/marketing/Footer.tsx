"use client";

import React from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

const FOOTER_SECTIONS = {
  product: ["features", "pricing", "changelog"],
  company: ["about", "blog", "contact"],
  resources: ["docs", "api", "status"],
  legal: ["privacy", "terms", "security"],
} as const;

export function Footer() {
  const t = useTranslations("footer");
  const tBrand = useTranslations();
  const tNav = useTranslations("nav");

  return (
    <footer className="bg-fg text-bg">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-black">{t("tagline")}</h2>
          <Link href="/signup" className="mt-6 inline-block border-2 border-bg bg-bg px-6 py-3 font-black text-fg">
            {tNav("cta")}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-8 border-t border-bg/30 pt-12 md:grid-cols-5">
          <div>
            <div className="text-xl font-black">{tBrand("brand")}</div>
            <p className="mt-2 text-sm opacity-70">{t("tagline")}</p>
          </div>
          {(Object.keys(FOOTER_SECTIONS) as Array<keyof typeof FOOTER_SECTIONS>).map((section) => (
            <div key={section}>
              <div className="mb-3 font-black">{t(`sections.${section}.title`)}</div>
              <ul className="space-y-2 text-sm opacity-80">
                {FOOTER_SECTIONS[section].map((item) => (
                  <li key={item}>{t(`sections.${section}.${item}`)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap justify-between gap-4 border-t border-bg/30 pt-6 text-sm opacity-70">
          <span>{t("rights")}</span>
          <div className="flex gap-4">
            <Link href="/admin/login">{tNav("loginAdmin")}</Link>
            <Link href="/find-tenant">{tNav("loginTenant")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
