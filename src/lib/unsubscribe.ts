import { hmacSign, safeEqual } from "@/lib/crypto";

/** Signed, non-expiring unsubscribe token (no personal data in the URL beyond an opaque ID). */
export function signUnsubscribe(clientId: string) {
  return `${clientId}.${hmacSign(`unsub:${clientId}`)}`;
}

export function verifyUnsubscribe(token: string): string | null {
  const [id, sig] = token.split(".");
  if (!id || !sig) return null;
  return safeEqual(sig, hmacSign(`unsub:${id}`)) ? id : null;
}
