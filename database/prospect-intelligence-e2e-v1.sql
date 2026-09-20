-- End-to-end PI -> CRM DEV integration smoke.
-- Runs only against the ephemeral CI database.

begin;

insert into public.organizations(id,name,slug)
values('10000000-0000-0000-0000-000000000001','Xicronix DEV','xicronix-dev');

insert into public.profiles(id,organization_id,full_name,role) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Admin DEV','ADMIN'),
('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Sales DEV','SALES'),
('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','Viewer DEV','VIEWER');

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);

insert into public.pi_cases(
  id,organization_id,state,organization_name,organization_type,organization_ruc,
  organization_website,organization_city,organization_country,sector,hypothesis,
  dimensions,next_action,next_action_date,transfer_reason,created_by
) values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'PRIORITIZED',
  'Colegio Integración DEV',
  'SCHOOL',
  '20999999991',
  'https://colegio-integracion-dev.example',
  'Lima','Peru','Educación escolar',
  'Modernización de laboratorio STEM con evidencia trazable.',
  '{"F":5,"N":4,"C":3,"T":4,"A":3,"E":4}'::jsonb,
  'Contactar al responsable de innovación.',
  now()+interval '2 days',
  'Caso sintético para integración PI CRM.',
  '20000000-0000-0000-0000-000000000003'
);

insert into public.pi_signals(organization_id,case_id,label,source,source_url,created_by)
values(
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Plan de modernización STEM publicado',
  'Sitio institucional',
  'https://colegio-integracion-dev.example/plan',
  '20000000-0000-0000-0000-000000000003'
);

insert into public.pi_evidence(organization_id,case_id,evidence_type,source,source_url,note,created_by) values
(
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'FACT','Sitio institucional','https://colegio-integracion-dev.example/plan',
  'Existe un plan explícito de modernización.',
  '20000000-0000-0000-0000-000000000003'
),
(
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'CONFIRMATION','Boletín institucional','https://colegio-integracion-dev.example/boletin',
  'Se confirma búsqueda de nuevas capacidades STEM.',
  '20000000-0000-0000-0000-000000000003'
);

do $$
declare gate jsonb;
begin
  gate:=public.pi_readiness('30000000-0000-0000-0000-000000000001');
  if coalesce((gate->>'ready')::boolean,false) is not true then
    raise exception 'E2E TEST FAILED: readiness gate did not pass: %',gate;
  end if;
end $$;

create temporary table _prepared as
select public.pi_prepare_transfer('30000000-0000-0000-0000-000000000001') as value;

do $$
declare transfer_id uuid;
declare result jsonb;
declare lead_count integer;
declare activity_count integer;
declare task_count integer;
declare lead_status text;
declare lead_maturity integer;
begin
  select (value->>'transfer_id')::uuid into transfer_id from _prepared;
  result:=public.pi_execute_transfer(transfer_id);

  select count(*),min(status),min(maturity_percent)
  into lead_count,lead_status,lead_maturity
  from public.leads
  where organization_id='10000000-0000-0000-0000-000000000001';

  if lead_count<>1 then raise exception 'E2E TEST FAILED: expected 1 lead, got %',lead_count; end if;
  if lead_status<>'NEW' then raise exception 'E2E TEST FAILED: PI must create lead as NEW, got %',lead_status; end if;
  if lead_maturity<>0 then raise exception 'E2E TEST FAILED: PI must not invent CRM maturity, got %',lead_maturity; end if;

  select count(*) into activity_count from public.activities where subject='Prospect Intelligence transfer';
  if activity_count<>1 then raise exception 'E2E TEST FAILED: expected transfer activity'; end if;

  select count(*) into task_count from public.tasks where automation_key='pi:transfer:'||transfer_id::text;
  if task_count<>1 then raise exception 'E2E TEST FAILED: expected idempotent next-action task'; end if;

  if (select state from public.pi_cases where id='30000000-0000-0000-0000-000000000001')<>'TRANSFERRED' then
    raise exception 'E2E TEST FAILED: PI case not transferred';
  end if;
end $$;

-- VIEWER can read but cannot write.
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.pi_cases
  where organization_id='10000000-0000-0000-0000-000000000001';
  if visible_count<1 then raise exception 'RLS TEST FAILED: VIEWER could not read organization cases'; end if;

  begin
    insert into public.pi_cases(organization_id,organization_name,created_by)
    values(
      '10000000-0000-0000-0000-000000000001',
      'Viewer write must fail',
      '20000000-0000-0000-0000-000000000004'
    );
    raise exception 'RLS TEST FAILED: VIEWER write succeeded';
  exception
    when insufficient_privilege then null;
  end;
end $$;

rollback;
