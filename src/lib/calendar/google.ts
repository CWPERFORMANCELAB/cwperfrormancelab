/**
 * Google Calendar two-way sync (optional — the system works without it).
 *  - Outbound: confirmed bookings are written to his calendar; cancellations remove them.
 *  - Inbound: busy events from his calendar become `blocked_times` (source = google) so personal events block slots.
 * Uses the REST API directly (no googleapis dependency). Connect from /admin/settings/calendar.
 */
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { business } from "@config/business";
import type { Db, DbOrTx } from "@/db/client";
import { blockedTimes, bookings, calendarConnections, clients, services } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { siteUrl } from "@/lib/url";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly", "openid", "email"];

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleAuthUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: siteUrl("/api/calendar/google/callback"),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES.join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(db: Db, code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: siteUrl("/api/calendar/google/callback"),
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as { refresh_token?: string; id_token?: string; error?: string };
  if (!json.refresh_token) throw new Error(json.error ?? "Google did not return a refresh token");
  let email: string | null = null;
  if (json.id_token) {
    try {
      email = JSON.parse(Buffer.from(json.id_token.split(".")[1], "base64url").toString()).email ?? null;
    } catch {}
  }
  await db.delete(calendarConnections).where(eq(calendarConnections.practitionerId, business.practitioner.id));
  await db.insert(calendarConnections).values({ practitionerId: business.practitioner.id, refreshTokenEnc: encrypt(json.refresh_token), accountEmail: email });
}

async function connection(db: DbOrTx) {
  if (!googleConfigured()) return null;
  const [c] = await db.select().from(calendarConnections).where(eq(calendarConnections.practitionerId, business.practitioner.id));
  return c ?? null;
}

async function accessToken(refreshTokenEnc: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: decrypt(refreshTokenEnc),
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!json.access_token) throw new Error(`Google token refresh failed: ${json.error}`);
  return json.access_token;
}

async function gfetch(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google API ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

/** Outbound: create/update the event for a confirmed booking. No client health data is written to Google. */
export async function pushBookingToCalendar(db: DbOrTx, bookingId: string) {
  const conn = await connection(db);
  if (!conn) return;
  const [row] = await db
    .select({ b: bookings, s: services, c: clients })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(clients, eq(clients.id, bookings.clientId))
    .where(eq(bookings.id, bookingId));
  if (!row || row.b.status !== "confirmed") return;
  const token = await accessToken(conn.refreshTokenEnc);
  const event = {
    summary: `${row.s.shortName}: ${row.c ? `${row.c.firstName} ${row.c.lastName.charAt(0)}.` : "Client"}`,
    description: `Booked via ${business.name}\n${siteUrl(`/admin/bookings/${row.b.id}`)}`,
    start: { dateTime: row.b.startsAt.toISOString() },
    end: { dateTime: row.b.endsAt.toISOString() },
    location: row.b.locationType === "home" ? "Home visit" : `${business.address.venue}, ${business.address.postcode}`,
    extendedProperties: { private: { cwBookingId: row.b.id } },
  };
  if (row.b.googleEventId) {
    await gfetch(token, `/calendars/${encodeURIComponent(conn.calendarId)}/events/${row.b.googleEventId}`, { method: "PUT", body: JSON.stringify(event) });
  } else {
    const created = (await gfetch(token, `/calendars/${encodeURIComponent(conn.calendarId)}/events`, { method: "POST", body: JSON.stringify(event) })) as { id?: string } | null;
    if (created?.id) await db.update(bookings).set({ googleEventId: created.id }).where(eq(bookings.id, row.b.id));
  }
}

export async function removeBookingFromCalendar(db: DbOrTx, bookingId: string) {
  const conn = await connection(db);
  if (!conn) return;
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b?.googleEventId) return;
  const token = await accessToken(conn.refreshTokenEnc);
  await gfetch(token, `/calendars/${encodeURIComponent(conn.calendarId)}/events/${b.googleEventId}`, { method: "DELETE" });
  await db.update(bookings).set({ googleEventId: null }).where(eq(bookings.id, b.id));
}

/** Inbound: mirror busy events for the next 120 days into blocked_times (skipping our own booking events). */
export async function syncBusyFromGoogle(db: Db, now = new Date()) {
  const conn = await connection(db);
  if (!conn) return { synced: 0, skipped: true };
  try {
    const token = await accessToken(conn.refreshTokenEnc);
    const timeMax = new Date(now.getTime() + 120 * 86_400_000);
    const items: { id: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; transparency?: string; status?: string; extendedProperties?: { private?: Record<string, string> } }[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ timeMin: now.toISOString(), timeMax: timeMax.toISOString(), singleEvents: "true", maxResults: "250", ...(pageToken ? { pageToken } : {}) });
      const page = (await gfetch(token, `/calendars/${encodeURIComponent(conn.calendarId)}/events?${q}`)) as { items?: typeof items; nextPageToken?: string };
      items.push(...(page?.items ?? []));
      pageToken = page?.nextPageToken;
    } while (pageToken);

    const busy = items.filter((e) => e.status !== "cancelled" && e.transparency !== "transparent" && !e.extendedProperties?.private?.cwBookingId);
    const ids: string[] = [];
    for (const e of busy) {
      const start = e.start?.dateTime ? new Date(e.start.dateTime) : e.start?.date ? new Date(`${e.start.date}T00:00:00Z`) : null;
      const end = e.end?.dateTime ? new Date(e.end.dateTime) : e.end?.date ? new Date(`${e.end.date}T00:00:00Z`) : null;
      if (!start || !end || end <= start) continue;
      ids.push(e.id);
      await db
        .insert(blockedTimes)
        .values({ practitionerId: conn.practitionerId, startsAt: start, endsAt: end, reason: "Google Calendar", source: "google", externalId: e.id })
        .onConflictDoUpdate({ target: [blockedTimes.source, blockedTimes.externalId], set: { startsAt: start, endsAt: end } });
    }
    // Remove mirrored events that were deleted in Google.
    await db
      .delete(blockedTimes)
      .where(and(eq(blockedTimes.source, "google"), ids.length ? notInArray(blockedTimes.externalId, ids) : inArray(blockedTimes.source, ["google"])));
    await db.update(calendarConnections).set({ lastSyncedAt: new Date(), lastError: null }).where(eq(calendarConnections.id, conn.id));
    return { synced: ids.length, skipped: false };
  } catch (err) {
    await db.update(calendarConnections).set({ lastError: String(err).slice(0, 400) }).where(eq(calendarConnections.id, conn.id));
    return { synced: 0, skipped: false, error: String(err) };
  }
}
