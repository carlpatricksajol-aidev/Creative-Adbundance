#!/usr/bin/env node
/* Validate a changeset against ../changeset.schema.json.
 *
 *   node engine/validate.js changeset.json
 *
 * Worth running after any prompt or schema change: the contract is what the dashboard, the
 * apply layer and n8n all agree on, so drift here breaks three things at once and none of them
 * loudly. Needs the dev dependency: npm i -D ajv ajv-formats
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const target = process.argv[2];
if (!target) {
  console.error("usage: node engine/validate.js <changeset.json>");
  process.exit(2);
}

let Ajv, addFormats;
try {
  // ajv/dist/2020, NOT the default export. changeset.schema.json declares
  // $schema: draft 2020-12, and plain `ajv` only implements draft-07 — it fails with
  // `no schema with key or ref "https://json-schema.org/draft/2020-12/schema"`.
  ({ default: Ajv } = await import("ajv/dist/2020.js"));
  ({ default: addFormats } = await import("ajv-formats"));
} catch (e) {
  console.error(`ajv is not installed (or failed to load: ${e.message}) — run: npm i -D ajv ajv-formats`);
  process.exit(2);
}

const schema = JSON.parse(readFileSync(join(__dirname, "..", "changeset.schema.json"), "utf8"));
const data = JSON.parse(readFileSync(resolve(target), "utf8"));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

if (validate(data)) {
  const t = data.stats.byTier;
  console.log(`valid — ${data.stats.total} items (auto ${t.auto || 0}, review ${t.review || 0}, blocked ${t.blocked || 0}), ${data.stats.droppedCount || 0} dropped`);
  process.exit(0);
}

console.error(`INVALID — ${validate.errors.length} problem(s):`);
for (const e of validate.errors) console.error(`  ${e.instancePath || "/"} ${e.message}${e.params ? " " + JSON.stringify(e.params) : ""}`);
process.exit(1);
