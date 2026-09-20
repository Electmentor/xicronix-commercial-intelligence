-- Xicronix Prospect Intelligence backend v0.1
-- DEV ONLY until explicitly promoted through Human Gate.

create table if not exists public.pi_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  state text not null default 'DETECTED' check (state in ('DETECTED','RESEARCHING','QUALIFIED','PRIORITIZED','READY_FOR_CRM','TRANSFERRED','MONITORING','DISCARDED')),
  organization_name text not null,
  organization_type text not null default 'OTHER',
  organization_ruc text,
  organization_website text,
  organization_city text,
  organization_country text not null default 'Peru',
  sector text,
  hypothesis text,
  dimensions jsonb not null default '{"F":0,"N":0,"C":0,"T":0,"A":0,"E":0}'::jsonb,
  potential_score integer check (potential_score is null or potential_score between 0 and 100),
  confidence_score integer check (confidence_score is null or confidence_score between 0 and 100),
  next_action text,
  next_action_date timestamptz,
  transfer_reason text,
  analysis_version text not null default 'pi-rules-v0.1',
  crm_institution_id uuid references public.institutions(id) on delete set null,
  crm_lead_id uuid references public.leads(id) on delete set null,
  crm_opportunity_id uuid references public.opportunities(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  transferred_at timestamptz
);

create table if not exists public.pi_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.pi_cases(id) on delete cascade,
  label text not null,
  source text,
  source_url text,
  observed_at timestamptz not null default now(),
  is_new boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.pi_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.pi_cases(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('FACT','CONFIRMATION','INFERENCE','HYPOTHESIS','CONTRADICTION','MISSING_DATA')),
  source text,
  source_url text,
  note text not null,
  critical boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.pi_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.pi_cases(id) on delete cascade,
  status text not null default 'PREPARED' check (status in ('PREPARED','EXECUTED','FAILED','CANCELLED')),
  contract_version text not null default 'pi-crm-v0.1',
  resolution_action text not null,
  payload jsonb not null,
  crm_institution_id uuid references public.institutions(id) on delete set null,
  crm_lead_id uuid references public.leads(id) on delete set null,
  crm_opportunity_id uuid references public.opportunities(id) on delete set null,
  error_text text,
  created_by uuid,
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

create index if not exists pi_cases_org_state_idx on public.pi_cases(organization_id,state);
create index if not exists pi_signals_case_idx on public.pi_signals(case_id,observed_at desc);
create index if not exists pi_evidence_case_idx on public.pi_evidence(case_id,created_at desc);
create index if not exists pi_transfers_case_idx on public.pi_transfers(case_id,created_at desc);

create or replace function private.pi_dim_value(d jsonb,key text)
returns numeric language sql immutable set search_path='' as $$
  select greatest(0,least(5,coalesce((d->>key)::numeric,0)))
$$;

create or replace function private.pi_dimension_score(d jsonb)
returns integer language sql immutable set search_path='' as $$
  select round(
    private.pi_dim_value(d,'F')*20*0.25 +
    private.pi_dim_value(d,'N')*20*0.20 +
    private.pi_dim_value(d,'C')*20*0.15 +
    private.pi_dim_value(d,'T')*20*0.15 +
    private.pi_dim_value(d,'A')*20*0.10 +
    private.pi_dim_value(d,'E')*20*0.15
  )::integer
$$;

create or replace function private.pi_confidence_score(target_case uuid)
returns integer language sql stable security definer set search_path='' as $$
  with e as (
    select
      count(*) filter (where evidence_type in ('FACT','CONFIRMATION') and nullif(btrim(source),'') is not null and nullif(btrim(source_url),'') is not null) as traceable,
      count(*) filter (where evidence_type in ('FACT','CONFIRMATION')) as supportive,
      count(*) filter (where evidence_type='CONTRADICTION' and critical) as critical_contradictions
    from public.pi_evidence where case_id=target_case
  ), c as (
    select dimensions from public.pi_cases where id=target_case
  )
  select greatest(0,least(100,round(
    20
    + least(30,e.traceable*10)
    + least(20,e.supportive*5)
    + private.pi_dim_value(c.dimensions,'E')*12
    - e.critical_contradictions*30
  )))::integer from e,c
$$;

create or replace function private.pi_duplicate_resolution(target_case uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  c public.pi_cases%rowtype;
  inst public.institutions%rowtype;
  match_count integer;
  active_lead public.leads%rowtype;
  active_opp public.opportunities%rowtype;
begin
  select * into c from public.pi_cases where id=target_case;
  if not found then raise exception 'PI case not found'; end if;

  select count(*) into match_count
  from public.institutions i
  where i.organization_id=c.organization_id
    and (
      (nullif(btrim(c.organization_ruc),'') is not null and i.ruc=c.organization_ruc)
      or (nullif(btrim(c.organization_website),'') is not null and lower(trim(i.website))=lower(trim(c.organization_website)))
      or lower(trim(i.name))=lower(trim(c.organization_name))
    );

  if match_count>1 then
    return jsonb_build_object('status','UNCERTAIN','action','MANUAL_IDENTITY_REVIEW');
  elsif match_count=0 then
    return jsonb_build_object('status','NEW','action','CREATE_ORG_AND_LEAD');
  end if;

  select * into inst
  from public.institutions i
  where i.organization_id=c.organization_id
    and (
      (nullif(btrim(c.organization_ruc),'') is not null and i.ruc=c.organization_ruc)
      or (nullif(btrim(c.organization_website),'') is not null and lower(trim(i.website))=lower(trim(c.organization_website)))
      or lower(trim(i.name))=lower(trim(c.organization_name))
    )
  limit 1;

  select * into active_opp from public.opportunities
  where organization_id=c.organization_id and institution_id=inst.id and stage not in ('WON','LOST')
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('status','OPPORTUNITY_EXISTS','action','ENRICH_EXISTING_OPPORTUNITY','institution_id',inst.id,'opportunity_id',active_opp.id);
  end if;

  select * into active_lead from public.leads
  where organization_id=c.organization_id and institution_id=inst.id and status not in ('DISQUALIFIED','CONVERTED')
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('status','LEAD_EXISTS','action','ENRICH_EXISTING_LEAD','institution_id',inst.id,'lead_id',active_lead.id);
  end if;

  return jsonb_build_object('status','ORG_EXISTS','action','REUSE_ORG_CREATE_LEAD','institution_id',inst.id);
end
$$;

create or replace function public.pi_readiness(target_case uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  c public.pi_cases%rowtype;
  potential integer;
  confidence integer;
  duplicate jsonb;
  evidence_ok boolean;
  contradiction_ok boolean;
  checks jsonb;
  ready boolean;
begin
  select * into c from public.pi_cases where id=target_case;
  if not found then raise exception 'PI case not found'; end if;
  if not private.is_org_member(c.organization_id) then raise exception 'Access denied'; end if;

  potential:=private.pi_dimension_score(c.dimensions);
  confidence:=private.pi_confidence_score(c.id);
  duplicate:=private.pi_duplicate_resolution(c.id);

  select exists(
    select 1 from public.pi_evidence e
    where e.case_id=c.id and e.evidence_type in ('FACT','CONFIRMATION')
      and nullif(btrim(e.source),'') is not null and nullif(btrim(e.source_url),'') is not null
  ) into evidence_ok;

  select not exists(
    select 1 from public.pi_evidence e
    where e.case_id=c.id and e.evidence_type='CONTRADICTION' and e.critical
  ) into contradiction_ok;

  checks:=jsonb_build_object(
    'identity',nullif(btrim(c.organization_name),'') is not null,
    'hypothesis',nullif(btrim(c.hypothesis),'') is not null,
    'need',private.pi_dim_value(c.dimensions,'N')>=3,
    'evidence',evidence_ok,
    'fit',private.pi_dim_value(c.dimensions,'F')>=3,
    'potential',potential>=60,
    'confidence',confidence>=60,
    'next_action',nullif(btrim(c.next_action),'') is not null,
    'contradiction',contradiction_ok,
    'duplicate',coalesce(duplicate->>'status','UNCERTAIN')<>'UNCERTAIN'
  );

  select bool_and(value::boolean) into ready
  from jsonb_each_text(checks);

  return jsonb_build_object(
    'ready',coalesce(ready,false),
    'checks',checks,
    'potential_score',potential,
    'confidence_score',confidence,
    'duplicate_resolution',duplicate
  );
end
$$;

create or replace function public.pi_prepare_transfer(target_case uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c public.pi_cases%rowtype;
  gate jsonb;
  transfer_id uuid;
  payload jsonb;
begin
  select * into c from public.pi_cases where id=target_case for update;
  if not found then raise exception 'PI case not found'; end if;
  if not private.can_write_org(c.organization_id) then raise exception 'Write access denied'; end if;

  gate:=public.pi_readiness(c.id);
  if coalesce((gate->>'ready')::boolean,false)=false then raise exception 'PI case is not READY_FOR_CRM'; end if;

  payload:=jsonb_build_object(
    'contract_version','pi-crm-v0.1',
    'source_system','xicronix-prospect-intelligence-dev',
    'analysis_version',c.analysis_version,
    'transferred_at',now(),
    'organization_identity',jsonb_build_object(
      'name',c.organization_name,'type',c.organization_type,'ruc',c.organization_ruc,
      'website',c.organization_website,'city',c.organization_city,'country',c.organization_country
    ),
    'commercial_hypothesis',c.hypothesis,
    'dimensions',c.dimensions,
    'potential_score',gate->'potential_score',
    'confidence_score',gate->'confidence_score',
    'suggested_next_action',c.next_action,
    'suggested_next_action_date',c.next_action_date,
    'transfer_reason',c.transfer_reason,
    'signals',(select coalesce(jsonb_agg(to_jsonb(s)-'organization_id'-'case_id'-'created_by'),'[]'::jsonb) from public.pi_signals s where s.case_id=c.id),
    'evidence',(select coalesce(jsonb_agg(to_jsonb(e)-'organization_id'-'case_id'-'created_by'),'[]'::jsonb) from public.pi_evidence e where e.case_id=c.id),
    'duplicate_resolution',gate->'duplicate_resolution'
  );

  insert into public.pi_transfers(organization_id,case_id,resolution_action,payload,created_by)
  values(c.organization_id,c.id,gate#>>'{duplicate_resolution,action}',payload,auth.uid())
  returning id into transfer_id;

  if c.state='PRIORITIZED' then
    update public.pi_cases set state='READY_FOR_CRM',potential_score=(gate->>'potential_score')::integer,
      confidence_score=(gate->>'confidence_score')::integer,updated_at=now()
    where id=c.id;
  end if;

  return jsonb_build_object('transfer_id',transfer_id,'payload',payload,'gate',gate);
end
$$;

create or replace function public.pi_execute_transfer(target_transfer uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  t public.pi_transfers%rowtype;
  c public.pi_cases%rowtype;
  action text;
  inst_id uuid;
  lead_id uuid;
  opp_id uuid;
  note_text text;
begin
  select * into t from public.pi_transfers where id=target_transfer for update;
  if not found then raise exception 'PI transfer not found'; end if;
  if t.status<>'PREPARED' then raise exception 'Transfer is not PREPARED'; end if;
  if not private.can_write_org(t.organization_id) then raise exception 'Write access denied'; end if;

  select * into c from public.pi_cases where id=t.case_id for update;
  action:=t.resolution_action;
  inst_id:=(t.payload#>>'{duplicate_resolution,institution_id}')::uuid;
  lead_id:=(t.payload#>>'{duplicate_resolution,lead_id}')::uuid;
  opp_id:=(t.payload#>>'{duplicate_resolution,opportunity_id}')::uuid;

  if action='MANUAL_IDENTITY_REVIEW' then raise exception 'Manual identity review required'; end if;

  if action='CREATE_ORG_AND_LEAD' then
    insert into public.institutions(organization_id,name,type,ruc,website,city,country,notes,created_by)
    values(c.organization_id,c.organization_name,c.organization_type,c.organization_ruc,c.organization_website,c.organization_city,c.organization_country,'Creado desde Prospect Intelligence DEV',auth.uid())
    returning id into inst_id;
  end if;

  if action in ('CREATE_ORG_AND_LEAD','REUSE_ORG_CREATE_LEAD') then
    insert into public.leads(organization_id,institution_id,title,source,status,score,estimated_value,next_action,next_action_date,created_by,routing_area,routing_reason)
    values(c.organization_id,inst_id,left(coalesce(c.hypothesis,c.organization_name),250),'OTHER','NEW',0,0,c.next_action,c.next_action_date,auth.uid(),'COMMERCIAL','Transferencia desde Prospect Intelligence DEV')
    returning id into lead_id;
  end if;

  note_text:='PI transfer '||t.id::text||' · contract pi-crm-v0.1 · potential='||(t.payload->>'potential_score')||' · confidence='||(t.payload->>'confidence_score');

  insert into public.activities(organization_id,institution_id,lead_id,opportunity_id,type,subject,notes,evidence_note,occurred_at,created_by,next_action,next_action_date)
  values(c.organization_id,inst_id,lead_id,opp_id,'NOTE','Prospect Intelligence transfer',note_text,(t.payload->'evidence')::text,now(),auth.uid(),c.next_action,c.next_action_date);

  if c.next_action_date is not null then
    insert into public.tasks(organization_id,institution_id,lead_id,opportunity_id,title,status,priority,due_at,assigned_to,created_by,automation_key,notes)
    values(c.organization_id,inst_id,lead_id,opp_id,c.next_action,'PENDING','HIGH',c.next_action_date,auth.uid(),auth.uid(),'pi:transfer:'||t.id::text,'Generada desde Prospect Intelligence DEV')
    on conflict(organization_id,automation_key) do nothing;
  end if;

  update public.pi_transfers set status='EXECUTED',crm_institution_id=inst_id,crm_lead_id=lead_id,crm_opportunity_id=opp_id,executed_at=now()
  where id=t.id;

  update public.pi_cases set state='TRANSFERRED',crm_institution_id=inst_id,crm_lead_id=lead_id,crm_opportunity_id=opp_id,transferred_at=now(),updated_at=now()
  where id=c.id;

  return jsonb_build_object('status','EXECUTED','institution_id',inst_id,'lead_id',lead_id,'opportunity_id',opp_id);
exception when others then
  update public.pi_transfers set status='FAILED',error_text=sqlerrm where id=target_transfer;
  raise;
end
$$;

alter table public.pi_cases enable row level security;
alter table public.pi_signals enable row level security;
alter table public.pi_evidence enable row level security;
alter table public.pi_transfers enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pi_cases','pi_signals','pi_evidence','pi_transfers']
  loop
    execute format('drop policy if exists %I_read_org on public.%I',t,t);
    execute format('create policy %I_read_org on public.%I for select to authenticated using (private.is_org_member(organization_id))',t,t);
    execute format('drop policy if exists %I_insert_org on public.%I',t,t);
    execute format('create policy %I_insert_org on public.%I for insert to authenticated with check (private.can_write_org(organization_id))',t,t);
    execute format('drop policy if exists %I_update_org on public.%I',t,t);
    execute format('create policy %I_update_org on public.%I for update to authenticated using (private.can_write_org(organization_id)) with check (private.can_write_org(organization_id))',t,t);
    execute format('drop policy if exists %I_delete_admin on public.%I',t,t);
    execute format('create policy %I_delete_admin on public.%I for delete to authenticated using (private.is_org_admin(organization_id))',t,t);
  end loop;
end $$;

revoke all on function public.pi_prepare_transfer(uuid) from public,anon;
revoke all on function public.pi_execute_transfer(uuid) from public,anon;
grant execute on function public.pi_readiness(uuid) to authenticated;
grant execute on function public.pi_prepare_transfer(uuid) to authenticated;
grant execute on function public.pi_execute_transfer(uuid) to authenticated;


grant select,insert,update,delete on public.pi_cases,public.pi_signals,public.pi_evidence,public.pi_transfers to authenticated;
