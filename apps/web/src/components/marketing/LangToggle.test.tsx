import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LangToggle } from "./LangToggle";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("LangToggle", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders both locales and marks the current locale", () => {
    render(<LangToggle current="id" />);

    const id = screen.getByRole("button", { name: "ID" });
    const en = screen.getByRole("button", { name: "EN" });

    expect(id).toBeTruthy();
    expect(en).toBeTruthy();
    expect(id.getAttribute("aria-pressed")).toBe("true");
    expect(en.getAttribute("aria-pressed")).toBe("false");
  });

  it("persists the selected locale then refreshes server-rendered copy", async () => {
    render(<LangToggle current="id" />);

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/lang", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: "en" }),
      });
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not refresh when the locale cannot be persisted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_locale" }), { status: 400 })));
    render(<LangToggle current="id" />);

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce();
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not refresh when the locale request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<LangToggle current="id" />);

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce();
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
