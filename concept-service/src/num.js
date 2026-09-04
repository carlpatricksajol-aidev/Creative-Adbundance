/* One spelling for a concept number.
 *
 * A concept is '1' where the generator wrote it, '001' where the studio and
 * the client portal write it, and sometimes ' 1 ' where a model echoed it
 * back inside JSON. Everything that keys or compares a concept number goes
 * through here, because every place that did it with String() has been a bug:
 *
 *   - the client portal's decisions were all refused as "not in this batch"
 *   - a scoped run would have filtered its own batch down to nothing
 *   - a review or contract keyed on a padded number silently fails to join,
 *     so the fix is computed, dropped, and never shipped, with no error
 *
 * The last one is the dangerous kind: nothing fails, the batch is just
 * quietly worse.
 */
function canonNum(n) {
  const s = String(n == null ? '' : n).trim();
  const bare = s.replace(/^0+(?=\d)/, '');
  return bare === '' ? s : bare;
}

/* A Set that answers for any spelling of the numbers put into it. */
function numSet(list) {
  return new Set((list || []).map(canonNum));
}

module.exports = { canonNum, numSet };
