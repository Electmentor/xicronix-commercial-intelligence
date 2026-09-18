-- Run after database/business-performance-v1.sql as the database owner.
-- Does NOT create users or change profiles. Existing identities are never returned.
-- All sentinel writes and SET LOCAL settings live in a PL/pgSQL subtransaction.
-- The intentional ZX001 exception rolls them back on success. An unexpected
-- exception fails the statement and also rolls back its writes automatically.
-- Do not remove the deliberate rollback at the end of the inner block.

do $test$
declare
  actor_id uuid;
  org_id uuid;
  other_org_id uuid := gen_random_uuid();
  own_expense_id uuid := gen_random_uuid();
  other_expense_id uuid := gen_random_uuid();
  no_profile_id uuid := gen_random_uuid();
  affected bigint;
  returned_id uuid;
  initial_role text := current_user;
begin
  select id, organization_id into actor_id, org_id
  from public.profiles
  where role = 'ADMIN' and organization_id is not null
  order by id
  limit 1;
  if actor_id is null then
    raise exception 'RLS test requires one existing administrator';
  end if;
  if exists (select 1 from public.profiles where id = no_profile_id) then
    raise exception 'Unexpected test UUID collision';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.commercial_expenses'::regclass) then
    raise exception 'Expenses table must have RLS enabled';
  end if;
  if has_table_privilege('anon', 'public.commercial_expenses', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Anonymous role unexpectedly has expense table privileges';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'commercial_goals'
      and column_name = 'target_expenses' and is_nullable = 'YES'
  ) then
    raise exception 'Expense budget must exist and remain nullable';
  end if;

  begin
    insert into public.organizations (id, name, slug)
    values (other_org_id, 'Temporary RLS verification', 'rls-check-' || other_org_id::text);

    -- Seed the inaccessible organization's row as owner, before assuming a role.
    insert into public.commercial_expenses (
      id, organization_id, created_by, expense_date, description, category, amount, currency
    ) values (
      other_expense_id, other_org_id, actor_id, current_date,
      'Temporary foreign expense for RLS verification', 'OTHER', 1, 'PEN'
    );

    perform set_config('request.jwt.claim.sub', actor_id::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', actor_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    if not private.is_org_admin(org_id) or private.is_org_admin(other_org_id) then
      raise exception 'Administrator helper does not isolate organizations';
    end if;

    -- ADMIN: create/read/update/delete within own organization, including defaults.
    insert into public.commercial_expenses (
      id, organization_id, expense_date, description, category, amount, updated_at
    ) values (
      own_expense_id, org_id, current_date, 'Temporary own expense for RLS verification',
      'OTHER', 1, '2000-01-01T00:00:00Z'
    ) returning id into returned_id;
    if returned_id is distinct from own_expense_id then
      raise exception 'Administrator cannot create and return own expense';
    end if;
    if not exists (
      select 1 from public.commercial_expenses
      where id = own_expense_id and created_by = actor_id and currency = 'PEN'
    ) then
      raise exception 'Administrator cannot read own expense or defaults are incorrect';
    end if;
    update public.commercial_expenses set amount = 2 where id = own_expense_id;
    get diagnostics affected = row_count;
    if affected <> 1 or not exists (
      select 1 from public.commercial_expenses
      where id = own_expense_id and amount = 2 and updated_at > '2000-01-01T00:00:00Z'
    ) then
      raise exception 'Administrator update or updated_at trigger failed';
    end if;
    delete from public.commercial_expenses where id = own_expense_id;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Administrator cannot delete own expense';
    end if;
    insert into public.commercial_expenses (
      id, organization_id, expense_date, description, category, amount
    ) values (own_expense_id, org_id, current_date, 'Temporary unreadable expense', 'OTHER', 1);

    -- ADMIN of another organization: no read/update/delete or reassignment.
    if exists (select 1 from public.commercial_expenses where id = other_expense_id) then
      raise exception 'Foreign expense leaked to administrator';
    end if;
    update public.commercial_expenses set amount = 9 where id = other_expense_id;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Administrator updated foreign expense'; end if;
    delete from public.commercial_expenses where id = other_expense_id;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Administrator deleted foreign expense'; end if;
    begin
      insert into public.commercial_expenses (organization_id, expense_date, description, amount)
      values (other_org_id, current_date, 'Forbidden foreign expense', 1);
      raise exception 'Administrator inserted into foreign organization';
    exception when insufficient_privilege then null;
    end;
    begin
      update public.commercial_expenses set organization_id = other_org_id where id = own_expense_id;
      raise exception 'Administrator reassigned expense to foreign organization';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.commercial_expenses (organization_id, created_by, expense_date, description, amount)
      values (org_id, no_profile_id, current_date, 'Forbidden forged author', 1);
      raise exception 'Administrator forged expense author on insert';
    exception when insufficient_privilege then null;
    end;

    -- Database constraints are enforced for a permitted administrator as well.
    begin
      insert into public.commercial_expenses (organization_id, expense_date, description, amount)
      values (org_id, current_date, 'Invalid negative expense', -1);
      raise exception 'Database accepted a negative expense';
    exception when check_violation then null;
    end;
    begin
      insert into public.commercial_expenses (organization_id, expense_date, description, amount)
      values (org_id, current_date, 'Invalid NaN expense', 'NaN'::numeric);
      raise exception 'Database accepted a NaN expense';
    exception when check_violation then null;
    end;
    begin
      insert into public.commercial_expenses (organization_id, expense_date, description, amount, currency)
      values (org_id, current_date, 'Invalid currency expense', 1, 'USD');
      raise exception 'Database accepted a non-PEN expense';
    exception when check_violation then null;
    end;

    -- Authenticated identity without a profile: no table data or write access.
    perform set_config('request.jwt.claim.sub', no_profile_id::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', no_profile_id, 'role', 'authenticated')::text, true);
    if private.is_org_admin(org_id) then
      raise exception 'Unassigned identity is treated as administrator';
    end if;
    if exists (select 1 from public.commercial_expenses) then
      raise exception 'Expense data leaked to identity without a profile';
    end if;
    update public.commercial_expenses set amount = 9 where id = own_expense_id;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Unassigned identity updated expense'; end if;
    delete from public.commercial_expenses where id = own_expense_id;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Unassigned identity deleted expense'; end if;
    begin
      insert into public.commercial_expenses (organization_id, expense_date, description, amount)
      values (org_id, current_date, 'Forbidden unassigned expense', 1);
      raise exception 'Unassigned identity inserted expense';
    exception when insufficient_privilege then null;
    end;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{}', true);
    execute 'set local role anon';
    begin
      perform 1 from public.commercial_expenses limit 1;
      raise exception 'Anonymous role can read expense table';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.commercial_expenses (organization_id, expense_date, description, amount)
      values (org_id, current_date, 'Forbidden anonymous expense', 1);
      raise exception 'Anonymous role can insert expense';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';

    -- Deliberate exception = ROLLBACK of every sentinel and local setting above.
    raise exception using errcode = 'ZX001', message = 'RLS assertions passed; rollback sentinel writes';
  exception when sqlstate 'ZX001' then
    null;
  end;

  if current_user <> initial_role then
    raise exception 'Test role was not restored';
  end if;
  if exists (select 1 from public.organizations where id = other_org_id)
     or exists (select 1 from public.commercial_expenses where id in (own_expense_id, other_expense_id)) then
    raise exception 'Sentinel rollback verification failed';
  end if;
end;
$test$;

select 'PASS: admin CRUD, organization isolation, author validation, amount/currency constraints, unassigned identity, anonymous denial, sentinel rollback' as verification,
       'No seller account exists; SALES role coverage requires a future test with an existing seller identity. Profiles and accounts were not modified.' as limitation;
