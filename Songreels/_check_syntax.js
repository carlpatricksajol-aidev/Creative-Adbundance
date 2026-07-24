// Syntax-checks every inline <script> block in create.html and brace-balances the <style> blocks.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'create.html'), 'utf8');

let ok = true;

// JS blocks
const scripts = [...src.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)];
scripts.forEach((m, i) => {
  const body = m[1];
  if (!body.trim()) return;
  try {
    new Function(body); // parses (does not run)
    console.log('script #' + i + ' (' + body.length + ' chars): OK');
  } catch (e) {
    ok = false;
    console.log('script #' + i + ': SYNTAX ERROR -> ' + e.message);
    // rough line locator
    const lines = body.split('\n');
    console.log('  first 1 line: ' + lines[0].slice(0, 80));
  }
});

// CSS brace balance
const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
styles.forEach((m, i) => {
  const open = (m[1].match(/{/g) || []).length;
  const close = (m[1].match(/}/g) || []).length;
  console.log('style #' + i + ': ' + open + ' open / ' + close + ' close ' + (open === close ? 'OK' : 'MISMATCH'));
  if (open !== close) ok = false;
});

// duplicate id check
const ids = [...src.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const dupes = ids.filter((v, i, a) => a.indexOf(v) !== i);
const uniqDupes = [...new Set(dupes)];
if (uniqDupes.length) { ok = false; console.log('DUPLICATE IDs: ' + uniqDupes.join(', ')); }
else console.log('ids: all unique (' + ids.length + ')');

process.exit(ok ? 0 : 1);
