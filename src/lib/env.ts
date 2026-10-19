/**
 * Runtime mode + environment validation (PRE-DEPLOY-FIXES #1).
 *
 *  - "production": VERCEL_ENV=production, or NODE_ENV=production anywhere that isn't clearly a local machine
 *    (fails closed: a production build with no NEXT_PUBLIC_SITE_URL counts as production).
 *  - "preview":    VERCEL_ENV=preview (staging). Stripe test keys allowed; a real database is still required.
 *  - "local":      dev, tests, or `next start` with NEXT_PUBLIC_SITE_URL on localhost (mocks/fallbacks allowed).
 *
 * In production and preview the app never falls back to mocks, an embedded database, console email or open bot
 * protection. Missing configuration throws at startup instead.
 */
export type RuntimeMode = "production" | "preview" | "local";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

function isLocalUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return LOCAL_HOSTS.has(h) || h.endsWith(".localhost");
  } catch {
    return false;
  }
}

export function runtimeMode(env: NodeJS.ProcessEnv = process.env): RuntimeMode {
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "preview";
  if (env.NODE_ENV !== "production") return "local";
  return isLocalUrl(env.NEXT_PUBLIC_SITE_URL) ? "local" : "production";
}

/** Production or preview: no mocks, no embedded DB, no silent fallbacks. */
export function isStrict(env: NodeJS.ProcessEnv = process.env): boolean {
  return runtimeMode(env) !== "local";
}

export class EnvError extends Error {
  constructor(public missing: string[], mode: RuntimeMode) {
    super(`Refusing to start in ${mode} mode. Missing or invalid environment: ${missing.join(", ")}`);
    this.name = "EnvError";
  }
}

/**
 * Throws if the environment can't safely serve real clients. Called from instrumentation `register()` (server start)
 * and from the production build (scripts/prebuild.ts).
 * @param opts.smsReminders whether SMS reminders are switched on (defaults to the seed config).
 */
export function assertProductionEnv(env: NodeJS.ProcessEnv = process.env, opts: { smsReminders?: boolean } = {}) {
  const mode = runtimeMode(env);
  if (mode === "local") return { mode, checked: [] as string[] };

  const has = (k: string) => Boolean(env[k] && env[k]!.trim());
  const missing: string[] = [];
  const need = (keys: string[]) => keys.forEach((k) => !has(k) && missing.push(k));

  // Always required off-local: real database, encryption, sessions, real payments.
  need(["DATABASE_URL", "DATA_ENCRYPTION_KEY", "SESSION_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_SITE_URL"]);

  if (mode === "production") {
    need(["CRON_SECRET", "RESEND_API_KEY", "EMAIL_FROM", "TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"]);
    if (opts.smsReminders ?? true) need(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]);
    if (env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) missing.push("STRIPE_SECRET_KEY (test key in production)");
    if (isLocalUrl(env.NEXT_PUBLIC_SITE_URL)) missing.push("NEXT_PUBLIC_SITE_URL (localhost in production)");
  }
  if (env.DATA_ENCRYPTION_KEY && Buffer.from(env.DATA_ENCRYPTION_KEY, "base64").length !== 32) missing.push("DATA_ENCRYPTION_KEY (must be 32 bytes, base64)");
  if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) missing.push("SESSION_SECRET (use 32+ characters)");

  if (missing.length) throw new EnvError(missing, mode);
  return { mode, checked: ["ok"] };
}

/** Throw if a mock/fallback is about to be used where it must not be. */
export function forbidInStrict(what: string) {
  if (isStrict()) throw new Error(`${what} is not allowed in ${runtimeMode()} mode. Check the environment configuration.`);
}
