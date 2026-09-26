-- CRM Radar promotion bridge v1
-- Applied to production Supabase on 2026-09-25.
-- Purpose: promote an actionable Radar signal into CRM with traceable, idempotent linkage.
-- Non-destructive: creates/links records; does not delete or merge existing CRM entities.

alter table public.leads
  add column if not exists radar_signal_id uuid
  references public.commercial_radar_signals(id) on delete set null;

create unique index if not exists leads_org_radar_signal_uq
  on public.leads(organization_id, radar_signal_id)
  where radar_signal_id is not null;

create index if not exists commercial_radar_signals_lead_id_idx
  on public.commercial_radar_signals(lead_id);

create index if not exists commercial_radar_signals_institution_id_idx
  on public.commercial_radar_signals(institution_id);

create index if not exists prospect_intelligence_snapshot_org_snapshot_idx
  on public.prospect_intelligence_snapshot(organization_id, snapshot_at desc);

create or replace function public.crm_promote_radar_signal(p_signal_id uuid)
returns table(
  signal_id uuid,
  institution_id uuid,
  contact_id uuid,
  lead_id uuid,
  institution_created boolean,
  contact_created boolean,
  lead_created boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_signal public.commercial_radar_signals%rowtype;
  v_org uuid;
  v_user uuid;
  v_institution uuid;
  v_contact uuid;
  v_lead uuid;
  v_institution_created boolean := false;
  v_contact_created boolean := false;
  v_lead_created boolean := false;
  v_active_lead_count integer := 0;
begin
  v_user := (select auth.uid());
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select s.* into v_signal
  from public.commercial_radar_signals s
  where s.id = p_signal_id
  for update;

  if not found then raise exception 'RADAR_SIGNAL_NOT_FOUND'; end if;
  v_org := v_signal.organization_id;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user
      and p.organization_id = v_org
      and p.role in ('ADMIN','MANAGER','SALES')
  ) then raise exception 'NOT_AUTHORIZED'; end if;

  if coalesce(v_signal.actionable,false) is not true then
    raise exception 'SIGNAL_NOT_ACTIONABLE';
  end if;

  if v_signal.lead_id is not null then
    return query
    select v_signal.id, v_signal.institution_id, null::uuid, v_signal.lead_id,
           false, false, false;
    return;
  end if;

  v_institution := v_signal.institution_id;

  if v_institution is null then
    select i.id into v_institution
    from public.institutions i
    where i.organization_id = v_org
      and lower(btrim(i.name)) = lower(btrim(v_signal.institution_name))
    order by i.created_at
    limit 1;
  end if;

  if v_institution is null then
    insert into public.institutions(
      organization_id,name,type,website,phone,email,city,country,notes,created_by
    )
    values(
      v_org,
      v_signal.institution_name,
      case when v_signal.school_sector in ('PRIVATE','PUBLIC') then 'SCHOOL' else 'OTHER' end,
      nullif(btrim(v_signal.website),''),
      nullif(btrim(v_signal.contact_phone),''),
      nullif(btrim(v_signal.contact_email),''),
      nullif(btrim(v_signal.city),''),
      'Peru',
      'Creada desde Radar Comercial · señal '||v_signal.id::text,
      v_user
    )
    returning id into v_institution;
    v_institution_created := true;
  end if;

  if nullif(btrim(v_signal.decision_maker_name),'') is not null then
    select c.id into v_contact
    from public.contacts c
    where c.organization_id = v_org
      and c.institution_id = v_institution
      and (
        (nullif(btrim(v_signal.contact_email),'') is not null and lower(c.email)=lower(btrim(v_signal.contact_email)))
        or
        (nullif(btrim(v_signal.contact_phone),'') is not null and c.phone=btrim(v_signal.contact_phone))
        or
        lower(btrim(c.first_name))=lower(btrim(v_signal.decision_maker_name))
      )
    order by c.created_at
    limit 1;

    if v_contact is null then
      insert into public.contacts(
        organization_id,institution_id,first_name,job_title,email,phone,decision_level,notes,created_by
      )
      values(
        v_org,
        v_institution,
        btrim(v_signal.decision_maker_name),
        nullif(btrim(v_signal.decision_maker_title),''),
        nullif(btrim(v_signal.contact_email),''),
        nullif(btrim(v_signal.contact_phone),''),
        case v_signal.decision_access
          when 'FINAL_APPROVER' then 'FINAL_APPROVER'
          when 'DIRECT_DECISION_MAKER' then 'DECISION_MAKER'
          when 'INFLUENCER' then 'INFLUENCER'
          else 'UNKNOWN'
        end,
        'Creado desde Radar Comercial · señal '||v_signal.id::text,
        v_user
      )
      returning id into v_contact;
      v_contact_created := true;
    end if;
  end if;

  select count(*) into v_active_lead_count
  from public.leads l
  where l.organization_id = v_org
    and l.institution_id = v_institution
    and l.status not in ('CONVERTED','DISQUALIFIED');

  if v_active_lead_count = 1 then
    select l.id into v_lead
    from public.leads l
    where l.organization_id = v_org
      and l.institution_id = v_institution
      and l.status not in ('CONVERTED','DISQUALIFIED')
    order by l.created_at
    limit 1;
  else
    v_lead := null;
  end if;

  if v_lead is null then
    insert into public.leads(
      organization_id,institution_id,contact_id,title,source,status,score,estimated_value,
      next_action,owner_user_id,created_by,radar_signal_id,routing_area,routing_reason
    )
    values(
      v_org,
      v_institution,
      v_contact,
      v_signal.institution_name||' · Radar',
      'OTHER',
      case when coalesce(v_signal.contact_email,v_signal.contact_phone,v_signal.contact_whatsapp) is not null
           then 'CONTACT_PENDING' else 'RESEARCHING' end,
      greatest(0,least(100,coalesce(v_signal.weighted_score,0))),
      greatest(0,coalesce(v_signal.estimated_value,0)),
      coalesce(nullif(btrim(v_signal.next_action),''),'Revisar evidencia y definir siguiente acción'),
      v_user,
      v_user,
      v_signal.id,
      'COMMERCIAL',
      'Promovido desde Radar Comercial con evidencia trazable.'
    )
    returning id into v_lead;
    v_lead_created := true;
  else
    update public.leads
      set radar_signal_id = coalesce(radar_signal_id,v_signal.id),
          contact_id = coalesce(contact_id,v_contact),
          score = greatest(score,greatest(0,least(100,coalesce(v_signal.weighted_score,0)))),
          next_action = coalesce(next_action,nullif(btrim(v_signal.next_action),'')),
          updated_at = now()
    where id = v_lead;
  end if;

  update public.commercial_radar_signals
    set institution_id = v_institution,
        lead_id = v_lead,
        workflow_status = 'PROMOTED_TO_LEAD',
        updated_at = now()
  where id = v_signal.id;

  return query
  select v_signal.id, v_institution, v_contact, v_lead,
         v_institution_created, v_contact_created, v_lead_created;
end;
$$;

revoke execute on function public.crm_promote_radar_signal(uuid) from public;
revoke execute on function public.crm_promote_radar_signal(uuid) from anon;
grant execute on function public.crm_promote_radar_signal(uuid) to authenticated;
