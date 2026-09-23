-- DEV only · Rollback helper for Territorial Intelligence Consolidation v1
begin;
revoke all on function public.get_territorial_intelligence(text) from public, anon, authenticated, service_role;
drop function if exists public.get_territorial_intelligence(text);
revoke all on function private.get_territorial_intelligence_internal(text) from public, anon, authenticated, service_role;
drop function if exists private.get_territorial_intelligence_internal(text);
drop view if exists public.territorial_intelligence_registry;

update public.institution_economic_profiles
set monthly_gross_revenue_estimate_pen=null,
    annual_tuition_revenue_estimate_pen=null,
    source_note=trim(replace(coalesce(source_note,''),
      '[DEV territorial consolidation: revenue estimate = student_count × monthly_tuition; annual = monthly × tuition_months_per_year; interpretation remains limited to recorded scopes.]','')),
    updated_at=now()
where coalesce(source_note,'') like '%[DEV territorial consolidation:%';
commit;
