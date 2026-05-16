import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";

vi.mock("../components/marketing/Hero", () => ({
  Hero: () => <section data-testid="hero">Hero</section>,
}));

vi.mock("../components/marketing/SocialProof", () => ({
  SocialProof: () => <section data-testid="social-proof">Social proof</section>,
}));

vi.mock("../components/marketing/Features", () => ({
  Features: () => <section data-testid="features">Features</section>,
}));

describe("home page marketing landing", () => {
  it("renders the marketing sections in spec order", () => {
    const html = renderToStaticMarkup(<Home />);

    const heroIndex = html.indexOf('data-testid="hero"');
    const socialProofIndex = html.indexOf('data-testid="social-proof"');
    const featuresIndex = html.indexOf('data-testid="features"');

    expect(heroIndex).toBeGreaterThanOrEqual(0);
    expect(socialProofIndex).toBeGreaterThan(heroIndex);
    expect(featuresIndex).toBeGreaterThan(socialProofIndex);
  });
});
