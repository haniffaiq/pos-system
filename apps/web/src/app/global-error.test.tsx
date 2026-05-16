import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import GlobalError from "./global-error";

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

describe("global error boundary", () => {
  it("reports render errors to Sentry and avoids exposing error details", async () => {
    const error = new Error("database password leaked");

    render(<GlobalError error={error} reset={vi.fn()} />);

    expect(screen.getByText("We could not load this page.")).toBeTruthy();
    expect(screen.queryByText("database password leaked")).toBeNull();
    await waitFor(() => expect(captureExceptionMock).toHaveBeenCalledWith(error));
  });
});
