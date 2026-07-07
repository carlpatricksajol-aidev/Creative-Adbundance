// Public gift data for the SongReels landing page (/r?id=<jobId>).
//   GET /api/gift?id=<jobId> -> { ready, video_url, recipient_name, from, note, title, occasion, year }
//
// No auth: the job id is an unguessable UUID that acts as the share secret.
// We read with the service key server-side and return ONLY the safe gift fields,
// so the creator's email and the private "about them" description never reach
// the recipient's browser.

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return; }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SR = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SR) { res.status(500).json({ error: 'supabase env missing' }); return; }

  const id = (req.query && req.query.id ? String(req.query.id) : '').trim();
  if (!/^[0-9a-fA-F-]{20,40}$/.test(id)) { res.status(400).json({ error: 'bad id' }); return; }

  const hdr = { apikey: SR, Authorization: 'Bearer ' + SR };
  try {
    const url = `${SUPABASE_URL}/rest/v1/heartreel_jobs?id=eq.${encodeURIComponent(id)}` +
                `&select=status,final_video_url,song_title,occasion,created_at,form_data`;
    const r = await fetch(url, { headers: hdr });
    const rows = await r.json();
    const job = Array.isArray(rows) && rows[0];
    if (!job) { res.status(404).json({ error: 'not found' }); return; }

    const fd = job.form_data || {};
    const year = job.created_at ? new Date(job.created_at).getFullYear() : new Date().getFullYear();

    res.status(200).json({
      ready:          job.status === 'complete' && !!job.final_video_url,
      status:         job.status || null,
      video_url:      job.final_video_url || null,
      recipient_name: (fd['f-name']   || '').trim() || null,
      from:           (fd['note_from'] || '').trim() || null,
      note:           (fd['note_body'] || '').trim() || null,
      intro_video:    (fd['intro_video_url'] || '').trim() || null,
      title:          (job.song_title || '').trim() || null,
      occasion:       job.occasion || null,
      year:           year,
    });
  } catch (e) {
    res.status(500).json({ error: 'lookup failed' });
  }
};
