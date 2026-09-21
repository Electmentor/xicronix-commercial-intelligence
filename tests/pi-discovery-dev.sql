begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','3c535c00-3c3d-4fc1-b410-e8b8ce8a50da',true);
do $$
declare c uuid; t uuid; t2 uuid; result jsonb; n integer; a uuid;
begin
insert into public.pi_cases(organization_id,organization_name,organization_type,state,hypothesis,dimensions,next_action,next_action_date,transfer_reason,created_by)
values('823522c3-930f-44d4-9c22-26efee6da960','[SIMULADO] QA Discovery transaction','INSTITUTE','PRIORITIZED','Prueba técnica; no oportunidad real','{"F":4,"N":4,"C":3,"T":3,"A":3,"E":4}','Revisar prueba',now()+interval '1 day','Validar transferencia DEV',auth.uid()) returning id into c;
insert into public.pi_evidence(organization_id,case_id,evidence_type,source,source_url,note,created_by) values('823522c3-930f-44d4-9c22-26efee6da960',c,'FACT','Fuente sintética','https://qa.example.invalid/source','Evidencia exclusivamente de prueba',auth.uid());
t:=(public.pi_prepare_transfer(c)->>'transfer_id')::uuid;
t2:=(public.pi_prepare_transfer(c)->>'transfer_id')::uuid;
if t<>t2 then raise exception 'Preparation duplicated'; end if;
update public.pi_cases set hypothesis='Prueba modificada' where id=c;
begin perform public.pi_execute_transfer(t); raise exception 'Stale transfer accepted'; exception when others then if sqlerrm not like '%cambiaron%' then raise; end if; end;
t:=(public.pi_prepare_transfer(c)->>'transfer_id')::uuid;
if t=t2 then raise exception 'Changed snapshot reused its review ID';end if;
begin perform public.pi_execute_transfer(t2); raise exception 'Superseded review accepted'; exception when others then if sqlerrm not like '%not PREPARED%' then raise;end if;end;
insert into public.pi_evidence(organization_id,case_id,evidence_type,note,critical,created_by) values('823522c3-930f-44d4-9c22-26efee6da960',c,'CONTRADICTION','Test blocker',true,auth.uid());
if (public.pi_readiness(c)->>'ready')::boolean then raise exception 'Critical contradiction accepted'; end if;
delete from public.pi_evidence where case_id=c and evidence_type='CONTRADICTION';
t:=(public.pi_prepare_transfer(c)->>'transfer_id')::uuid;
result:=public.pi_execute_transfer(t);
perform public.pi_execute_transfer(t);
select count(*) into n from public.tasks where automation_key='pi:transfer:'||t;
if n<>1 then raise exception 'Expected one task'; end if;
if not exists(select 1 from public.leads where id=(result->>'lead_id')::uuid and owner_user_id=auth.uid()) then raise exception 'Owner missing';end if;
insert into public.activities(organization_id,lead_id,type,subject,occurred_at,created_by,next_action,next_action_date)
values('823522c3-930f-44d4-9c22-26efee6da960',(result->>'lead_id')::uuid,'NOTE','QA followup',now(),auth.uid(),'Primera acción',now()+interval '1 day') returning id into a;
update public.activities set next_action='Acción corregida' where id=a;
select count(*) into n from public.tasks where automation_key='cx:activity:'||a;
if n<>1 then raise exception 'Activity task duplicated/missing'; end if;
if not exists(select 1 from public.tasks where automation_key='cx:activity:'||a and title='Acción corregida') then raise exception 'Task not updated'; end if;
update public.tasks set status='COMPLETED' where automation_key='cx:activity:'||a;
update public.activities set next_action='No reabrir tarea' where id=a;
if not exists(select 1 from public.tasks where automation_key='cx:activity:'||a and status='COMPLETED' and title='Acción corregida') then raise exception 'Completed task changed';end if;
end $$;
rollback;
