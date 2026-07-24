/* Optional strict schema self-check using ajv (devDependency only).
 *
 *   npm i            # installs ajv + ajv-formats as devDeps
 *   node validate.js <brief.json>   # defaults to ../sample.brief.json
 *
 * The engine's own buildBrief.selfCheck() runs with ZERO deps at emit time; this file is a
 * belt-and-suspenders full-schema validation you can run in CI once ajv is installed.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  let Ajv, addFormats;
  try {
    ({ default: Ajv } = await import("ajv"));
    ({ default: addFormats } = await import("ajv-formats"));
  } catch {
    console.error("ajv not installed. Run `npm i` in FigmaComments/engine first (ajv is a devDependency).");
    process.exit(2);
  }

  const schemaPath = join(__dirname, "..", "brief.schema.json");
  const target = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : join(__dirname, "..", "sample.brief.json");

  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const data = JSON.parse(readFileSync(target, "utf8"));

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(data);

  if (ok) { console.log(`OK: ${target} validates against brief.schema.json`); return; }
  console.error(`INVALID: ${target}`);
  for (const err of validate.errors) console.error(`  ${err.instancePath || "/"} ${err.message}`);
  process.exit(1);
}

main();
