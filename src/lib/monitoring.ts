/**
 * Error monitoring (PRE-DEPLOY-FIXES #11). Sentry, switched off entirely unless a DSN is set:
 * SENTRY_DSN on the server, NEXT_PUBLIC_SENTRY_DSN in the browser (they're normally the same value).
 *
 * Privacy: `sendDefaultPii: false` (no IPs, cookies or user details) and every event and breadcrumb goes through
 * `scrubEvent`, which drops request bodies and replaces emails and phone numbers. No session replay and no tracing,
 * so nothing that shows a client's screen or form inputs is ever sent.
 */
import * as Sentry from "@sentry/nextjs";
import { isStrict } from "@/lib/env";
import { scrubEvent, scrubString } from "@/lib/scrub";

let enabled = false;

export function sentryOptions(dsn: string, side: "server" | "client") {
  return {
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    includeLocalVariables: false,
    maxBreadcrumbs: side === "client" ? 20 : 50,
    beforeSend: (event: Sentry.ErrorEvent) => scrubEvent(event),
    beforeBreadcrumb: (b: Sentry.Breadcrumb) => {
      // Form/input breadcrumbs from the browser can carry what was typed; console breadcrumbs can carry anything.
      if (b.category === "ui.input") return null;
      return { ...b, message: b.message ? scrubString(b.message) : b.message, data: b.data ? (scrubEvent({ data: b.data }).data as typeof b.data) : b.data };
    },
  };
}

export function initMonitoring(side: "server" | "client") {
  const dsn = side === "server" ? (process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN) : process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (side === "server" && isStrict()) console.warn("[monitoring] SENTRY_DSN is not set: errors in production are not being reported.");
    return;
  }
  if (enabled) return;
  Sentry.init(sentryOptions(dsn, side));
  enabled = true;
}

/** Report an error that was caught and handled (so Next.js won't see it), e.g. a failed webhook or cron step. */
export function reportError(err: unknown, context: Record<string, string> = {}) {
  if (!enabled) return;
  Sentry.captureException(err, { tags: context });
}

/** Next.js calls this for uncaught errors in server components, route handlers and server actions. */
export async function onRequestError(...args: Parameters<typeof Sentry.captureRequestError>) {
  if (!enabled) return;
  Sentry.captureRequestError(...args);
}
