import { forbidInStrict } from "@/lib/env";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Field-level encryption for special-category (health) data: AES-256-GCM.
 * Key: DATA_ENCRYPTION_KEY (base64, 32 bytes). In development a key is derived from a fixed string so the app runs
 * without configuration — never deploy without a real key (check:placeholders + README cover this).
 */
let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    cachedKey = buf;
  } else {
    forbidInStrict("The development encryption key (DATA_ENCRYPTION_KEY is not set)");
    if (!process.env.VITEST) console.warn("[crypto] DATA_ENCRYPTION_KEY not set — using an insecure development key");
    cachedKey = scryptSync("cw-performance-lab-dev-key", "dev-salt", 32);
  }
  return cachedKey;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decrypt(payload: string): string {
  const [v, ivB, tagB, dataB] = payload.split(".");
  if (v !== "v1" || !ivB || !tagB || !dataB) throw new Error("Bad ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64url")), decipher.final()]).toString("utf8");
}

export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}
export function decryptJson<T>(payload: string | null | undefined): T | null {
  if (!payload) return null;
  return JSON.parse(decrypt(payload)) as T;
}

/** Opaque URL-safe token (manage links, payment links, sessions). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hash for storing tokens (we never store the raw token). */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSign(input: string, secret = sessionSecret()): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  forbidInStrict("The development session secret (SESSION_SECRET is not set)");
  return "dev-session-secret-change-me";
}

/** Human-friendly voucher / recovery code, no ambiguous characters. */
export function friendlyCode(groups = 3, len = 4): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(groups * len);
  const out: string[] = [];
  for (let gi = 0; gi < groups; gi++) {
    let s = "";
    for (let i = 0; i < len; i++) s += alphabet[bytes[gi * len + i] % alphabet.length];
    out.push(s);
  }
  return out.join("-");
}
