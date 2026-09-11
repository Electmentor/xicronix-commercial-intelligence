-- Xicronix | Catalogo y costos de importacion v1
-- No contiene precios oficiales: los datos comerciales se cargan por organizacion.

create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_name text not null,
  supplier_sku text not null,
  name text not null,
  category text not null,
  currency text not null default 'USD',
  supplier_unit_price numeric(14,2) not null check (supplier_unit_price >= 0),
  price_valid_from date,
  price_valid_until date,
  origin_country text not null default 'Brasil',
  tariff_code text,
  weight_kg numeric(12,3) check (weight_kg is null or weight_kg >= 0),
  volume_m3 numeric(12,5) check (volume_m3 is null or volume_m3 >= 0),
  reference_url text,
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, supplier_sku)
);

create table if not exists public.cost_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  origin_country text not null,
  destination_country text not null default 'Peru',
  currency text not null default 'USD',
  exchange_rate numeric(14,6) not null check (exchange_rate > 0),
  freight_international numeric(14,2) not null default 0 check (freight_international >= 0),
  insurance numeric(14,2) not null default 0 check (insurance >= 0),
  ad_valorem_rate numeric(8,6) not null default 0 check (ad_valorem_rate between 0 and 1),
  igv_rate numeric(8,6) not null default 0.18 check (igv_rate between 0 and 1),
  perception_rate numeric(8,6) not null default 0 check (perception_rate between 0 and 1),
  customs_broker_fee numeric(14,2) not null default 0 check (customs_broker_fee >= 0),
  terminal_fee numeric(14,2) not null default 0 check (terminal_fee >= 0),
  storage_fee numeric(14,2) not null default 0 check (storage_fee >= 0),
  inland_transport numeric(14,2) not null default 0 check (inland_transport >= 0),
  installation_fee numeric(14,2) not null default 0 check (installation_fee >= 0),
  contingency_rate numeric(8,6) not null default 0 check (contingency_rate between 0 and 1),
  valid_from date,
  valid_until date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Campos de cotizacion en oportunidades: permiten negociar precio sin exponer
-- el costo administrativo al vendedor. El detalle de varias partidas queda
-- reservado para una fase posterior del cotizador.
alter table public.opportunities add column if not exists catalog_product_id uuid references public.catalog_products(id);
alter table public.opportunities add column if not exists cost_profile_id uuid references public.cost_profiles(id);
alter table public.opportunities add column if not exists quantity integer not null default 1 check (quantity > 0);
alter table public.opportunities add column if not exists discount_pct numeric(8,4) not null default 0 check (discount_pct between 0 and 100);
alter table public.opportunities add column if not exists negotiated_unit_price numeric(14,2) check (negotiated_unit_price is null or negotiated_unit_price >= 0);

create index if not exists catalog_products_org_active_idx on public.catalog_products (organization_id, active);
create index if not exists catalog_products_org_validity_idx on public.catalog_products (organization_id, price_valid_until);
create index if not exists cost_profiles_org_validity_idx on public.cost_profiles (organization_id, valid_until);
create index if not exists catalog_products_created_by_idx on public.catalog_products (created_by);
create index if not exists cost_profiles_created_by_idx on public.cost_profiles (created_by);
create index if not exists opportunities_catalog_product_idx on public.opportunities (catalog_product_id);
create index if not exists opportunities_cost_profile_idx on public.opportunities (cost_profile_id);

alter table public.catalog_products enable row level security;
alter table public.cost_profiles enable row level security;

revoke all on public.catalog_products from anon;
revoke all on public.cost_profiles from anon;
grant select on public.catalog_products to authenticated;
grant insert, update, delete on public.catalog_products to authenticated;
grant select on public.cost_profiles to authenticated;
grant insert, update, delete on public.cost_profiles to authenticated;

create policy catalog_products_select_org on public.catalog_products
  for select to authenticated
  using (organization_id in (select p.organization_id from public.profiles p where p.id = (select auth.uid())));

create policy catalog_products_insert_admin on public.catalog_products
  for insert to authenticated
  with check (private.is_org_admin(organization_id));

create policy catalog_products_update_admin on public.catalog_products
  for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

create policy catalog_products_delete_admin on public.catalog_products
  for delete to authenticated
  using (private.is_org_admin(organization_id));

create policy cost_profiles_select_org on public.cost_profiles
  for select to authenticated
  using (organization_id in (select p.organization_id from public.profiles p where p.id = (select auth.uid())));

create policy cost_profiles_insert_admin on public.cost_profiles
  for insert to authenticated
  with check (private.is_org_admin(organization_id));

create policy cost_profiles_update_admin on public.cost_profiles
  for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

create policy cost_profiles_delete_admin on public.cost_profiles
  for delete to authenticated
  using (private.is_org_admin(organization_id));

