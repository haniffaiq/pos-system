import React from "react";
import { Header } from "../components/marketing/Header";
import { Features } from "../components/marketing/Features";
import { Hero } from "../components/marketing/Hero";
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
      </main>
    </>
  );
}
