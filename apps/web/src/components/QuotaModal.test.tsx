import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QuotaModal } from "./QuotaModal";

describe("QuotaModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("opens from a quota-exceeded event with usage details and can be dismissed", async () => {
    await act(async () => {
      root.render(<QuotaModal />);
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("quota-exceeded", {
          detail: { metric: "skus", current: 100, limit: 100, upgrade_url: "/t/demo/billing" },
        }),
      );
    });

    expect(container.textContent).toContain("Kuota tercapai");
    expect(container.textContent).toContain("Produk (SKU)");
    expect(container.textContent).toContain("100 / 100");
    expect(container.querySelector<HTMLAnchorElement>('a[href="/t/demo/billing"]')?.textContent).toContain("Upgrade");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[type="button"]')?.click();
    });

    expect(container.textContent).not.toContain("Kuota tercapai");
  });
});
