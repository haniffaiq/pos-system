import React from "react";
import { getLocale } from "next-intl/server";
import { Header } from "../components/marketing/Header";
import { Features } from "../components/marketing/Features";
import { Hero } from "../components/marketing/Hero";
import { SocialProof } from "../components/marketing/SocialProof";

type MarketingLocale = "id" | "en";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestLocale = await getLocale();
  const locale: MarketingLocale = requestLocale === "en" ? "en" : "id";

  return (
    <>
      <Header locale={locale} />
      <main>
        <Hero />
        <SocialProof />
        <Features />
      </main>
    </>
  );
}
