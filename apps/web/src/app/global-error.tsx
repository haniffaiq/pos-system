"use client";

import * as Sentry from "@sentry/nextjs";
import React, { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="min-h-screen bg-neutral-950 px-6 py-16 text-white">
          <div className="mx-auto max-w-xl rounded-2xl border border-red-400 bg-neutral-900 p-8 shadow-[8px_8px_0_#f87171]">
            <p className="text-sm font-semibold uppercase tracking-wide text-red-300">Something went wrong</p>
            <h1 className="mt-3 text-3xl font-black">We could not load this page.</h1>
            <p className="mt-4 text-neutral-300">The error was reported without cookies, tokens, or personal data.</p>
            <button
              className="mt-6 rounded-lg border border-white bg-white px-4 py-2 font-bold text-neutral-950"
              onClick={reset}
              type="button"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
