/* Load .env from THIS directory, not the current working directory.
 *
 * `import "dotenv/config"` reads ./.env relative to wherever the process was launched. That is
 * fine when you run `npm start` from the service folder, and silently wrong under cron: a line
 * like "every 10 minutes, node /root/meeting-tool/poll-drive.js"
 * runs with cwd = /root, finds no .env, and the poller then fails with "nobody is authorised"
 * or writes nowhere — with no hint that the config simply was not read. Resolving against the
 * module's own path makes the launch directory irrelevant.
 *
 * Imported first by every entry point (server.js, poll-drive.js, auth-google.js).
 */

import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ENV_PATH = join(dirname(fileURLToPath(import.meta.url)), ".env");

if (existsSync(ENV_PATH)) {
  config({ path: ENV_PATH });
} else {
  console.error(`[env] no .env at ${ENV_PATH} — copy .env.example to .env and fill it in`);
}
