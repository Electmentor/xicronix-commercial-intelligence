-- Xicronix | Rendimiento del negocio v1
-- Aplicado en Supabase como business_performance_v1; verificacion RLS en tests/expenses-rls.sql.
-- Requiere admin-security-performance.sql y commercial-management-views.sql.
-- No inserta datos de demostracion ni modifica las metas existentes.

begin;

alter table public.commercial_goals
  add column if not exists target_expenses numeric(14,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'commercial_goals_target_expenses_nonnegative'
      and conrelid = 'public.commercial_goals'::regclass
  ) then
    alter table public.commercial_goals
      add constraint commercial_goals_target_expenses_nonnegative
      check (
        target_expenses is null
        or (target_expenses >= 0 and target_expenses <> 'NaN'::numeric)
      );
  end if;
end
$$;

comment on column public.commercial_goals.target_expenses is
  'Presupuesto de gastos operativos en PEN para el periodo de la meta. NULL significa sin presupuesto definido; 0 es un presupuesto de cero.';

create table if not exists public.commercial_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expense_date date not null,
  description text not null,
  category text not null default 'OTHER',
  amount numeric(14,2) not null,
  currency text not null default 'PEN',
  notes text,
  constraint commercial_expenses_description_required
    check (length(btrim(description)) > 0),
  constraint commercial_expenses_category_valid
    check (category in ('PERSONNEL', 'MARKETING', 'OPERATIONS', 'TECHNOLOGY', 'OTHER')),
  constraint commercial_expenses_amount_nonnegative
    check (amount >= 0 and amount <> 'NaN'::numeric),
  constraint commercial_expenses_currency_pen
    check (currency = 'PEN')
);

comment on table public.commercial_expenses is
  'Gastos operativos del negocio, accesibles solamente a administradores de la organizacion. No duplicar aqui los costos directos registrados en las oportunidades.';

create index if not exists commercial_expenses_org_date_idx
  on public.commercial_expenses (organization_id, expense_date);
create index if not exists commercial_expenses_created_by_idx
  on public.commercial_expenses (created_by);

alter table public.commercial_expenses enable row level security;

-- Los permisos de tabla habilitan la API; RLS restringe todas las operaciones,
-- incluida la lectura, al administrador de la organizacion correspondiente.
revoke all on public.commercial_expenses from public, anon, authenticated;
grant select, insert, update, delete on public.commercial_expenses to authenticated;

drop policy if exists commercial_expenses_read_admin on public.commercial_expenses;
drop policy if exists commercial_expenses_insert_admin on public.commercial_expenses;
drop policy if exists commercial_expenses_update_admin on public.commercial_expenses;
drop policy if exists commercial_expenses_delete_admin on public.commercial_expenses;

create policy commercial_expenses_read_admin
  on public.commercial_expenses for select to authenticated
  using (private.is_org_admin(organization_id));

create policy commercial_expenses_insert_admin
  on public.commercial_expenses for insert to authenticated
  with check (
    private.is_org_admin(organization_id)
    and created_by = (select auth.uid())
  );

create policy commercial_expenses_update_admin
  on public.commercial_expenses for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

create policy commercial_expenses_delete_admin
  on public.commercial_expenses for delete to authenticated
  using (private.is_org_admin(organization_id));

-- El helper vigente solo actualiza NEW.updated_at y es reutilizable por tabla.
drop trigger if exists trg_touch_commercial_expense_updated_at on public.commercial_expenses;
create trigger trg_touch_commercial_expense_updated_at
before update on public.commercial_expenses
for each row execute function private.touch_commercial_goal_updated_at();

commit;
