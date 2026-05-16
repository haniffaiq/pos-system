"use client";

import React from "react";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";

export default function RootRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary error={error} reset={reset} variant="root" />;
}
