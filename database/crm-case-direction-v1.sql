-- Additive case supervision. Apply to DEV first; production requires a separate release gate.
-- Commercial lead/opportunity status, mail, quotes, purchases and payments are never changed.
begin;
create table public.crm_case_direction (
 lead_id uuid primary key references public.leads(id),
 organization_id uuid not null references public.organizations(id),
 revision integer not null default 0 check(revision>=0),
 lifecycle text not null default 'PENDING' check(lifecycle in ('PENDING','ATTENDED','WAITING_CUSTOMER','RESOLVED','PAUSED','DISCARDED','CLOSED')),
 priority text not null default 'MEDIUM' check(priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
 review_at timestamptz,
 result text,
 evidence text,
 updated_at timestamptz not null default now()
);
create table public.crm_case_requests (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 lead_id uuid not null references public.leads(id),
 category text not null check(category in ('PROPOSAL','EXCEPTION','RESOURCE','COMMITMENT','BLOCKER','ESCALATION')),
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','RESOLVED','SUPERSEDED')),
 payload jsonb not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index crm_case_requests_case_idx on public.crm_case_requests(organization_id,lead_id);
create table public.crm_case_decisions (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 lead_id uuid not null references public.leads(id),
 actor_id uuid not null references auth.users(id),
 action text not null,
 reason text not null,
 command jsonb not null,
 before_value jsonb not null,
 after_value jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
create index crm_case_decisions_case_idx on public.crm_case_decisions(organization_id,lead_id,created_at);
-- No default monetary authority. A confirmed business rule is required for approvals.
create table public.crm_case_approval_rules (
 organization_id uuid not null references public.organizations(id),
 category text not null check(category in ('PROPOSAL','EXCEPTION','RESOURCE')),
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 enabled boolean not null default false,
 max_amount numeric check(max_amount>=0),
 min_margin_pct numeric check(min_margin_pct between 0 and 100),
 max_discount_pct numeric check(max_discount_pct between 0 and 100),
 max_payment_days integer check(max_payment_days>=0),
 confirmed_evidence text not null,
 primary key(organization_id,category,currency)
);
alter table public.crm_case_direction enable row level security;
alter table public.crm_case_requests enable row level security;
alter table public.crm_case_decisions enable row level security;
alter table public.crm_case_approval_rules enable row level security;
revoke all on public.crm_case_direction,public.crm_case_requests,public.crm_case_decisions,public.crm_case_approval_rules from public,anon,authenticated;
grant select on public.crm_case_direction,public.crm_case_requests,public.crm_case_decisions,public.crm_case_approval_rules to authenticated;
create policy case_direction_read on public.crm_case_direction for select to authenticated using(private.is_org_member(organization_id));
create policy case_request_read on public.crm_case_requests for select to authenticated using(private.is_org_admin(organization_id));
create policy case_decision_read on public.crm_case_decisions for select to authenticated using(private.is_org_admin(organization_id));
create policy case_rule_read on public.crm_case_approval_rules for select to authenticated using(private.is_org_admin(organization_id));

-- Private privileged writer follows the repository's quote RPC pattern. It never trusts
-- client role, organization, actor, price or margin. Public wrapper is SECURITY INVOKER.
create function private.crm_case_command(p_lead_id uuid,p_expected_revision integer,p_expected_updated_at timestamptz,p_command_id uuid,p_action text,p_reason text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); org uuid; actor_role text; l public.leads%rowtype;
 s public.crm_case_direction%rowtype; req public.crm_case_requests%rowtype;
 prior public.crm_case_decisions%rowtype; rule public.crm_case_approval_rules%rowtype;
 before_state jsonb; command jsonb; answer jsonb; request_id uuid;
 owner_id uuid; due timestamptz; task_id uuid; work text; work_key text;
 v jsonb; q jsonb; complaint jsonb; approve boolean;
 amount numeric; margin numeric; v_currency text; discount numeric; payment_days integer;
begin
 select organization_id,role into org,actor_role from public.profiles where id=actor;
 if actor is null or org is null or actor_role not in ('ADMIN','MANAGER','SALES') then raise exception using errcode='42501',message='CASE_PERMISSION_DENIED'; end if;
 if p_action<>'REQUEST' and actor_role<>'ADMIN' then raise exception using errcode='42501',message='CASE_DIRECTION_REQUIRED'; end if;
 if p_command_id is null or p_expected_revision is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>24000 then raise exception 'CASE_INVALID_COMMAND'; end if;
 if p_action not in ('PRIORITIZE','ASSIGN','REQUEST','PROPOSAL','EXCEPTION','RESOURCE','COMMITMENT','BLOCKER','VERIFY_BLOCKER','ESCALATION','CONTINUE','PAUSE','DISCARD','ATTEND','WAIT','RESOLVE','CLOSE','REOPEN') then raise exception 'CASE_INVALID_ACTION'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 3 and 3000 then raise exception 'CASE_REASON_REQUIRED'; end if;
 -- Lock case BEFORE testing idempotency: simultaneous retries observe the committed receipt.
 select * into l from public.leads where id=p_lead_id and organization_id=org for update;
 if not found then raise exception using errcode='42501',message='CASE_NOT_ACCESSIBLE'; end if;
 if actor_role<>'ADMIN' and coalesce(l.owner_user_id,l.created_by) is distinct from actor then raise exception using errcode='42501',message='CASE_NOT_ASSIGNED'; end if;
 command=jsonb_build_object('action',p_action,'reason',btrim(p_reason),'payload',p_payload,'expected_revision',p_expected_revision,'expected_updated_at',p_expected_updated_at);
 select * into prior from public.crm_case_decisions where id=p_command_id;
 if found then
  if prior.actor_id<>actor or prior.lead_id<>l.id or prior.command<>command then raise exception 'CASE_IDEMPOTENCY_CONFLICT'; end if;
  return prior.result;
 end if;
 insert into public.crm_case_direction(lead_id,organization_id) values(l.id,org) on conflict(lead_id) do nothing;
 select * into s from public.crm_case_direction where lead_id=l.id for update;
 if s.organization_id<>org then raise exception using errcode='42501',message='CASE_NOT_ACCESSIBLE'; end if;
 if s.revision<>p_expected_revision or l.updated_at is distinct from p_expected_updated_at then raise exception using errcode='40001',message='CASE_CONFLICT'; end if;
 if s.lifecycle in ('CLOSED','DISCARDED') and p_action<>'REOPEN' then raise exception 'CASE_REOPEN_REQUIRED'; end if;
 if s.lifecycle='RESOLVED' and p_action not in ('CLOSE','REOPEN','PRIORITIZE') then raise exception 'CASE_REOPEN_REQUIRED'; end if;
 before_state=jsonb_build_object('case',to_jsonb(s),'owner_user_id',l.owner_user_id,'next_action',l.next_action,'next_action_date',l.next_action_date);
 owner_id=nullif(p_payload->>'owner_id','')::uuid;
 due=nullif(p_payload->>'due_at','')::timestamptz;
 work=nullif(btrim(p_payload->>'next_action'),'');
 if owner_id is not null and not exists(select 1 from public.profiles where id=owner_id and organization_id=org and role in ('ADMIN','MANAGER','SALES')) then raise exception 'CASE_INVALID_OWNER'; end if;
 if due is not null and (due<=now() or due>now()+interval '10 years') then raise exception 'CASE_FUTURE_DATE_REQUIRED'; end if;
 if work is not null and length(work)>1000 then raise exception 'CASE_NEXT_ACTION_TOO_LONG'; end if;

 if p_action='PRIORITIZE' then
  if coalesce(p_payload->>'priority','') not in ('LOW','MEDIUM','HIGH','CRITICAL') then raise exception 'CASE_INVALID_PRIORITY'; end if;
  s.priority=p_payload->>'priority';
 elsif p_action='ASSIGN' then
  if owner_id is null or due is null or work is null then raise exception 'CASE_WORK_REQUIRED'; end if;
  update public.leads set owner_user_id=owner_id where id=l.id;
  -- Reassign existing pending direction tasks, keeping their identity and history.
  update public.tasks set assigned_to=owner_id,updated_at=clock_timestamp() where lead_id=l.id and organization_id=org and automation_key like 'case-direction:%' and status not in ('COMPLETED','CANCELLED');
  work_key='followup';
 elsif p_action='REQUEST' then
  if coalesce(p_payload->>'category','') not in ('PROPOSAL','EXCEPTION','RESOURCE','COMMITMENT','BLOCKER','ESCALATION') then raise exception 'CASE_INVALID_REQUEST'; end if;
  if length(btrim(coalesce(p_payload->>'scope',''))) not between 3 and 6000 then raise exception 'CASE_SCOPE_REQUIRED'; end if;
  v=p_payload - 'owner_id' - 'due_at' - 'next_action';
  if p_payload->>'category'='PROPOSAL' then
   if to_regclass('public.quote_versions') is null then raise exception 'CASE_QUOTE_MODULE_UNAVAILABLE'; end if;
   execute 'select to_jsonb(q) from public.quotes q join public.opportunities o on o.id=q.opportunity_id where q.id=$1 and q.organization_id=$2 and o.organization_id=$2 and o.lead_id=$3 for update of q' into q using (p_payload->>'quote_id')::uuid,org,l.id;
   if q is null then raise exception 'CASE_QUOTE_NOT_LINKED'; end if;
   if (q->>'revision')::integer<>(p_payload->>'quote_revision')::integer then raise exception 'CASE_PROPOSAL_CHANGED'; end if;
   execute 'select to_jsonb(v) from public.quote_versions v where quote_id=$1 and organization_id=$2 and revision=$3' into v using (q->>'id')::uuid,org,(q->>'revision')::integer;
   if v is null or nullif(v->'inputs'->>'scope','') is null or v->'financials'->>'total' is null or v->'financials'->>'real_margin_pct' is null then raise exception 'CASE_PROPOSAL_INCOMPLETE'; end if;
   v=jsonb_build_object('quote_id',q->'id','quote_revision',q->'revision','scope',v->'inputs'->'scope','terms',v->'inputs'->'terms','amount',v->'financials'->'total','margin_pct',v->'financials'->'real_margin_pct','currency',q->'currency','version_fingerprint',md5(v::text));
  elsif p_payload->>'category' in ('EXCEPTION','RESOURCE') then
   amount=(p_payload->>'amount')::numeric;v_currency=p_payload->>'currency';
   if amount is null or amount<0 or v_currency is null or v_currency !~ '^[A-Z]{3}$' or nullif(btrim(p_payload->>'limits'),'') is null then raise exception 'CASE_LIMITS_REQUIRED'; end if;
   if p_payload->>'category'='EXCEPTION' then
    if coalesce(p_payload->>'exception_type','') not in ('DISCOUNT','PAYMENT','CHANGE') then raise exception 'CASE_INVALID_EXCEPTION'; end if;
    if p_payload->>'exception_type'='DISCOUNT' and ((p_payload->>'discount_pct')::numeric is null or (p_payload->>'discount_pct')::numeric not between 0 and 100) then raise exception 'CASE_DISCOUNT_REQUIRED'; end if;
    if p_payload->>'exception_type'='PAYMENT' and ((p_payload->>'payment_days')::integer is null or (p_payload->>'payment_days')::integer<0) then raise exception 'CASE_PAYMENT_TERMS_REQUIRED'; end if;
   end if;
  elsif p_payload->>'category'='COMMITMENT' then
   if owner_id is null or due is null then raise exception 'CASE_WORK_REQUIRED'; end if;
   v=v||jsonb_build_object('owner_id',owner_id,'due_at',due);
  elsif p_payload->>'category'='ESCALATION' and nullif(p_payload->>'complaint_id','') is not null then
   if to_regclass('public.complaints') is null then raise exception 'CASE_COMPLAINT_MODULE_UNAVAILABLE'; end if;
   -- Existing complaint access remains governed by its RLS; no complaint data is edited.
   if actor_role<>'ADMIN' then raise exception using errcode='42501',message='CASE_DIRECTION_REQUIRED'; end if;
   execute 'select jsonb_build_object(''id'',id,''reference'',reference) from public.complaints where id=$1' into complaint using (p_payload->>'complaint_id')::bigint;
   if complaint is null then raise exception 'CASE_COMPLAINT_NOT_FOUND'; end if;
   v=v||jsonb_build_object('complaint',complaint);
  end if;
  -- Replace a commitment only explicitly, retaining its old request and decision history.
  if nullif(p_payload->>'supersedes_id','') is not null then
   select * into req from public.crm_case_requests where id=(p_payload->>'supersedes_id')::uuid and organization_id=org and lead_id=l.id for update;
   if not found or req.category<>p_payload->>'category' or req.category<>'COMMITMENT' or req.status not in ('PENDING','APPROVED') then raise exception 'CASE_INVALID_SUPERSESSION'; end if;
   update public.crm_case_requests set status='SUPERSEDED',updated_at=clock_timestamp() where id=req.id;
   update public.tasks set status='CANCELLED',notes=coalesce(notes,'')||E'\nCompromiso sustituido: '||btrim(p_reason),updated_at=clock_timestamp() where organization_id=org and lead_id=l.id and automation_key='case-direction:'||l.id::text||':'||req.id::text and status not in ('COMPLETED','CANCELLED');
  end if;
  insert into public.crm_case_requests(organization_id,lead_id,category,payload,created_by) values(org,l.id,p_payload->>'category',v,actor) returning id into request_id;
 elsif p_action in ('PROPOSAL','EXCEPTION','RESOURCE','COMMITMENT','BLOCKER','VERIFY_BLOCKER','ESCALATION') then
  select * into req from public.crm_case_requests where id=(p_payload->>'request_id')::uuid and organization_id=org and lead_id=l.id for update;
  if not found or req.category<>(case when p_action='VERIFY_BLOCKER' then 'BLOCKER' else p_action end) then raise exception 'CASE_REQUEST_NOT_FOUND'; end if;
  before_state=before_state||jsonb_build_object('request',to_jsonb(req));request_id=req.id;
  if p_action='VERIFY_BLOCKER' then
   if req.status<>'APPROVED' or length(btrim(coalesce(p_payload->>'evidence','')))<3 then raise exception 'CASE_BLOCKER_EVIDENCE_REQUIRED'; end if;
   if exists(select 1 from public.tasks where lead_id=l.id and organization_id=org and automation_key='case-direction:'||l.id::text||':'||req.id::text and status not in ('COMPLETED','CANCELLED')) then raise exception 'CASE_BLOCKER_TASK_PENDING'; end if;
   update public.crm_case_requests set status='RESOLVED',updated_at=clock_timestamp() where id=req.id;
  else
   if req.status<>'PENDING' and not(req.category='BLOCKER' and req.status='REJECTED') then raise exception 'CASE_REQUEST_ALREADY_DECIDED'; end if;
   if coalesce(p_payload->>'outcome','') not in ('APPROVE','REJECT') then raise exception 'CASE_OUTCOME_REQUIRED'; end if;
   approve=p_payload->>'outcome'='APPROVE';
   if req.category='PROPOSAL' then
    execute 'select to_jsonb(q) from public.quotes q where id=$1 and organization_id=$2 for update' into q using (req.payload->>'quote_id')::uuid,org;
    execute 'select to_jsonb(v) from public.quote_versions v where quote_id=$1 and organization_id=$2 and revision=$3' into v using (req.payload->>'quote_id')::uuid,org,(req.payload->>'quote_revision')::integer;
    if q is null or (q->>'revision')::integer<>(req.payload->>'quote_revision')::integer or md5(v::text) is distinct from req.payload->>'version_fingerprint' then raise exception 'CASE_PROPOSAL_CHANGED'; end if;
   end if;
   if approve and req.category in ('PROPOSAL','EXCEPTION','RESOURCE') then
    amount=(req.payload->>'amount')::numeric;v_currency=req.payload->>'currency';margin=(req.payload->>'margin_pct')::numeric;
    select * into rule from public.crm_case_approval_rules where organization_id=org and category=req.category and currency=v_currency and enabled for share;
    if not found or rule.max_amount is null or length(btrim(rule.confirmed_evidence))<3 then raise exception 'CASE_APPROVAL_RULE_REQUIRED'; end if;
    if amount is null or amount<0 or amount>rule.max_amount then raise exception 'CASE_APPROVAL_LIMIT_EXCEEDED'; end if;
    if req.category='PROPOSAL' and (rule.min_margin_pct is null or margin is null or margin<rule.min_margin_pct) then raise exception 'CASE_MARGIN_LIMIT'; end if;
    if req.category='EXCEPTION' then
     discount=(req.payload->>'discount_pct')::numeric;payment_days=(req.payload->>'payment_days')::integer;
     if req.payload->>'exception_type'='DISCOUNT' and (rule.max_discount_pct is null or discount is null or discount>rule.max_discount_pct) then raise exception 'CASE_DISCOUNT_LIMIT'; end if;
     if req.payload->>'exception_type'='PAYMENT' and (rule.max_payment_days is null or payment_days is null or payment_days>rule.max_payment_days) then raise exception 'CASE_PAYMENT_LIMIT'; end if;
    end if;
   end if;
   if approve then
    if owner_id is null or due is null or work is null then raise exception 'CASE_WORK_REQUIRED'; end if;
    if req.category='COMMITMENT' and (owner_id is distinct from (req.payload->>'owner_id')::uuid or due is distinct from (req.payload->>'due_at')::timestamptz) then raise exception 'CASE_COMMITMENT_CHANGED'; end if;
    work_key=req.id::text;
   else work=null; end if;
   -- A rejected blocker still exists until resolution evidence is verified.
   update public.crm_case_requests set status=case when approve then 'APPROVED' else 'REJECTED' end,updated_at=clock_timestamp() where id=req.id;
  end if;
 elsif p_action in ('CONTINUE','PAUSE','DISCARD','REOPEN','ATTEND','WAIT','RESOLVE','CLOSE') then
  if p_action='REOPEN' and s.lifecycle not in ('CLOSED','DISCARDED','RESOLVED','PAUSED') then raise exception 'CASE_NOT_REOPENABLE'; end if;
  if p_action in ('CONTINUE','PAUSE','REOPEN','ATTEND','WAIT') then
   if owner_id is null or due is null or work is null then raise exception 'CASE_WORK_REQUIRED'; end if;
   work_key='followup';
  end if;
  if p_action in ('ATTEND','RESOLVE','CLOSE','REOPEN') and (length(btrim(coalesce(p_payload->>'result','')))<3 or length(btrim(coalesce(p_payload->>'evidence','')))<3) then raise exception 'CASE_RESULT_EVIDENCE_REQUIRED'; end if;
  if p_action in ('RESOLVE','CLOSE') then
   if exists(select 1 from public.tasks where lead_id=l.id and organization_id=org and status not in ('COMPLETED','CANCELLED'))
    or exists(select 1 from public.meetings where lead_id=l.id and organization_id=org and status not in ('COMPLETED','CANCELLED'))
    or exists(select 1 from public.deliverables where lead_id=l.id and organization_id=org and status='PENDING')
    or exists(select 1 from public.crm_case_requests where lead_id=l.id and organization_id=org and (status='PENDING' or category='BLOCKER' and status<>'RESOLVED')) then raise exception 'CASE_PENDING_ACTIONS'; end if;
   if p_action='CLOSE' and s.lifecycle<>'RESOLVED' and coalesce(p_payload->>'administrative','false')<>'true' then raise exception 'CASE_ADMINISTRATIVE_CLOSE_REQUIRED'; end if;
   work=null;
  end if;
  if p_action='DISCARD' then work=null; end if;
  s.lifecycle=case p_action when 'CONTINUE' then 'PENDING' when 'REOPEN' then 'PENDING' when 'PAUSE' then 'PAUSED' when 'DISCARD' then 'DISCARDED' when 'ATTEND' then 'ATTENDED' when 'WAIT' then 'WAITING_CUSTOMER' when 'RESOLVE' then 'RESOLVED' else 'CLOSED' end;
  s.review_at=case when p_action='PAUSE' then due else null end;
  if p_action in ('ATTEND','RESOLVE','CLOSE','REOPEN') then s.result=p_payload->>'result';s.evidence=p_payload->>'evidence'; end if;
 end if;

 if work is not null then
  if owner_id is null or due is null then raise exception 'CASE_WORK_REQUIRED'; end if;
  work_key=coalesce(work_key,'followup');
  -- Reuse tasks and their existing automation_key, never create a parallel execution module.
  select id into task_id from public.tasks where organization_id=org and lead_id=l.id and automation_key='case-direction:'||l.id::text||':'||work_key for update;
  if task_id is null then
   insert into public.tasks(organization_id,lead_id,institution_id,contact_id,title,status,priority,due_at,assigned_to,created_by,automation_key,notes)
   values(org,l.id,l.institution_id,l.contact_id,work,'PENDING',s.priority,due,owner_id,actor,'case-direction:'||l.id::text||':'||work_key,btrim(p_reason)) returning id into task_id;
  else
   update public.tasks set title=work,status='PENDING',priority=s.priority,due_at=due,assigned_to=owner_id,notes=coalesce(notes,'')||E'\n'||btrim(p_reason),updated_at=clock_timestamp() where id=task_id;
  end if;
  update public.leads set next_action=work,next_action_date=due where id=l.id;
 end if;
 if p_action='PRIORITIZE' then update public.tasks set priority=s.priority,updated_at=clock_timestamp() where lead_id=l.id and organization_id=org and status not in ('COMPLETED','CANCELLED'); end if;
 update public.leads set updated_at=clock_timestamp() where id=l.id returning * into l;
 s.revision=s.revision+1;s.updated_at=clock_timestamp();
 update public.crm_case_direction set revision=s.revision,lifecycle=s.lifecycle,priority=s.priority,review_at=s.review_at,result=s.result,evidence=s.evidence,updated_at=s.updated_at where lead_id=l.id;
 answer=jsonb_build_object('command_id',p_command_id,'lead_id',l.id,'revision',s.revision,'updated_at',l.updated_at,'request_id',request_id,'task_id',task_id,'lifecycle',s.lifecycle);
 insert into public.crm_case_decisions(id,organization_id,lead_id,actor_id,action,reason,command,before_value,after_value,result)
 values(p_command_id,org,l.id,actor,p_action,btrim(p_reason),command,before_state,jsonb_build_object('case',to_jsonb(s),'owner_user_id',l.owner_user_id,'next_action',l.next_action,'next_action_date',l.next_action_date,'request',(select to_jsonb(r) from public.crm_case_requests r where r.id=request_id)),answer);
 -- Leave activity follow-up fields empty: the existing cx_activity_followup_v1 trigger
 -- would otherwise create a second task, assigned to the actor rather than the chosen owner.
 insert into public.activities(organization_id,lead_id,institution_id,contact_id,type,subject,notes,created_by,occurred_at,evidence_note)
 values(org,l.id,l.institution_id,l.contact_id,'NOTE','Decisión de Dirección · '||p_action,btrim(p_reason),actor,clock_timestamp(),nullif(p_payload->>'evidence',''));
 return answer;
end $$;
create function public.crm_case_command(p_lead_id uuid,p_expected_revision integer,p_expected_updated_at timestamptz,p_command_id uuid,p_action text,p_reason text,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.crm_case_command(p_lead_id,p_expected_revision,p_expected_updated_at,p_command_id,p_action,p_reason,p_payload); $$;
revoke all on function private.crm_case_command(uuid,integer,timestamptz,uuid,text,text,jsonb),public.crm_case_command(uuid,integer,timestamptz,uuid,text,text,jsonb) from public,anon;
grant execute on function private.crm_case_command(uuid,integer,timestamptz,uuid,text,text,jsonb),public.crm_case_command(uuid,integer,timestamptz,uuid,text,text,jsonb) to authenticated;
commit;
