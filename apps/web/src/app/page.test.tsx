import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";

vi.mock("../components/marketing/Hero", () => ({
  Hero: () => <section data-testid="hero">Hero</section>,
}));

vi.mock("../components/marketing/Header", () => ({
  Header: () => <header data-testid="marketing-header">Header</header>,
}));

vi.mock("../components/marketing/SocialProof", () => ({
  SocialProof: () => <section data-testid="social-proof">Social proof</section>,
}));

vi.mock("../components/marketing/Features", () => ({
  Features: () => <section data-testid="features">Features</section>,
}));

vi.mock("../components/marketing/Screenshot", () => ({
  Screenshot: () => <section data-testid="screenshot">Screenshot</section>,
}));

vi.mock("../components/marketing/Pricing", () => ({
  Pricing: () => <section data-testid="pricing">Pricing</section>,
}));

vi.mock("../components/marketing/FAQ", () => ({
  FAQ: () => <section data-testid="faq">FAQ</section>,
}));

vi.mock("../components/marketing/Footer", () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}));

describe("home page marketing landing", () => {
  it("renders the marketing header and sections in spec order", () => {
    const html = renderToStaticMarkup(<Home />);

    const headerIndex = html.indexOf('data-testid="marketing-header"');
    const heroIndex = html.indexOf('data-testid="hero"');
    const socialProofIndex = html.indexOf('data-testid="social-proof"');
    const featuresIndex = html.indexOf('data-testid="features"');
    const screenshotIndex = html.indexOf('data-testid="screenshot"');
    const pricingIndex = html.indexOf('data-testid="pricing"');
    const faqIndex = html.indexOf('data-testid="faq"');
    const footerIndex = html.indexOf('data-testid="footer"');

    expect(headerIndex).toBeGreaterThanOrEqual(0);
    expect(heroIndex).toBeGreaterThan(headerIndex);
    expect(socialProofIndex).toBeGreaterThan(heroIndex);
    expect(featuresIndex).toBeGreaterThan(socialProofIndex);
    expect(screenshotIndex).toBeGreaterThan(featuresIndex);
    expect(pricingIndex).toBeGreaterThan(screenshotIndex);
    expect(faqIndex).toBeGreaterThan(pricingIndex);
    expect(footerIndex).toBeGreaterThan(faqIndex);
  });
});
