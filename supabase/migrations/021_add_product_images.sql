alter table if exists public.products
  add column if not exists image_urls text[] not null default array[]::text[];

update public.products
set image_urls = array[image_url]::text[]
where image_url is not null
  and cardinality(image_urls) = 0;
