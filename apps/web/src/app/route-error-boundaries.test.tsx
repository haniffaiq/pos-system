import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import RootRouteError from "./error";
import AuthRouteError from "./(auth)/error";
import TenantRouteError from "./t/[slug]/error";

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("route error boundaries", () => {
  it("renders a branded root fallback and reports the error to Sentry", async () => {
    const error = new Error("root token leaked");
    const reset = vi.fn();

    render(<RootRouteError error={error} reset={reset} />);

    expect(screen.getByText("BroSolution"));
    expect(screen.getByRole("heading", { name: "We hit a snag." }));
    expect(screen.getByRole("button", { name: "Coba lagi" }));
    expect(screen.queryByText("root token leaked")).toBeNull();
    await waitFor(() => expect(captureExceptionMock).toHaveBeenCalledWith(error));
  });

  it("renders a sign-in specific fallback", async () => {
    const error = new Error("auth cookie leaked");

    render(<AuthRouteError error={error} reset={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Sign-in is temporarily unavailable." }));
    expect(screen.getByText("Your credentials are safe. Try again or contact support if this keeps happening."));
    expect(screen.queryByText("auth cookie leaked")).toBeNull();
    await waitFor(() => expect(captureExceptionMock).toHaveBeenCalledWith(error));
  });

  it("renders a tenant workspace fallback", async () => {
    const error = new Error("tenant secret leaked");

    render(<TenantRouteError error={error} reset={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Tenant workspace hit an error." }));
    expect(screen.getByText("POS, inventory, and reports stay protected while we recover this screen."));
    expect(screen.queryByText("tenant secret leaked")).toBeNull();
    await waitFor(() => expect(captureExceptionMock).toHaveBeenCalledWith(error));
  });
});
