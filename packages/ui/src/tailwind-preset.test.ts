import { describe, expect, it } from "vitest";
import { preset } from "./tailwind-preset";

describe("neo-brutalism tailwind preset", () => {
  it("encodes the approved color, font, and hard-shadow tokens", () => {
    const theme = preset.theme?.extend;

    expect(theme?.colors).toMatchObject({
      bg: "#f5f5f5",
      fg: "#222222",
      card: "#ffffff",
      primary: "#f6b233",
      secondary: "#5bc0be",
      accent: "#ff6b6b",
    });
    expect(theme?.fontFamily).toMatchObject({
      display: ["'Space Grotesk'", "sans-serif"],
      body: ["Inter", "sans-serif"],
    });
    expect(theme?.boxShadow).toMatchObject({
      "brutal-sm": "2px 2px 0 #222222",
      brutal: "4px 4px 0 #222222",
      "brutal-lg": "8px 8px 0 #222222",
      "brutal-btn-hover": "5px 5px 0 #222222",
    });
  });
});
