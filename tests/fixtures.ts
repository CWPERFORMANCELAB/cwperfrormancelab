import type { Db } from "@/db/client";
import type { DetailsInput } from "@/lib/booking/service";
import { localToUtc } from "@/lib/time";

export const NOW = new Date("2027-01-01T09:00:00Z");
export const at = (date: string, hhmm: string) => localToUtc(date, hhmm);

const no = "no" as const;
export const redFlagsNo = {
  weight_loss: no,
  night_pain: no,
  trauma: no,
  neuro: no,
  bladder_bowel: no,
  cancer: no,
  unwell: no,
  chest: no,
};

export function details(email = "sam.runner@example.com", over: Partial<DetailsInput> = {}): DetailsInput {
  return {
    details: { firstName: "Sam", lastName: "Runner", email, phone: "07700 900123", dob: "1992-04-12" },
    intake: {
      emergencyName: "Alex Runner",
      emergencyPhone: "07700 900456",
      emergencyRelationship: "Partner",
      sport: "Running",
      trainingLevel: "Competitive / club",
      goals: "Run a sub-3 marathon",
      complaint: "Right knee pain after long runs",
      history: "",
      medications: "",
      redFlags: redFlagsNo,
      referralSource: "Instagram",
    },
    consent: { treatment: true, marketingOptIn: false, policyAccepted: true },
    ...over,
  };
}

export async function count(db: Db, table: string) {
  const r = (await db.execute(`select count(*)::int as n from ${table}` as never)) as unknown as { rows: { n: number }[] };
  return r.rows[0].n;
}
