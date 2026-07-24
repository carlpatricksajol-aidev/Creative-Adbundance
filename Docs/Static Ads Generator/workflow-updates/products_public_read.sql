-- Enable the intake form's product picker to see products.
-- The form runs in the browser on the ANON key and does:
--   sb.from('products').select('*').eq('brand_name', client)
-- Right now the products table has no public-read policy, so the picker shows ZERO
-- products for EVERY brand. This adds public read (non-sensitive marketing data:
-- product_name, image_url, description, price, brand_name). Writes stay blocked -
-- there is no anon insert/update policy, so the table can only be written with the
-- service_role key (as the n8n pipeline does).
--
-- Run once in the Supabase SQL editor.

alter table public.products enable row level security;
drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products for select using (true);

-- verify: should now return rows for the anon role
select brand_name, count(*) as products
from public.products
group by brand_name
order by brand_name;
