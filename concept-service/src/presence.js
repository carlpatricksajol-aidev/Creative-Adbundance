/* Who else is looking at this.
 *
 * The Google Docs avatar row: open a batch and see that someone else is on it
 * too, live. The point is not decoration, it is that two strategists were
 * editing the same storyboard and neither knew.
 *
 * Deliberately in memory and nowhere else. Presence is true for about ten
 * seconds and then it is a lie, so writing it to disk buys nothing and costs a
 * stale roster after every restart: a container recreate would leave ghosts on
 * every surface until their TTL burned off, except the TTL only burns off for
 * records the process knows about. An empty map after a restart is correct -
 * everyone's next heartbeat is a second away.
 *
 * Identity is NEVER taken from the request body. The caller says WHERE it is,
 * the session says WHO it is. Otherwise any signed-in person can put anyone
 * else's face on any screen.
 */

/* where -> Map(personId -> record) */
const AT = new Map();

/* A heartbeat is every 3 seconds, so 12 gives a person three misses before
 * they drop off. Shorter and a slow network makes people flicker; longer and a
 * closed tab haunts the surface for half a minute. */
const TTL_MS = 12000;

const now = () => Date.now();

function bucket(where) {
  let m = AT.get(where);
  if (!m) { m = new Map(); AT.set(where, m); }
  return m;
}

/* Prune on read rather than on a timer: with no traffic there is nobody to
 * show it to, and a timer would keep the process awake for nothing. */
function prune(m) {
  const cut = now() - TTL_MS;
  for (const [id, rec] of m) if (rec.at < cut) m.delete(id);
  return m;
}

/**
 * Record that a person is on a surface.
 * @param {string} where   an opaque surface key the page chooses
 * @param {object} who     the SESSION, not anything the caller sent
 * @param {object} [extra] { state: 'viewing'|'editing', at: <free label> }
 */
function beat(where, who, extra) {
  if (!where || !who || !who.id) return null;
  const m = bucket(String(where).slice(0, 200));
  const prev = m.get(who.id);
  const rec = {
    id: who.id,
    name: who.name || who.email || who.id,
    role: who.role || '',
    /* editing beats viewing, and it is the page's job to say which: a person
       with a caret in a storyboard cell is doing something different from a
       person reading it, and the row should show that. */
    state: (extra && extra.state) === 'editing' ? 'editing' : 'viewing',
    at: now(),
    since: (prev && prev.since) || now(),
  };
  if (extra && extra.at) rec.spot = String(extra.at).slice(0, 80);
  m.set(who.id, rec);
  return rec;
}

/** Everyone currently on a surface, newest arrival last. */
function roster(where) {
  const m = AT.get(String(where || ''));
  if (!m) return [];
  return [...prune(m).values()].sort((a, b) => a.since - b.since);
}

/** Drop a person from a surface the moment they leave it, rather than waiting
 *  out the TTL. The page sends this on navigation and on tab close. */
function leave(where, who) {
  if (!who || !who.id) return;
  const m = AT.get(String(where || ''));
  if (m) { m.delete(who.id); if (!m.size) AT.delete(String(where)); }
}

/** Every surface a person is on, so leaving one tab does not strand them on
 *  another. Used by the sweep below. */
function forget(who) {
  if (!who || !who.id) return;
  for (const [where, m] of AT) {
    m.delete(who.id);
    if (!m.size) AT.delete(where);
  }
}

/* A surface nobody has touched in a while is dead weight. Cheap sweep, only
 * when the map has grown past anything a studio this size would produce. */
function sweep() {
  if (AT.size < 200) return;
  for (const [where, m] of AT) if (!prune(m).size) AT.delete(where);
}

module.exports = { beat, roster, leave, forget, sweep, TTL_MS };
