-- True Value Realty Supabase setup
-- Run this in the Supabase SQL editor after creating your project.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  description text,
  property_type text not null check (property_type in ('Residential Apartment','Independent House','Residential Plot','Commercial Property','Agricultural Land')),
  transaction_type text not null check (transaction_type in ('Sale','Rent')),
  price numeric(14,2),
  price_display text not null default 'exact' check (price_display in ('exact','request')),
  location text,
  locality text,
  city text default 'Nashik',
  state text default 'Maharashtra',
  pin_code text,
  carpet_area numeric(12,2),
  built_up_area numeric(12,2),
  plot_area numeric(12,2),
  area_unit text not null default 'sq. ft.' check (area_unit in ('sq. ft.','sq. m.','acre')),
  bedrooms integer check (bedrooms is null or bedrooms >= 0),
  bathrooms integer check (bathrooms is null or bathrooms >= 0),
  parking text,
  furnishing_status text,
  features text[] not null default '{}',
  cover_image_path text,
  featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_path text not null unique,
  alt_text text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_properties_updated_at on public.properties;
create trigger trg_properties_updated_at
before update on public.properties
for each row execute function public.set_updated_at();

create index if not exists idx_properties_status on public.properties(status);
create index if not exists idx_properties_featured on public.properties(featured) where status = 'published';
create index if not exists idx_properties_transaction on public.properties(transaction_type);
create index if not exists idx_properties_type on public.properties(property_type);
create index if not exists idx_properties_location on public.properties(city, locality);
create index if not exists idx_properties_price on public.properties(price);
create index if not exists idx_property_images_property on public.property_images(property_id, sort_order);

alter table public.admin_users enable row level security;
alter table public.properties enable row level security;
alter table public.property_images enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid());
$$;

drop policy if exists "Admins can read admin allowlist" on public.admin_users;
create policy "Admins can read admin allowlist"
on public.admin_users for select
to authenticated
using (public.is_admin());

drop policy if exists "Public can read published properties" on public.properties;
create policy "Public can read published properties"
on public.properties for select
to anon, authenticated
using (status = 'published' or public.is_admin());

drop policy if exists "Admins insert properties" on public.properties;
create policy "Admins insert properties"
on public.properties for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins update properties" on public.properties;
create policy "Admins update properties"
on public.properties for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins delete properties" on public.properties;
create policy "Admins delete properties"
on public.properties for delete
to authenticated
using (public.is_admin());

drop policy if exists "Public can read images for published properties" on public.property_images;
create policy "Public can read images for published properties"
on public.property_images for select
to anon, authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.properties p
    where p.id = property_images.property_id and p.status = 'published'
  )
);

drop policy if exists "Admins insert property images" on public.property_images;
create policy "Admins insert property images"
on public.property_images for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins update property images" on public.property_images;
create policy "Admins update property images"
on public.property_images for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins delete property images" on public.property_images;
create policy "Admins delete property images"
on public.property_images for delete
to authenticated
using (public.is_admin());

-- Storage setup:
-- 1. In Supabase Dashboard > Storage, create a PUBLIC bucket named property-images.
-- 2. Then run the policies below. They rely on storage.objects and the same admin allowlist.

drop policy if exists "Public reads property images" on storage.objects;
create policy "Public reads property images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'property-images');

drop policy if exists "Admins upload property images" on storage.objects;
create policy "Admins upload property images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'property-images' and public.is_admin());

drop policy if exists "Admins update property images" on storage.objects;
create policy "Admins update property images"
on storage.objects for update
to authenticated
using (bucket_id = 'property-images' and public.is_admin())
with check (bucket_id = 'property-images' and public.is_admin());

drop policy if exists "Admins delete property images" on storage.objects;
create policy "Admins delete property images"
on storage.objects for delete
to authenticated
using (bucket_id = 'property-images' and public.is_admin());

-- After creating your admin Auth user in the Dashboard, insert the user's UUID here:
-- insert into public.admin_users (user_id, email) values ('AUTH_USER_UUID_HERE', 'admin@example.com');
