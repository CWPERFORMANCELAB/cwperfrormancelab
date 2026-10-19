/** npm run import:vouchers -- path/to/vouchers.csv  (columns: code,value_pounds,expires,recipient_name,recipient_email,minutes,balance_pounds) */
import "./env";
import fs from "node:fs";
import { getDb } from "../src/db/client";
import { importVoucherCsv } from "../src/lib/voucher-import";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run import:vouchers -- vouchers.csv");
  process.exit(1);
}
getDb()
  .then(async (db) => {
    const r = await importVoucherCsv(db, fs.readFileSync(file, "utf8"));
    console.log(r);
    process.exit(r.errors.length ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
