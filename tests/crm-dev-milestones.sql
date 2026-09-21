-- Only CRM DEV. Uses the existing administrator; rolls back all fixtures.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','3c535c00-3c3d-4fc1-b410-e8b8ce8a50da',true);
do $$
declare l uuid; a uuid; r record; p integer; m text;
begin
 insert into public.leads(organization_id,title,status,created_by)
 values('823522c3-930f-44d4-9c22-26efee6da960','[QA] Milestone transaction','NEW',auth.uid()) returning id into l;
 for r in select * from (values
  ('LEAD_QUALIFIED','M1',15),('SCOPE_VALIDATED','M2',30),
  ('PROPOSAL_PRESENTED','M3',50),('NEGOTIATION_STARTED','M4',70),
  ('FORMAL_COMMITMENT','M5',85),('PURCHASE_ORDER_RECEIVED','M5',85),
  ('CONTRACT_SIGNED','M5',85),('SALE_WON','M6',100)) v(action,code,pct)
 loop
  insert into public.activities(organization_id,lead_id,type,subject,action_code,occurred_at,created_by)
  values('823522c3-930f-44d4-9c22-26efee6da960',l,'NOTE','[QA] Explicit milestone',r.action,now(),auth.uid()) returning id,maturity_after,milestone_after into a,p,m;
  if p<>r.pct or m<>r.code then raise exception 'Incorrect activity evidence for %',r.action;end if;
  if not exists(select 1 from public.leads where id=l and maturity_percent=r.pct and commercial_milestone=r.code and milestone_updated_by=auth.uid()) then raise exception 'Milestone did not persist for %',r.action;end if;
 end loop;
 update public.activities set action_code='LEAD_QUALIFIED' where id=a;
 if (select maturity_percent from public.leads where id=l)<>100 then raise exception 'Earlier milestone regressed the lead';end if;
 insert into public.activities(organization_id,lead_id,type,subject,action_code,occurred_at,created_by)
 values('823522c3-930f-44d4-9c22-26efee6da960',l,'EMAIL','[QA] Ordinary followup','FOLLOW_UP',now(),auth.uid()) returning maturity_after into p;
 if p is not null then raise exception 'Ordinary movement falsely credited a milestone';end if;
 if (select maturity_percent from public.leads where id=l)<>100 then raise exception 'Ordinary movement changed maturity';end if;
end $$;
select 'PASS: 8 action mappings, evidence, actor, edit, monotonic advancement, ordinary followup' as validation;
rollback;
