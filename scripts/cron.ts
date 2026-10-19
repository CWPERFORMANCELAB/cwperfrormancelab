/** npm run cron — run scheduled jobs once (reminders, holds, reconciliation, sync). Use `-- --watch` to loop every minute locally. */
import "./env";
import { getDb } from "../src/db/client";
import { runJobs } from "../src/lib/cron";

async function once() {
  const db = await getDb();
  console.log(new Date().toISOString(), await runJobs(db));
}
if (process.argv.includes("--watch")) {
  once();
  setInterval(once, 60_000);
} else once().then(() => process.exit(0));
