-- DEV ONLY. All fixtures, users without passwords and rules roll back.
-- This tests database enforcement with synthetic JWT claims, not an Auth login.
begin;
do $seed$
declare org uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); viewer_id uuid:=gen_random_uuid(); case_id uuid:=gen_random_uuid();
begin
 create temporary table direction_test_context(org uuid,admin_id uuid,viewer_id uuid,case_id uuid);
 insert into direction_test_context values(org,admin_id,viewer_id,case_id);
 insert into public.organizations(id,name,slug) values(org,'SINTÉTICO DEV · Dirección','direction-test-'||org);
 insert into auth.users(id,aud,role,email) values(admin_id,'authenticated','authenticated',admin_id||'@example.invalid'),(viewer_id,'authenticated','authenticated',viewer_id||'@example.invalid');
 insert into public.profiles(id,organization_id,role,full_name) values(admin_id,org,'ADMIN','SINTÉTICO DEV · Dirección'),(viewer_id,org,'VIEWER','SINTÉTICO DEV · Sin permiso') on conflict(id) do update set organization_id=excluded.organization_id,role=excluded.role,full_name=excluded.full_name;
 insert into public.leads(id,organization_id,title,status,source,created_by) values(case_id,org,'SINTÉTICO DEV · Solicitud de laboratorio','NEW','MANUAL',admin_id);
 insert into public.crm_case_approval_rules(organization_id,category,currency,enabled,max_amount,max_discount_pct,max_payment_days,confirmed_evidence)
 values(org,'EXCEPTION','PEN',true,100,5,30,'Regla exclusivamente sintética; se revierte'),(org,'RESOURCE','PEN',true,100,null,null,'Regla exclusivamente sintética; se revierte');
end $seed$;
grant select on direction_test_context to authenticated;
set local role authenticated;
do $verify$
declare
 c record; action text; payload jsonb; work jsonb; args jsonb; r jsonb; retry jsonb;
 revision integer; stamp timestamptz; receipt uuid; req uuid; num_before integer; count_after integer;
begin
 select * into c from direction_test_context;
 perform set_config('request.jwt.claim.sub',c.admin_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.admin_id,'role','authenticated')::text,true);
 work=jsonb_build_object('owner_id',c.admin_id,'due_at',now()+interval '2 days','next_action','SINTÉTICO: ejecutar decisión');
 -- Decisions 1, 2 and 9: exact retry, stale revision, history, task identity and viewer denial.
 foreach action in array array['PRIORITIZE','ASSIGN','CONTINUE','PAUSE'] loop
  select coalesce((select d.revision from public.crm_case_direction d where d.lead_id=c.case_id),0),l.updated_at into revision,stamp from public.leads l where l.id=c.case_id;
  receipt=gen_random_uuid();payload=case when action='PRIORITIZE' then jsonb_build_object('priority','HIGH') else work end;
  select count(*) into num_before from public.crm_case_decisions where lead_id=c.case_id;
  r=public.crm_case_command(c.case_id,revision,stamp,receipt,action,'Motivo sintético verificable',payload);
  retry=public.crm_case_command(c.case_id,revision,stamp,receipt,action,'Motivo sintético verificable',payload);
  if retry<>r then raise exception 'Retry differs for %',action; end if;
  select count(*) into count_after from public.crm_case_decisions where lead_id=c.case_id;
  if count_after<>num_before+1 then raise exception 'Duplicate history for %',action; end if;
  if (select count(*) from public.tasks where lead_id=c.case_id)>1 then raise exception 'Duplicate execution task'; end if;
  begin
   perform public.crm_case_command(c.case_id,revision,stamp,gen_random_uuid(),action,'Stale revision',payload);
   raise exception 'Missing concurrent conflict';
  exception when serialization_failure then null; end;
  perform set_config('request.jwt.claim.sub',c.viewer_id::text,true);
  begin
   perform public.crm_case_command(c.case_id,revision,stamp,gen_random_uuid(),action,'Unauthorized test',payload);
   raise exception 'Viewer was allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',c.admin_id::text,true);
 end loop;
 -- Decisions 4, 5, 6, 7 and 8: concrete requests and work linked to each request.
 foreach action in array array['EXCEPTION','RESOURCE','COMMITMENT','BLOCKER','ESCALATION'] loop
  select d.revision,l.updated_at into revision,stamp from public.leads l join public.crm_case_direction d on d.lead_id=l.id where l.id=c.case_id;
  payload=jsonb_build_object('category',action,'scope','SINTÉTICO: alcance o impedimento','amount',50,'currency','PEN','limits','Solo este caso sintético','exception_type','DISCOUNT','discount_pct',3);
  if action='COMMITMENT' then payload=payload||work; end if;
  r=public.crm_case_command(c.case_id,revision,stamp,gen_random_uuid(),'REQUEST','Solicitud sintética con contexto',payload);req=(r->>'request_id')::uuid;
  select d.revision,l.updated_at into revision,stamp from public.leads l join public.crm_case_direction d on d.lead_id=l.id where l.id=c.case_id;
  payload=work||jsonb_build_object('request_id',req,'outcome','APPROVE');receipt=gen_random_uuid();
  r=public.crm_case_command(c.case_id,revision,stamp,receipt,action,'Decisión sintética',payload);
  retry=public.crm_case_command(c.case_id,revision,stamp,receipt,action,'Decisión sintética',payload);
  if r<>retry then raise exception 'Request retry differs'; end if;
  if (select count(*) from public.tasks where lead_id=c.case_id and automation_key='case-direction:'||c.case_id||':'||req)<>1 then raise exception 'Missing or duplicate request task'; end if;
  perform set_config('request.jwt.claim.sub',c.viewer_id::text,true);
  begin
   perform public.crm_case_command(c.case_id,revision,stamp,gen_random_uuid(),action,'Unauthorized decision',payload);
   raise exception 'Viewer decision allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',c.admin_id::text,true);
  begin
   perform public.crm_case_command(c.case_id,revision,stamp,gen_random_uuid(),action,'Stale decision',payload);
   raise exception 'Missing request conflict';
  exception when serialization_failure then null; end;
 end loop;
 -- A blocker remains approved and blocks resolution until its task and evidence are checked.
 select id into req from public.crm_case_requests where lead_id=c.case_id and category='BLOCKER';
 select d.revision,l.updated_at into revision,stamp from public.leads l join public.crm_case_direction d on d.lead_id=l.id where l.id=c.case_id;
 begin
  perform public.crm_case_command(c.case_id,revision,stamp,gen_random_uuid(),'RESOLVE','Premature resolution',jsonb_build_object('result','No permitido','evidence','Sintética'));
  raise exception 'Closed with pending work';
 exception when raise_exception then if sqlerrm<>'CASE_PENDING_ACTIONS' then raise; end if; end;
 update public.tasks set status='COMPLETED' where lead_id=c.case_id;
 r=public.crm_case_command(c.case_id,revision,stamp,gen_random_uuid(),'VERIFY_BLOCKER','Se comprobó ejecución',jsonb_build_object('request_id',req,'evidence','SINTÉTICO: comprobación del documento'));
 -- Decision 10 plus evidence: resolve, close, reopen; no commercial conversion.
 foreach action in array array['RESOLVE','CLOSE','REOPEN'] loop
  select d.revision,l.updated_at into revision,stamp from public.leads l join public.crm_case_direction d on d.lead_id=l.id where l.id=c.case_id;
  payload=jsonb_build_object('result','SINTÉTICO: resultado comprobado','evidence','SINTÉTICO: acta de prueba');
  if action='REOPEN' then payload=payload||work; end if;
  receipt=gen_random_uuid();
  r=public.crm_case_command(c.case_id,revision,stamp,receipt,action,'Motivo de resultado sintético',payload);
  retry=public.crm_case_command(c.case_id,revision,stamp,receipt,action,'Motivo de resultado sintético',payload);
  if r<>retry then raise exception 'Lifecycle retry differs'; end if;
  if (select status from public.leads where id=c.case_id)<>'NEW' then raise exception 'Commercial lead status changed'; end if;
  perform set_config('request.jwt.claim.sub',c.viewer_id::text,true);
  begin
   perform public.crm_case_command(c.case_id,revision,stamp,gen_random_uuid(),action,'Unauthorized lifecycle',payload);
   raise exception 'Viewer lifecycle allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',c.admin_id::text,true);
 end loop;
 -- An incomplete case may be assigned; invalid owners/reason cannot commit.
 select d.revision,l.updated_at into revision,stamp from public.leads l join public.crm_case_direction d on d.lead_id=l.id where l.id=c.case_id;
 begin
  perform public.crm_case_command(c.case_id,revision,stamp,gen_random_uuid(),'ASSIGN','Invalid owner',work||jsonb_build_object('owner_id',c.viewer_id));
  raise exception 'Read-only owner allowed';
 exception when raise_exception then if sqlerrm<>'CASE_INVALID_OWNER' then raise; end if; end;
 -- Direct audit/state mutation must be denied even for the ADMIN database caller.
 begin
  update public.crm_case_direction set lifecycle='CLOSED' where lead_id=c.case_id;
  raise exception 'Direct state mutation allowed';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.crm_case_decisions where lead_id=c.case_id;
  raise exception 'History deletion allowed';
 exception when insufficient_privilege then null; end;
end $verify$;
reset role;
rollback;
select 'PASS: rolled-back DEV SQL decisions 1,2,4,5,6,7,8,9,10; authorized/VIEWER, receipt replay, stale revision, atomic history and task linkage, lifecycle and direct-write denial. Proposal/native quote integration, real sessions and simultaneous connections remain pending.' as evidence;
