import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

describe("home page scaffold", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the neo-brutalist landing card with navigation hints", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("Operational Web App");
    expect(html).toContain("Go to /admin/login or /t/&lt;slug&gt;/login");
    expect(html).toContain("border-fg");
    expect(html).toContain("shadow-brutal");
  });

  it("renders NEXT_PUBLIC_API_URL so container runtime env is respected", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.internal:4000");

    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("API URL: http://api.internal:4000");
  });
});
