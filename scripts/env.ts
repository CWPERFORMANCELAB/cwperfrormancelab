/** Load env the same way Next does: .env.local overrides .env. */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
