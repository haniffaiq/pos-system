import React from "react";
import { FAQ } from "../components/marketing/FAQ";
import { Features } from "../components/marketing/Features";
import { Footer } from "../components/marketing/Footer";
import { Header } from "../components/marketing/Header";
import { Hero } from "../components/marketing/Hero";
import { Pricing } from "../components/marketing/Pricing";
import { Screenshot } from "../components/marketing/Screenshot";
import { SocialProof } from "../components/marketing/SocialProof";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <SocialProof />
        <Features />
        <Screenshot />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
