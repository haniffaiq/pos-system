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

describe("home page marketing landing", () => {
  it("renders the marketing header and sections in spec order", () => {
    const html = renderToStaticMarkup(<Home />);

    const headerIndex = html.indexOf('data-testid="marketing-header"');
    const heroIndex = html.indexOf('data-testid="hero"');
    const socialProofIndex = html.indexOf('data-testid="social-proof"');
    const featuresIndex = html.indexOf('data-testid="features"');

    expect(headerIndex).toBeGreaterThanOrEqual(0);
    expect(heroIndex).toBeGreaterThan(headerIndex);
    expect(socialProofIndex).toBeGreaterThan(heroIndex);
    expect(featuresIndex).toBeGreaterThan(socialProofIndex);
  });
});
