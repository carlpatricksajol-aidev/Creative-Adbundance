// Fetch CreativeOS templates from Supabase (replaces the Airtable "Search records" node).
// Templates now live in Supabase table creative_os_templates (Airtable hit its 1,000-record cap).
// Returns one item per template so "Shuffle Templates" -> "Pick Templates" can pick from them
// on the fallback / non-hand-pick path. (Hand-picked runs bypass this via selected_template_urls.)
//
// n8n node: Code, mode = "Run Once for All Items". Wire it exactly where the old Airtable
// "Search records" node sat: (Has Reference? / Search Brand Brain) -> THIS -> Shuffle Templates.

const SUPABASE_URL = 'https://xakngjsybyytldyqfsmi.supabase.co';
const SUPABASE_KEY = '<SUPABASE_SERVICE_ROLE_KEY>';

// All templates are 1:1, so no aspect filter (a 9:16/16:9 request still uses the 1:1 layout;
// the render sets the output aspect). Returns up to 1000 rows for Shuffle/Pick to sample.
const rows = await this.helpers.httpRequest({
  method: 'GET',
  url: SUPABASE_URL + '/rest/v1/creative_os_templates?select=id,image_url,category,style,industry_tags,aspect_ratio&limit=1000',
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY
  },
  json: true
});

return (Array.isArray(rows) ? rows : []).map(function (r) {
  return { json: r };
});
