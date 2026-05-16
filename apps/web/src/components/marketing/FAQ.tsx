"use client";

import { useTranslations } from "next-intl";
import React from "react";
import { useState } from "react";

const FAQ_KEYS = ["trial", "payment", "refund", "data", "branch", "support"] as const;

export function FAQ() {
  const t = useTranslations("faq");
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section id="faq" className="border-b-2 border-fg bg-card">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-4xl font-black">{t("title")}</h2>
        <div className="mt-12 space-y-3">
          {FAQ_KEYS.map((key) => {
            const isOpen = open === key;

            return (
              <div key={key} className="border-2 border-fg bg-bg">
                <button
                  type="button"
                  className="flex w-full justify-between gap-4 px-4 py-3 text-left font-black"
                  onClick={() => setOpen(isOpen ? null : key)}
                  aria-expanded={isOpen}
                >
                  <span>{t(`items.${key}.q`)}</span>
                  <span aria-hidden>{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen ? <div className="px-4 pb-4 text-fg/80">{t(`items.${key}.a`)}</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
