#!/usr/bin/env node
/* Fill the master sheet.
 *
 *   node sync-sheet.js          append everything new since last run
 *   node sync-sheet.js --url    just print where the sheet is
 *
 * Separate from poll-drive.js on purpose: capture must never be at the mercy of a spreadsheet.
 * If the sheet is deleted, unshared, or Google rate-limits it, meetings and comments keep being
 * recorded and this catches up on the next tick.
 *
 * Needs the writer consent: `node auth-google.js --writer`, once, by whoever should own the
 * document. Everyone else's tokens stay read-only.
 */

import "./env.js";

import { writerSubject } from "./engine/sources/google-auth.js";
import { syncMasterSheet, ensureSheet } from "./engine/targets/master-sheet.js";

const subject = writerSubject();
if (!subject) {
  console.error("No writer connected yet.\n");
  console.error("  node auth-google.js --writer      # sign in as whoever should own the sheet");
  console.error("\nIt asks for drive.file only: the tool can touch files it creates, nothing else.");
  process.exit(2);
}

const who = subject.replace(/^writer:/, "");

if (process.argv.includes("--url")) {
  const { id } = await ensureSheet(subject);
  console.log(`https://docs.google.com/spreadsheets/d/${id}`);
  process.exit(0);
}

try {
  // PostgREST caps any single response at 1,000 rows, so one pass can never drain a backfill of
  // ~13k comments. Loop until a pass adds nothing; steady-state cron runs exit after one.
  let notes = 0, comments = 0, url = "", pass = 0;
  for (;;) {
    const r = await syncMasterSheet(subject);
    url = r.url;
    notes += r.addedNotes; comments += r.addedComments;
    if (!r.addedNotes && !r.addedComments) break;
    if (++pass % 3 === 0) console.log(`[sheet] …${notes} notes, ${comments} comments so far`);
    if (pass > 200) { console.error("[sheet] stopping after 200 passes — something is not advancing"); break; }
  }
  console.log(`[sheet] owner ${who}`);
  console.log(`[sheet] +${notes} meeting notes, +${comments} client comments`);
  console.log(`[sheet] ${url}`);
} catch (e) {
  // The two failures worth naming, because the fix differs and neither is obvious from a 403.
  if (/insufficient|forbidden|403/i.test(e.message)) {
    console.error(`[sheet] permission refused — re-run \`node auth-google.js --writer\` (the stored consent may predate the drive.file scope).`);
  } else if (/Sheets API has not been used|accessNotConfigured|SERVICE_DISABLED/i.test(e.message)) {
    console.error(`[sheet] the Google Sheets API is not enabled on the Cloud project. Enable "Google Sheets API", wait a minute, run again.`);
  }
  console.error(String(e.message || e));
  process.exit(1);
}
