#!/usr/bin/env node
/* Re-attribute already-stored meetings to clients.
 *
 *   node backfill-brands.js --dry    show what would change
 *   node backfill-brands.js          apply it
 *
 * The meetings lane used to resolve a brand from only the text before the first dash or colon,
 * with an exact match. Real titles never survived that — "CA x ARMRA Ad Concept Alignment (B1)",
 * "ARMRA Biweekly", "ARMRA <> Creative Adbundance" all produced NULL — so 0 of 124 meetings had
 * a client attached and every client page showed comments but no meetings. The lane now uses the
 * same matcher as comments; this applies it retroactively to what is already stored.
 *
 * Also fixes the notes: meeting_notes.brand was copied from the meeting at extraction time, so
 * those rows are null too and would keep the client pages empty even after the meetings are fixed.
 */

import "./env.js";

import { brandIndex, matchBrandFromTitle } from "./engine/targets/brand-brain.js";
import { select, update } from "./engine/targets/supabase.js";

const DRY = process.argv.includes("--dry");

const idx = await brandIndex();
if (!idx.length) { console.error("brand_brain is empty or unreachable — nothing to match against"); process.exit(1); }
console.log(`matching against ${idx.length} clients\n`);

const meetings = await select("meetings", "select=id,title,brand&brand=is.null&limit=1000");
console.log(`${meetings.length} meetings with no client attached`);

let matched = 0;
for (const m of meetings) {
  const hit = matchBrandFromTitle(m.title, idx);
  if (!hit) continue;
  matched++;
  console.log(`  ${hit.brand.padEnd(18)} ← "${String(m.title).slice(0, 58)}"`);
  if (DRY) continue;

  await update("meetings", `id=eq.${m.id}`, { brand: hit.brand, brand_record_id: hit.id });
  // The notes carry their own brand column (that is what the client page filters on), so they
  // have to move with the meeting or the fix is invisible.
  await update("meeting_notes", `meeting_id=eq.${m.id}`, { brand: hit.brand }).catch(() => {});
}

console.log(`\n${matched} of ${meetings.length} now attributed${DRY ? " (dry run — nothing written)" : ""}`);
if (!matched) console.log("Nothing matched. Titles need the client name in them, or an alias in brand_brain.aliases.");
