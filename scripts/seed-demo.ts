/**
 * npm run seed:demo-data — realistic demo clients, bookings, payments, vouchers and enquiries using the real service
 * catalogue, so the dashboard looks populated for the client demo. Everything is flagged is_demo = true and removed
 * by `npm run clear:demo-data`. Safe to re-run (clears previous demo data first).
 *
 * Deterministic: a seeded RNG means the same demo every time.
 */
import "./env";
import { business } from "../config/business";
import { getDb } from "../src/db/client";
import { availabilityDays, bookings, clients, enquiries, intakeForms, payments, voucherRedemptions, vouchers } from "../src/db/schema";
import { encryptJson } from "../src/lib/crypto";
import { listServices } from "../src/lib/settings";
import { addDaysIso, addMinutes, localToUtc, localWeekday, todayLocal } from "../src/lib/time";
import { clearDemoData } from "./clear-demo-data";

let seed = 20261018;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number) => rnd() < p;

const FIRST = ["Aisha", "Ben", "Chloe", "Daniel", "Ella", "Femi", "Grace", "Harry", "Imani", "Jack", "Kemi", "Liam", "Maya", "Nathan", "Olivia", "Priya", "Reece", "Sophie", "Tom", "Uche", "Zara", "Josh", "Hannah", "Kwame", "Lucy", "Marcus", "Niamh", "Owen", "Rachel", "Sam", "Tariq", "Abi", "Callum", "Jade", "Ryan", "Leah", "Ollie", "Ifeoma", "Megan", "Ade"];
const LAST = ["Okafor", "Smith", "Patel", "Hughes", "Walker", "Ahmed", "Taylor", "Brown", "Wilson", "Evans", "Thomas", "Johnson", "Roberts", "Clarke", "Lewis", "Murphy", "Adeyemi", "Khan", "Price", "Turner"];
const SPORTS = ["Running", "Running", "Running", "Football", "Rugby", "CrossFit", "Gym / weights", "Cycling", "Netball", "Boxing", "Triathlon", "Hyrox"];
const LEVELS = ["Recreational", "Regular (3+ times a week)", "Competitive / club", "Competitive / club", "Elite / professional"];
const REFERRAL = ["Instagram", "Instagram", "Instagram", "Made Running Hub", "Made Running Hub", "Google", "Friend or family", "Running club", "GP / health professional"];
const COMPLAINTS = ["Right knee pain after long runs", "Tight calves and Achilles niggle", "Lower back stiffness from desk work", "Hamstring strain from five-a-side", "Shin splints building mileage", "Shoulder pain overhead pressing", "Plantar heel pain in the mornings", "Hip flexor tightness", "Post-marathon recovery", "Ankle sprain from netball"];
const GOALS = ["Run a sub-4 marathon", "Get back to football pain-free", "Train consistently", "PB at the Manchester half", "Complete first Hyrox", "Move without stiffness"];

async function main() {
  const db = await getDb();
  await clearDemoData(db, { quiet: true });
  // ----------------------------------------------------------- availability
  // Sample hours so the demo booking page has times (Mon–Fri 8am–7pm, Sat 9am–3pm). Flagged is_demo, so
  // clear:demo-data removes them; never overwrites hours entered for real.
  const demoToday = todayLocal();
  for (let i = -150; i <= 56; i++) {
    const date = addDaysIso(demoToday, i);
    const wd = localWeekday(date);
    if (wd === 0) continue;
    const ranges = wd === 6 ? [{ open: "09:00", close: "15:00" }] : [{ open: "08:00", close: "19:00" }];
    await db.insert(availabilityDays).values({ practitionerId: business.practitioner.id, date, ranges, isDemo: true }).onConflictDoNothing();
  }

  const svc = await listServices(db);
  const byId = Object.fromEntries(svc.map((s) => [s.id, s]));
  // Weighted mix reflecting a running-hub clinic.
  const mix = ["sports-massage", "sports-massage", "sports-massage", "injury-assessment", "injury-assessment", "full-body-mot", "compression-boots", "compression-boots", "compression-boots-extended", "assisted-stretching", "dry-cupping"].filter((id) => byId[id]);

  // ---------------------------------------------------------------- clients
  const people: { id: string; email: string }[] = [];
  for (let i = 0; i < 46; i++) {
    const first = FIRST[i % FIRST.length];
    const last = pick(LAST);
    const email = `${first}.${last}${i}`.toLowerCase() + "@example.com";
    const yob = 1970 + Math.floor(rnd() * 36);
    const createdDaysAgo = Math.floor(rnd() * 150);
    const [c] = await db
      .insert(clients)
      .values({
        firstName: first,
        lastName: last,
        email,
        phone: `07700 9${String(10000 + i * 37).slice(-5)}`,
        dob: `${yob}-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 27)).padStart(2, "0")}`,
        emergencyContactEnc: encryptJson({ name: `${pick(FIRST)} ${last}`, phone: "07700 900000", relationship: pick(["Partner", "Parent", "Friend", "Sibling"]) }),
        sport: pick(SPORTS),
        trainingLevel: pick(LEVELS),
        goals: pick(GOALS),
        referralSource: pick(REFERRAL),
        marketingOptIn: chance(0.45),
        marketingOptInAt: new Date(),
        tags: chance(0.3) ? [pick(["runner", "marathon-2027", "vip", "rehab-programme"])] : [],
        isDemo: true,
        createdAt: new Date(Date.now() - createdDaysAgo * 86_400_000),
      })
      .returning();
    people.push({ id: c.id, email });
  }

  // ---------------------------------------------------------------- bookings
  const today = todayLocal();
  const start = addDaysIso(today, -120);
  let made = 0;
  for (let d = start; d <= addDaysIso(today, 21); d = addDaysIso(d, 1)) {
    const wd = localWeekday(d);
    if (wd === 0) continue; // Sunday closed
    const isPast = d < today;
    const cap = wd === 6 ? 7 : 5;
    // Busier in recent weeks and on Sat / Mon / Thu evenings.
    const base = isPast ? (d > addDaysIso(today, -45) ? 0.75 : 0.55) : 0.4;
    const n = Math.min(cap, Math.round(cap * base * (0.6 + rnd() * 0.7)));
    let minute = (wd === 6 ? 9 : 8) * 60 + (chance(0.5) ? 0 : 30);
    const close = (wd === 6 ? 15 : 19) * 60;
    for (let k = 0; k < n; k++) {
      const s = byId[pick(mix)];
      minute += chance(0.5) ? 0 : 15 * Math.floor(rnd() * 5);
      if (minute + s.durationMin > close) break;
      const startsAt = localToUtc(d, `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
      const endsAt = addMinutes(startsAt, s.durationMin);
      minute += s.durationMin + s.bufferMin;
      minute = Math.ceil(minute / 15) * 15;
      const person = people[Math.floor(Math.pow(rnd(), 1.6) * people.length)]; // some regulars
      const r = rnd();
      const status = !isPast ? "confirmed" : r < 0.86 ? "attended" : r < 0.92 ? "cancelled" : r < 0.96 ? "late_cancelled" : "no_show";
      const createdAt = new Date(startsAt.getTime() - (2 + Math.floor(rnd() * 20)) * 86_400_000);
      const paid = status === "cancelled" ? 0 : s.pricePence;
      try {
        const [b] = await db
          .insert(bookings)
          .values({
            practitionerId: business.practitioner.id,
            serviceId: s.id,
            clientId: person.id,
            status,
            source: chance(0.9) ? "online" : "admin",
            locationType: chance(0.06) && s.availableAtHome ? "home" : "clinic",
            startsAt,
            endsAt,
            bufferMin: s.bufferMin,
            occupiedUntil: addMinutes(endsAt, s.bufferMin),
            blocksTime: !s.runsConcurrently,
            pricePence: s.pricePence,
            paidPence: status === "late_cancelled" || status === "no_show" ? Math.round(s.pricePence / 2) : paid,
            feeChargedPence: status === "late_cancelled" || status === "no_show" ? Math.round(s.pricePence / 2) : 0,
            cancelledAt: status.includes("cancel") ? addMinutes(startsAt, -60 * 30) : null,
            cancelReason: status.includes("cancel") ? "client_cancelled" : null,
            isDemo: true,
            createdAt,
          })
          .returning();
        await db.insert(intakeForms).values({
          clientId: person.id,
          bookingId: b.id,
          dataEnc: encryptJson({ kind: "full", intake: { complaint: pick(COMPLAINTS), history: "", medications: "", redFlags: {} }, returning: null, dryCupping: null, compression: null, clientNotes: "" }),
          hasRedFlags: chance(0.03),
          consents: { treatment: { granted: true, at: createdAt.toISOString(), version: "2026-10" } },
        });
        if (status !== "cancelled") {
          const amount = s.pricePence;
          const refunded = status === "late_cancelled" || status === "no_show" ? Math.round(amount / 2) : 0;
          await db.insert(payments).values({
            bookingId: b.id,
            clientId: person.id,
            provider: "mock",
            providerPaymentId: `demo_pi_${b.id.slice(0, 8)}`,
            kind: "payment",
            amountPence: amount,
            refundedPence: refunded,
            status: refunded ? "partially_refunded" : "succeeded",
            description: `${s.name} · ${business.name}`,
            receiptNumber: `CW-DEMO-${b.id.slice(0, 6).toUpperCase()}`,
            isDemo: true,
            createdAt,
          });
        }
        made++;
      } catch {
        // Clashes with a real (non-demo) booking: skip that slot.
      }
    }
  }

  // ---------------------------------------------------------------- vouchers
  for (let i = 0; i < 9; i++) {
    const p = pick([
      { m: 30, v: 3500 },
      { m: 60, v: 6000 },
      { m: 90, v: 8500 },
    ]);
    const createdAt = new Date(Date.now() - Math.floor(rnd() * 100) * 86_400_000);
    const used = chance(0.4);
    const [v] = await db
      .insert(vouchers)
      .values({
        code: `CW-DEMO-${String(1000 + i)}`,
        productId: `voucher-${p.m}`,
        minutes: p.m,
        initialPence: p.v,
        balancePence: used ? 0 : p.v,
        purchaserName: `${pick(FIRST)} ${pick(LAST)}`,
        purchaserEmail: `buyer${i}@example.com`,
        recipientName: `${pick(FIRST)} ${pick(LAST)}`,
        status: used ? "redeemed" : "active",
        source: i < 2 ? "calendly_import" : "online",
        expiresAt: new Date(createdAt.getTime() + 365 * 86_400_000),
        isDemo: true,
        createdAt,
      })
      .returning();
    if (i >= 2) {
      await db.insert(payments).values({ voucherId: v.id, provider: "mock", kind: "voucher", amountPence: p.v, status: "succeeded", description: `${p.m} Minute Massage E-Gift Voucher`, isDemo: true, createdAt });
    }
    if (used) {
      const [anyBooking] = await db.select({ id: bookings.id }).from(bookings).limit(1);
      if (anyBooking) await db.insert(voucherRedemptions).values({ voucherId: v.id, bookingId: anyBooking.id, amountPence: p.v, createdAt: new Date(createdAt.getTime() + 20 * 86_400_000) });
    }
  }

  // ---------------------------------------------------------------- enquiries
  const enq = [
    { name: "Helen Marsh", email: "helen.marsh@example.com", phone: "07700 900321", postcode: "M20 2RN", serviceId: "sports-massage", preferredTimes: "Weekday evenings", message: "Recovering from hip surgery so travelling is tricky." },
    { name: "Dev Shah", email: "dev.shah@example.com", phone: "07700 900654", postcode: "M7 4XX", serviceId: "injury-assessment", preferredTimes: "Saturday morning", message: "Ankle injury, can't drive at the moment." },
    { name: "Laura Kent", email: "laura.kent@example.com", phone: "07700 900987", postcode: "M14 5QB", serviceId: "assisted-stretching", preferredTimes: "Any weekday daytime", message: "" },
  ];
  for (const [i, e] of enq.entries()) {
    await db.insert(enquiries).values({ kind: "home_visit", ...e, status: i === 0 ? "quoted" : "new", quotePence: i === 0 ? 7500 : null, isDemo: true, createdAt: new Date(Date.now() - i * 86_400_000) });
  }

  console.log(`Demo data created: ${people.length} clients, ${made} bookings, 9 vouchers, ${enq.length} enquiries.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
