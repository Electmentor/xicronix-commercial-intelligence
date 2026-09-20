-- DEV performance and RLS policy cleanup v0.1
-- Safe for Xicronix Commercial Intelligence DEV only.

drop policy if exists profiles_admin_write on public.profiles;

drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles
for insert to authenticated
with check (private.is_org_admin(organization_id));

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
for update to authenticated
using (private.is_org_admin(organization_id))
with check (private.is_org_admin(organization_id));

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles
for delete to authenticated
using (private.is_org_admin(organization_id));

create index if not exists profiles_org_idx on public.profiles(organization_id);
create index if not exists institutions_org_idx on public.institutions(organization_id);
create index if not exists contacts_org_idx on public.contacts(organization_id);
create index if not exists contacts_institution_idx on public.contacts(institution_id);
create index if not exists leads_org_idx on public.leads(organization_id);
create index if not exists leads_institution_idx on public.leads(institution_id);
create index if not exists leads_contact_idx on public.leads(contact_id);
create index if not exists opportunities_org_idx on public.opportunities(organization_id);
create index if not exists opportunities_institution_idx on public.opportunities(institution_id);
create index if not exists opportunities_contact_idx on public.opportunities(contact_id);
create index if not exists opportunities_lead_idx on public.opportunities(lead_id);
create index if not exists activities_org_idx on public.activities(organization_id);
create index if not exists activities_institution_idx on public.activities(institution_id);
create index if not exists activities_contact_idx on public.activities(contact_id);
create index if not exists activities_lead_idx on public.activities(lead_id);
create index if not exists activities_opportunity_idx on public.activities(opportunity_id);
create index if not exists tasks_org_idx on public.tasks(organization_id);
create index if not exists tasks_institution_idx on public.tasks(institution_id);
create index if not exists tasks_contact_idx on public.tasks(contact_id);
create index if not exists tasks_lead_idx on public.tasks(lead_id);
create index if not exists tasks_opportunity_idx on public.tasks(opportunity_id);
create index if not exists scores_org_idx on public.scores(organization_id);
create index if not exists scores_lead_idx on public.scores(lead_id);
create index if not exists scores_opportunity_idx on public.scores(opportunity_id);
create index if not exists pi_signals_org_idx on public.pi_signals(organization_id);
create index if not exists pi_evidence_org_idx on public.pi_evidence(organization_id);
create index if not exists pi_transfers_org_idx on public.pi_transfers(organization_id);
create index if not exists pi_cases_crm_institution_idx on public.pi_cases(crm_institution_id);
create index if not exists pi_cases_crm_lead_idx on public.pi_cases(crm_lead_id);
create index if not exists pi_cases_crm_opportunity_idx on public.pi_cases(crm_opportunity_id);
create index if not exists pi_transfers_crm_institution_idx on public.pi_transfers(crm_institution_id);
create index if not exists pi_transfers_crm_lead_idx on public.pi_transfers(crm_lead_id);
create index if not exists pi_transfers_crm_opportunity_idx on public.pi_transfers(crm_opportunity_id);
