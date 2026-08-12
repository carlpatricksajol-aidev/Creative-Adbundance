/* CSV for the master sheet — the 2026-08-12 decision: "a master sheet will be established to
 * centralize all client meeting notes."
 *
 * Rather than asking every token for Sheets WRITE scope (a re-consent for the whole team and a
 * much bigger credential), the server exposes /export/*.csv and one Google Sheet pulls it live:
 *
 *     =IMPORTDATA("https://meetings.…/export/notes.csv?t=<token>")
 *
 * Google refreshes IMPORTDATA on its own (~hourly), so the sheet stays current with zero scopes
 * and zero pushes. The escaping below is the whole file's reason to exist:
 *
 *   - quotes, commas, newlines per RFC 4180;
 *   - cells starting with = + - @ or a tab get a leading apostrophe. Sheets would otherwise
 *     EXECUTE them as formulas — and every cell here is untrusted text written by a client in a
 *     comment or said in a meeting. "=IMPORTXML(...)" in a script comment must land as text,
 *     not as a live exfiltration vector inside the team's own spreadsheet.
 */

export function csvCell(v) {
  let s = v == null ? "" : String(v);
  s = s.replace(/\r\n?/g, "\n");
  if (/^[=+\-@\t]/.test(s)) s = "'" + s;                 // formula-injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(","));
  return lines.join("\r\n") + "\r\n";
}
