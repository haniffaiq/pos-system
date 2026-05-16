"use client";

import * as Sentry from "@sentry/nextjs";
import React, { useEffect } from "react";
import { Button, Card } from "@app/ui";

type RouteErrorVariant = "root" | "auth" | "tenant";

type RouteErrorCopy = {
  eyebrow: string;
  title: string;
  body: string;
  support: string;
};

const copyByVariant: Record<RouteErrorVariant, RouteErrorCopy> = {
  root: {
    eyebrow: "BroSolution",
    title: "We hit a snag.",
    body: "This route could not load, but your business data and session details stay protected.",
    support: "If the problem continues, share the time of the failure with support.",
  },
  auth: {
    eyebrow: "Secure sign-in",
    title: "Sign-in is temporarily unavailable.",
    body: "Your credentials are safe. Try again or contact support if this keeps happening.",
    support: "We never show passwords, cookies, or tokens on this error screen.",
  },
  tenant: {
    eyebrow: "Workspace recovery",
    title: "Tenant workspace hit an error.",
    body: "POS, inventory, and reports stay protected while we recover this screen.",
    support: "Try again, then contact your admin if the workspace still does not load.",
  },
};

export function RouteErrorBoundary({
  error,
  reset,
  variant,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  variant: RouteErrorVariant;
}) {
  const copy = copyByVariant[variant];

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-fg">
      <Card className="max-w-xl border-red-500 bg-card p-8 shadow-[8px_8px_0_#ef4444]">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-red-600">{copy.eyebrow}</p>
        <h1 className="mt-3 font-display text-3xl font-black sm:text-4xl">{copy.title}</h1>
        <p className="mt-4 text-base leading-7 text-fg/80">{copy.body}</p>
        <p className="mt-2 text-sm text-fg/70">{copy.support}</p>
        <Button className="mt-6" onClick={reset} type="button" variant="primary">
          Coba lagi
        </Button>
      </Card>
    </main>
  );
}
