/** npm run db:seed — first-run seed: settings, services, templates and the admin user (only if the DB is empty). */
import "./env";
import { dbKind, getDb } from "../src/db/client";

getDb()
  .then(() => {
    console.log(`✓ Database ready (${dbKind()}).`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
