// /r?id=<jobId>  ->  rich link preview (Open Graph), then sends the visitor to the gift.
//
// When the gift link is pasted into WhatsApp, Messenger, Facebook, iMessage, etc.,
// those apps fetch THIS url and read the Open Graph tags to build the preview card
// (title, "from X", and the video). They do not run JavaScript, so the tags must be
// in the server response. Real visitors are then redirected to /gift (the player).
//
// og:image (the thumbnail shown in the card) appears once a per-reel thumbnail exists
// on the job (thumbnail_url). Until then the card shows the title + description, which
// is already far better than a bare link.

module.exports = async (req, res) => {
  const SUPABASE_URL = process.env.SUPABASE_URL, SR = process.env.SUPABASE_SERVICE_ROLE;
  const origin = 'https://www.songreels.ai';
  const id = (req.query && req.query.id ? String(req.query.id) : '').trim();
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let title = 'A SongReel for you 🎶';
  let desc = 'Someone made you a song. Tap to watch and listen.';
  let image = '', video = '';

  if (SUPABASE_URL && SR && /^[0-9a-fA-F-]{20,40}$/.test(id)) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/heartreel_jobs?id=eq.${encodeURIComponent(id)}&select=*`, { headers: { apikey: SR, Authorization: 'Bearer ' + SR } });
      const rows = await r.json();
      const job = Array.isArray(rows) && rows[0];
      if (job) {
        const fd = job.form_data || {};
        const name = (fd['f-name'] || '').trim();
        const from = (fd['note_from'] || '').trim();
        const occ = (job.occasion || '').trim();
        if (name) title = `A SongReel for ${name} 🎶`;
        desc = (from ? `${from} made you a song` : 'A song made just for you')
             + (occ ? ` for ${occ}` : '') + '. Tap to watch and listen.';
        if (job.thumbnail_url) image = job.thumbnail_url;     // auto-lights-up once the workflow saves a thumbnail
        if (job.final_video_url) video = job.final_video_url;
      }
    } catch (e) { /* fall back to defaults */ }
  }

  const giftUrl = `${origin}/gift?id=${encodeURIComponent(id)}`;
  const ogUrl = `${origin}/r?id=${encodeURIComponent(id)}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200).send(`<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="${video ? 'video.other' : 'website'}">
<meta property="og:site_name" content="SongReels">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(ogUrl)}">
${image ? `<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1080">
<meta property="og:image:height" content="1920">` : ''}
${video ? `<meta property="og:video" content="${esc(video)}">
<meta property="og:video:secure_url" content="${esc(video)}">
<meta property="og:video:type" content="video/mp4">
<meta property="og:video:width" content="1080">
<meta property="og:video:height" content="1920">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${image ? `<meta name="twitter:image" content="${esc(image)}">` : ''}
<meta http-equiv="refresh" content="0; url=${esc(giftUrl)}">
<script>location.replace(${JSON.stringify(giftUrl)});</script>
</head><body style="margin:0;background:#EADFD4;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:48px 20px;color:#221019">
<p style="font-weight:700">Opening your gift…</p>
<p><a href="${esc(giftUrl)}" style="color:#FF2D55">Tap here if it does not open.</a></p>
</body></html>`);
};
