/**
 * Browser error monitoring (PRE-DEPLOY-FIXES #11). NEXT_PUBLIC_SENTRY_DSN is inlined at build time, so without it
 * the Sentry SDK isn't even downloaded.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  import("@/lib/monitoring")
    .then((m) => m.initMonitoring("client"))
    .catch(() => {
      // Monitoring must never stop the site from working.
    });
}
