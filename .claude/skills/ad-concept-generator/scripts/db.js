/**
 * db.js — Shared Postgres client + CLI helpers for the fetch-*.js scripts.
 *
 * All fetch-*.js scripts read from the Knowledge Layer (adbundance) using
 * KNOWLEDGE_DATABASE_URL. That role is qa_reviewer (read-only).
 *
 * Requires: `pg` (npm install pg). See scripts/package.json.
 */

const { Client } = require('pg');

function requireDbUrl() {
  const url = process.env.KNOWLEDGE_DATABASE_URL;
  if (!url) {
    process.stderr.write(
      'ERROR: KNOWLEDGE_DATABASE_URL is not set.\n' +
      'Export it before running any fetch-*.js script:\n' +
      '  export KNOWLEDGE_DATABASE_URL="postgresql://qa_reviewer.<ref>:...@<pooler-host>:5432/postgres"\n'
    );
    process.exit(2);
  }
  return url;
}

/**
 * Run a parameterised SQL query and return rows.
 * Opens/closes its own client — cheap enough for one-shot CLI scripts.
 */
async function query(sql, params = []) {
  const client = new Client({ connectionString: requireDbUrl() });
  await client.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows;
  } finally {
    await client.end();
  }
}

/**
 * Very small `--key value` / `--flag` argv parser.
 * Returns { _: [positional], key: value | true, ... }.
 */
function parseArgs(argv) {
  const args = { _: [] };
  const list = argv.slice(2);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = list[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

/** Print JSON to stdout with stable 2-space indentation. */
function emit(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

/** Wrap an async main() with clean error handling. */
function run(main) {
  main().catch((err) => {
    process.stderr.write(`ERROR: ${err.message || err}\n`);
    process.exit(1);
  });
}

module.exports = { query, parseArgs, emit, run };
