begin;
set local role service_role;
do $$
declare
  payload jsonb := jsonb_build_object('leadId',gen_random_uuid(),'environment','dev','source','xicronix-web','submittedAt',now(),
    'contact',jsonb_build_object('name','QA DEV transacción','email','transaction-qa@example.invalid','institution','[DEV TEST] Integración Web CRM','institutionType','Colegio'),
    'request',jsonb_build_object('interest','diagnostico','message','Solicitud sintética para validar integración completa.'),
    'attribution',jsonb_build_object('submissionPath','/contacto','utmSource','qa','utmCampaign','web-crm-dev'),
    'privacyNotice',jsonb_build_object('acknowledged',true,'version','qa-v1','acknowledgedAt',now()));
  first_result jsonb; repeated jsonb; updated_result jsonb; second_result jsonb; before_count int;
begin
  first_result := public.web_intake_dev_v1(payload);
  assert first_result->>'synced'='true';
  repeated := public.web_intake_dev_v1(payload);
  assert repeated->>'duplicate'='true';
  assert repeated->>'leadId'=first_result->>'leadId';
  assert repeated->>'opportunityId'=first_result->>'opportunityId';
  assert repeated->>'taskId'=first_result->>'taskId';
  assert (select count(*) from public.activities where web_submission->>'leadId'=payload->>'leadId')=1;
  assert (select web_submission#>>'{attribution,utmCampaign}' from public.activities where web_submission->>'leadId'=payload->>'leadId')='web-crm-dev';
  begin
    perform public.web_intake_dev_v1(jsonb_set(payload,'{request,message}','"Different payload on same key must be rejected."'));
    raise exception 'Conflicting payload unexpectedly accepted';
  exception when invalid_parameter_value then null; end;
  payload := jsonb_set(payload,'{leadId}',to_jsonb(gen_random_uuid()));
  updated_result := public.web_intake_dev_v1(payload);
  assert updated_result->>'duplicate'='false';
  assert updated_result->>'leadId'=first_result->>'leadId';
  assert updated_result->>'opportunityId'=first_result->>'opportunityId';
  assert updated_result->>'taskId'=first_result->>'taskId';
  assert (select count(*) from public.activities where lead_id=(first_result->>'leadId')::uuid)=2;
  assert (select count(*) from public.tasks where lead_id=(first_result->>'leadId')::uuid)=1;
  update public.tasks set status='COMPLETED' where id=(first_result->>'taskId')::uuid;
  payload := jsonb_set(payload,'{leadId}',to_jsonb(gen_random_uuid()));
  perform public.web_intake_dev_v1(payload);
  assert (select status from public.tasks where id=(first_result->>'taskId')::uuid)='PENDING';
  update public.opportunities set stage='WON' where id=(first_result->>'opportunityId')::uuid;
  payload := jsonb_set(payload,'{leadId}',to_jsonb(gen_random_uuid()));
  second_result := public.web_intake_dev_v1(payload);
  assert second_result->>'opportunityId'<>first_result->>'opportunityId';
  select count(*) into before_count from public.activities;
  begin
    perform public.web_intake_dev_v1(jsonb_set(payload,'{environment}','"production"'));
    raise exception 'Production envelope unexpectedly accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.web_intake_dev_v1(jsonb_set(payload,'{contact,email}','"real@example.com"'));
    raise exception 'Non-synthetic contact unexpectedly accepted';
  exception when invalid_parameter_value then null; end;
  assert (select count(*) from public.activities)=before_count;
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon','public.web_intake_dev_v1(jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','public.web_intake_dev_v1(jsonb)','EXECUTE');
  assert has_function_privilege('service_role','public.web_intake_dev_v1(jsonb)','EXECUTE');
  assert (select bool_and(rowsecurity) from pg_tables where schemaname='public' and tablename in ('leads','opportunities','tasks','activities','contacts','institutions'));
end $$;
rollback;
select 'PASS: real DEV transaction, retries, conflicting payload, reuse, task reopening, closed opportunity, provenance, environment, synthetic-only, role privileges, RLS; fixtures rolled back' as result;
