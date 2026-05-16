import * as Sentry from "@sentry/nextjs";

import { initSentry } from "./src/lib/sentry";

initSentry();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
