-- DEV ONLY: project rmximatxuaczhpqbcuho. No new tables or client permissions.
-- Apply only after confirming the project ID through the management API.
begin;
do $$ begin
  if not exists (select 1 from public.organizations where slug='xicronix-commercial-intelligence-dev') then
    raise exception 'CRM DEV organization guard failed';
  end if;
end $$;
alter table public.activities add column web_submission jsonb;
create unique index activities_web_submission_dev_uidx
  on public.activities(organization_id, (web_submission->>'leadId')) where web_submission is not null;

create function public.web_intake_dev_v1(envelope jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  org_id uuid;
  owner_id uuid;
  institution_id_v uuid;
  contact_id_v uuid;
  lead_id_v uuid;
  opportunity_id_v uuid;
  task_id_v uuid;
  activity_id_v uuid;
  existing public.activities%rowtype;
  external_id uuid;
  email_v text := lower(btrim(envelope#>>'{contact,email}'));
  name_v text := btrim(envelope#>>'{contact,name}');
  institution_v text := nullif(btrim(envelope#>>'{contact,institution}'),'');
  interest_v text := coalesce(nullif(envelope#>>'{request,interest}',''),'otro');
  message_v text := envelope#>>'{request,message}';
  submitted_at_v timestamptz;
  due_at_v timestamptz := now()+interval '24 hours';
  title_v text;
  normalized jsonb;
begin
  if current_user not in ('service_role','postgres') then raise exception 'Trusted server only' using errcode='42501'; end if;
  if envelope->>'environment' is distinct from 'dev' or envelope->>'source' is distinct from 'xicronix-web' then
    raise exception 'Invalid DEV envelope' using errcode='22023';
  end if;
  select id into org_id from public.organizations where slug='xicronix-commercial-intelligence-dev';
  if org_id is null then raise exception 'DEV guard failed'; end if;
  external_id := (envelope->>'leadId')::uuid;
  submitted_at_v := (envelope->>'submittedAt')::timestamptz;
  if external_id is null or submitted_at_v is null or length(coalesce(name_v,''))<2 or length(name_v)>100
    or coalesce(email_v,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(email_v)>180
    or length(coalesce(message_v,''))<15 or length(message_v)>4000
    or (envelope#>>'{privacyNotice,acknowledged}') is distinct from 'true'
    or nullif(envelope#>>'{privacyNotice,version}','') is null
    or nullif(envelope#>>'{privacyNotice,acknowledgedAt}','') is null then
    raise exception 'Invalid submission' using errcode='22023';
  end if;
  -- First release accepts only synthetic DEV contacts; never sends email.
  if email_v not like '%@example.invalid' then raise exception 'Synthetic DEV contacts only' using errcode='22023'; end if;
  if submitted_at_v > now()+interval '5 minutes' or submitted_at_v < now()-interval '1 day' then raise exception 'Invalid submission date' using errcode='22023'; end if;
  perform (envelope#>>'{privacyNotice,acknowledgedAt}')::timestamptz;
  normalized := envelope - 'submittedAt';
  -- Serialize intake within the DEV organization: exact-once processing, including concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':web-intake',0));
  select * into existing from public.activities where organization_id=org_id and web_submission->>'leadId'=external_id::text;
  if found then
    if existing.web_submission - 'submittedAt' <> normalized then raise exception 'Idempotency key conflicts with payload' using errcode='22023'; end if;
    select id into task_id_v from public.tasks where organization_id=org_id and automation_key='cx:web:'||existing.lead_id::text;
    if existing.lead_id is null or existing.opportunity_id is null or task_id_v is null then raise exception 'Incomplete intake receipt'; end if;
    return jsonb_build_object('ok',true,'synced',true,'duplicate',true,'reference',external_id,'leadId',existing.lead_id,'opportunityId',existing.opportunity_id,'taskId',task_id_v);
  end if;
  if (select count(*) from public.activities where organization_id=org_id and web_submission is not null and created_at>now()-interval '10 minutes')>=100 then
    raise exception 'DEV intake rate limit exceeded' using errcode='P0001';
  end if;
  select id into owner_id from public.profiles where organization_id=org_id and role='ADMIN' order by created_at,id limit 1;
  if owner_id is null then raise exception 'DEV intake owner missing'; end if;
  if institution_v is not null then
    select id into institution_id_v from public.institutions where organization_id=org_id and lower(btrim(name))=lower(institution_v) order by created_at,id limit 1;
    if institution_id_v is null then
      insert into public.institutions(organization_id,name,type,created_by)
      values(org_id,institution_v,case when envelope#>>'{contact,institutionType}'='Colegio' then 'SCHOOL' when envelope#>>'{contact,institutionType}'='Empresa' then 'COMPANY' else 'OTHER' end,owner_id) returning id into institution_id_v;
    end if;
  end if;
  select id into contact_id_v from public.contacts where organization_id=org_id and lower(btrim(email))=email_v
    and institution_id is not distinct from institution_id_v order by created_at,id limit 1;
  if contact_id_v is null then
    insert into public.contacts(organization_id,institution_id,first_name,email,phone,job_title,created_by)
    values(org_id,institution_id_v,name_v,email_v,nullif(envelope#>>'{contact,phone}',''),nullif(envelope#>>'{contact,role}',''),owner_id) returning id into contact_id_v;
  end if;
  title_v := coalesce(institution_v,name_v)||' · '||interest_v;
  -- Reuse an active WEBSITE case for the same contact, institution and commercial interest.
  select l.id,o.id into lead_id_v,opportunity_id_v from public.leads l
    join public.opportunities o on o.lead_id=l.id and o.organization_id=org_id
    where l.organization_id=org_id and l.contact_id=contact_id_v and l.source='WEBSITE'
      and l.status not in ('DISQUALIFIED') and o.stage not in ('WON','LOST')
      and exists(select 1 from public.activities a where a.lead_id=l.id and a.organization_id=org_id
        and coalesce(nullif(a.web_submission#>>'{request,interest}',''),'otro')=interest_v and a.web_submission is not null)
    order by o.created_at,o.id limit 1;
  if lead_id_v is null then
    insert into public.leads(organization_id,institution_id,contact_id,title,source,status,score,next_action,next_action_date,owner_user_id,created_by,routing_area,routing_reason)
    values(org_id,institution_id_v,contact_id_v,title_v,'WEBSITE','NEW',0,'Revisar solicitud web y coordinar diagnóstico.',due_at_v,owner_id,owner_id,'COMMERCIAL','Solicitud directa por formulario web; pendiente de calificación humana.') returning id into lead_id_v;
    insert into public.opportunities(organization_id,institution_id,contact_id,lead_id,name,stage,value,probability,score,next_action,next_action_date,owner_user_id,created_by)
    values(org_id,institution_id_v,contact_id_v,lead_id_v,title_v,'DETECTED',0,0,0,'Revisar solicitud web y coordinar diagnóstico.',due_at_v,owner_id,owner_id) returning id into opportunity_id_v;
  end if;
  insert into public.tasks(organization_id,institution_id,contact_id,lead_id,opportunity_id,title,status,priority,due_at,assigned_to,created_by,automation_key,notes)
  values(org_id,institution_id_v,contact_id_v,lead_id_v,opportunity_id_v,'Revisar solicitud web · '||title_v,'PENDING','MEDIUM',due_at_v,owner_id,owner_id,'cx:web:'||lead_id_v::text,'Origen: xicronix-web. Consultar actividades WEB_FORM para cada solicitud y su trazabilidad.')
  on conflict(organization_id,automation_key) do update set
    status=case when public.tasks.status in ('COMPLETED','CANCELLED') then 'PENDING' else public.tasks.status end,
    due_at=case when public.tasks.status in ('COMPLETED','CANCELLED') then excluded.due_at else public.tasks.due_at end,
    updated_at=now()
  returning id into task_id_v;
  insert into public.activities(organization_id,institution_id,contact_id,lead_id,opportunity_id,type,subject,notes,occurred_at,created_by,action_code,evidence_note,web_submission)
  values(org_id,institution_id_v,contact_id_v,lead_id_v,opportunity_id_v,'WEB_FORM','Solicitud web · '||interest_v,message_v,submitted_at_v,owner_id,'WEB_INTAKE_DEV',
    'Referencia: '||external_id::text||E'\nFuente: xicronix-web\nInterés: '||interest_v||E'\nPágina: '||coalesce(envelope#>>'{attribution,submissionPath}','/contacto'),envelope)
  returning id into activity_id_v;
  return jsonb_build_object('ok',true,'synced',true,'duplicate',false,'reference',external_id,'leadId',lead_id_v,'opportunityId',opportunity_id_v,'taskId',task_id_v);
end $$;
revoke all on function public.web_intake_dev_v1(jsonb) from public,anon,authenticated;
grant execute on function public.web_intake_dev_v1(jsonb) to service_role;
commit;
