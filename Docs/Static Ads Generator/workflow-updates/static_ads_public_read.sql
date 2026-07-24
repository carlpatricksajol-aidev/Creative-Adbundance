-- Make the Ad Library work.
-- The Ad Library runs in the browser on the ANON key and reads:
--   sb.from('static_ads').select('*')
-- static_ads has 687 rows, but RLS is ON with no public-read policy, so anon sees ZERO
-- and the Ad Library shows "No brands found." This adds public read (same posture as
-- brand_brain, products, and templates - all public-read, writes stay service_role-only,
-- and the ad images already live in the public 'static-ads' bucket).
--
-- Run once in the Supabase SQL editor.

alter table public.static_ads enable row level security;
drop policy if exists "public read static_ads" on public.static_ads;
create policy "public read static_ads" on public.static_ads for select using (true);

-- verify: anon should now see the rows the Ad Library groups into brands
select brand_name, count(*) as ads
from public.static_ads
group by brand_name
order by ads desc;
