-- Review before applying. Existing organization policies remain in place.
-- RESTRICTIVE policies require the existing permissive policy AND these checks.
begin;
do $hardening$
declare
  target text;
  relation_name text;
  foreign_table text;
  predicate text;
begin
  foreach target in array array['institutions','contacts','leads','opportunities','tasks'] loop
    execute format('drop policy if exists xicronix_writer_insert on public.%I', target);
    execute format('drop policy if exists xicronix_writer_update on public.%I', target);
    predicate := format('exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.organization_id = %I.organization_id and p.role in (''ADMIN'',''MANAGER'',''SALES''))',target);
    execute format('create policy xicronix_writer_insert on public.%I as restrictive for insert to authenticated with check ((%s) and created_by = (select auth.uid()))',target,predicate);
    execute format('create policy xicronix_writer_update on public.%I as restrictive for update to authenticated using (%s) with check (%s)',target,predicate,predicate);

    -- Enforce organization membership for every linked record on these forms.
    for relation_name, foreign_table in
      select cols.column_name,
        case cols.column_name when 'institution_id' then 'institutions'
          when 'contact_id' then 'contacts' when 'lead_id' then 'leads'
          when 'opportunity_id' then 'opportunities' end
      from information_schema.columns cols
      where cols.table_schema='public' and cols.table_name=target
        and cols.column_name in ('institution_id','contact_id','lead_id','opportunity_id')
    loop
      predicate := format('%I is null or exists (select 1 from public.%I linked where linked.id = %I.%I and linked.organization_id = %I.organization_id)',relation_name,foreign_table,target,relation_name,target);
      execute format('drop policy if exists %I on public.%I','xicronix_link_insert_'||relation_name,target);
      execute format('drop policy if exists %I on public.%I','xicronix_link_update_'||relation_name,target);
      execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (%s)','xicronix_link_insert_'||relation_name,target,predicate);
      execute format('create policy %I on public.%I as restrictive for update to authenticated using (true) with check (%s)','xicronix_link_update_'||relation_name,target,predicate);
    end loop;
  end loop;
end;
$hardening$;
commit;
