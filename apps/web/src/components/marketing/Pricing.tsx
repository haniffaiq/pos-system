"use client";

import React from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

const QUOTA_ROWS = ["users", "skus", "tx", "exports", "outlets", "history", "support", "api", "customDomain", "auditUI"] as const;

const TIERS = [
  {
    code: "free",
    quota: ["2", "100", "500", "5", "1", "values.days30", "values.community", "values.no", "values.no", "values.no"],
  },
  {
    code: "pro",
    quota: ["10", "5.000", "20.000", "100", "3", "values.year1", "values.email24", "values.no", "values.no", "values.yes"],
  },
  {
    code: "business",
    quota: ["values.unlimited", "values.unlimited", "values.unlimited", "values.unlimited", "values.unlimited", "values.forever", "values.priorityWa", "values.yes", "values.yes", "values.yes"],
  },
] as const;

function quotaValue(t: ReturnType<typeof useTranslations>, value: string) {
  return value.startsWith("values.") ? t(value) : value;
}

export function Pricing() {
  const t = useTranslations("pricing");

  return (
    <section id="pricing" className="border-b-2 border-fg">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-4xl font-black">{t("title")}</h2>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {TIERS.map((tier) => {
            const isPopular = tier.code === "pro";

            return (
              <div
                key={tier.code}
                className={`border-2 border-fg p-6 ${
                  isPopular ? "bg-fg text-bg shadow-brutal md:scale-105" : "bg-bg shadow-brutal"
                }`}
              >
                {isPopular ? <div className="text-xs font-black uppercase">{t("popular")}</div> : null}
                <h3 className="mt-2 text-2xl font-black">{t(`${tier.code}.name`)}</h3>
                <div className="mt-2 text-3xl font-black">
                  {t(`${tier.code}.price`)}
                  <span className="text-sm font-bold">{t("monthly")}</span>
                </div>
                <ul className="mt-6 space-y-2 text-sm">
                  {QUOTA_ROWS.map((key, index) => (
                    <li key={key} className="flex justify-between gap-4 border-b border-current/20 pb-1">
                      <span>{t(`rows.${key}`)}</span>
                      <strong>{quotaValue(t, tier.quota[index])}</strong>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-8 block border-2 border-current px-4 py-2 text-center font-black ${
                    isPopular ? "bg-bg text-fg" : "bg-fg text-bg"
                  }`}
                >
                  {t("cta")}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
