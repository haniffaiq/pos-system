-- Grosir tenant tables. All tenant-owned rows carry tenant_id and are protected by RLS.
-- Monetary values are integer Rupiah stored as bigint; quantities are integral units.

alter table users
  add constraint users_tenant_id_id_key unique (tenant_id, id);

create or replace function apply_tenant_rls(tbl regclass) returns void as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format(
    'create policy tenant_isolation on %s
       using (tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid)
       with check (tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid)', tbl);
  execute format('grant select, insert, update, delete on %s to app', tbl);
end $$ language plpgsql;

create table categories (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table units (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table suppliers (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table products (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  category_id uuid,
  sku text not null,
  name text not null,
  base_unit_id uuid not null,
  bulk_unit_id uuid,
  bulk_conversion integer,
  buy_price bigint not null default 0 check (buy_price >= 0),
  sell_price_eceran bigint not null default 0 check (sell_price_eceran >= 0),
  sell_price_grosir bigint not null default 0 check (sell_price_grosir >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  stock_qty integer not null default 0 check (stock_qty >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, sku),
  check (bulk_conversion is null or bulk_conversion > 1),
  check ((bulk_unit_id is null and bulk_conversion is null) or (bulk_unit_id is not null and bulk_conversion is not null)),
  foreign key (tenant_id, category_id) references categories(tenant_id, id),
  foreign key (tenant_id, base_unit_id) references units(tenant_id, id),
  foreign key (tenant_id, bulk_unit_id) references units(tenant_id, id)
);

create table stock_in (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  supplier_id uuid,
  note text,
  total_cost bigint not null default 0 check (total_cost >= 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, supplier_id) references suppliers(tenant_id, id),
  foreign key (tenant_id, created_by) references users(tenant_id, id)
);

create table stock_in_items (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  stock_in_id uuid not null,
  product_id uuid not null,
  unit_id uuid not null,
  qty integer not null check (qty > 0),
  unit_cost bigint not null check (unit_cost >= 0),
  subtotal bigint not null check (subtotal >= 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, stock_in_id) references stock_in(tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references products(tenant_id, id),
  foreign key (tenant_id, unit_id) references units(tenant_id, id)
);

create table sales (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  invoice_no text not null,
  customer_name text,
  total bigint not null check (total >= 0),
  paid bigint not null check (paid >= 0),
  change bigint not null check (change >= 0),
  payment_method text not null default 'cash' check (payment_method in ('cash','transfer','qris')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, invoice_no),
  foreign key (tenant_id, created_by) references users(tenant_id, id)
);

create table sale_items (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  sale_id uuid not null,
  product_id uuid not null,
  unit_type text not null check (unit_type in ('eceran','grosir')),
  qty integer not null check (qty > 0),
  unit_price bigint not null check (unit_price >= 0),
  subtotal bigint not null check (subtotal >= 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, sale_id) references sales(tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references products(tenant_id, id)
);

create table stock_adjustments (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null,
  qty_base integer not null,
  reason text not null check (reason in ('rusak','hilang','koreksi')),
  note text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, product_id) references products(tenant_id, id),
  foreign key (tenant_id, created_by) references users(tenant_id, id)
);

create table stock_movements (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null,
  type text not null check (type in ('in','sale','adjustment')),
  ref_id uuid not null,
  qty_base integer not null,
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, product_id) references products(tenant_id, id)
);

create table notifications (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null check (type in ('low_stock','export_ready')),
  title text not null,
  body text,
  metadata jsonb not null default '{}',
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table export_jobs (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null check (type in ('sales','stock')),
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  file_path text,
  params jsonb not null default '{}',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, created_by) references users(tenant_id, id)
);

select apply_tenant_rls('categories');
select apply_tenant_rls('units');
select apply_tenant_rls('suppliers');
select apply_tenant_rls('products');
select apply_tenant_rls('stock_in');
select apply_tenant_rls('stock_in_items');
select apply_tenant_rls('sales');
select apply_tenant_rls('sale_items');
select apply_tenant_rls('stock_adjustments');
select apply_tenant_rls('stock_movements');
select apply_tenant_rls('notifications');
select apply_tenant_rls('export_jobs');

create index products_tenant_active_idx on products (tenant_id, is_active);
create index products_tenant_category_idx on products (tenant_id, category_id);
create index stock_in_tenant_created_at_idx on stock_in (tenant_id, created_at);
create index stock_movements_tenant_product_created_at_idx on stock_movements (tenant_id, product_id, created_at);
create index sales_tenant_created_at_idx on sales (tenant_id, created_at);
create index notifications_tenant_unread_idx on notifications (tenant_id, is_read, created_at);
create unique index notifications_unread_low_stock_product_idx
  on notifications (tenant_id, type, (metadata->>'product_id'))
  where type = 'low_stock' and is_read = false and metadata ? 'product_id';
create index export_jobs_tenant_status_idx on export_jobs (tenant_id, status, created_at);
