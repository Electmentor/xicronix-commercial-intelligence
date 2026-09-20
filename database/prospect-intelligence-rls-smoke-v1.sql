-- DEV-only RLS role simulation.
-- Run after crm-dev-minimum-bootstrap-v1.sql + prospect-intelligence-backend-v1.sql.

begin;

insert into public.organizations(id,name,slug)
values('10000000-0000-0000-0000-000000000001','Xicronix DEV','xicronix-dev')
on conflict do nothing;

insert into public.profiles(id,organization_id,full_name,role) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Admin DEV','ADMIN'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Manager DEV','MANAGER'),
('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Sales DEV','SALES'),
('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','Viewer DEV','VIEWER')
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);

do $$
begin
  begin
    insert into public.pi_cases(organization_id,organization_name,state,created_by)
    values('10000000-0000-0000-0000-000000000001','Viewer must fail','DETECTED','20000000-0000-0000-0000-000000000004');
    raise exception 'RLS TEST FAILED: VIEWER INSERT WAS ACCEPTED';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);

insert into public.pi_cases(organization_id,organization_name,state,hypothesis,dimensions,next_action,created_by)
values(
  '10000000-0000-0000-0000-000000000001','Colegio DEV','PRIORITIZED',
  'Modernización STEM validada.',
  '{"F":5,"N":4,"C":3,"T":4,"A":3,"E":4}'::jsonb,
  'Contactar al decisor técnico.',
  '20000000-0000-0000-0000-000000000003'
);

rollback;
