"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { Locale } from "@/i18n";
import { LangToggle } from "./LangToggle";

export function Header({ locale }: { locale: Locale }) {
  const t = useTranslations("nav");
  const tRoot = useTranslations();
  const [loginOpen, setLoginOpen] = useState(false);

  const navLinks = [
    { href: "#features", label: t("features") },
    { href: "#pricing", label: t("pricing") },
    { href: "#faq", label: t("faq") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b-2 border-fg bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" aria-label={t("homeAria")} className="text-2xl font-black tracking-tight">
          {tRoot("brand")}
        </Link>

        <nav aria-label={t("sectionsAria")} className="hidden items-center gap-6 text-sm font-bold md:flex">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="underline-offset-4 hover:underline">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LangToggle current={locale} />

          <div className="relative">
            <button
              type="button"
              aria-expanded={loginOpen}
              aria-haspopup="menu"
              onClick={() => setLoginOpen((open) => !open)}
              className="border-2 border-fg px-3 py-2 text-sm font-bold hover:bg-fg/10"
            >
              {t("login")} ▾
            </button>

            {loginOpen ? (
              <div
                role="menu"
                className="absolute right-0 mt-2 min-w-[180px] border-2 border-fg bg-bg shadow-brutal"
              >
                <Link role="menuitem" href="/admin/login" className="block px-3 py-2 text-sm font-bold hover:bg-fg/10">
                  {t("loginAdmin")}
                </Link>
                <Link role="menuitem" href="/find-tenant" className="block px-3 py-2 text-sm font-bold hover:bg-fg/10">
                  {t("loginTenant")}
                </Link>
              </div>
            ) : null}
          </div>

          <Link
            href="/signup"
            className="hidden border-2 border-fg bg-fg px-4 py-2 text-sm font-black text-bg shadow-brutal transition-transform hover:-translate-y-0.5 sm:inline-block"
          >
            {t("cta")}
          </Link>
        </div>
      </div>
    </header>
  );
}
