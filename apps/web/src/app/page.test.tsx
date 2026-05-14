import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("home page scaffold", () => {
  it("renders the neo-brutalist landing card with navigation hints", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("Operational Web App");
    expect(html).toContain("Go to /admin/login or /t/&lt;slug&gt;/login");
    expect(html).toContain("border-fg");
    expect(html).toContain("shadow-brutal");
  });
});
