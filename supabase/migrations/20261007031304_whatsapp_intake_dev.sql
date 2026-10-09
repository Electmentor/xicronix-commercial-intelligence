-- DEV ONLY. Founder authorized persistence with synthetic data, not production.
-- Run in an isolated DEV session: SET app.whatsapp_environment = 'dev';
do $$ begin
  if current_setting('app.whatsapp_environment', true) is distinct from 'dev' then
    raise exception 'WhatsApp migration requires an explicitly isolated DEV environment';
  end if;
end $$;

create table public.whatsapp_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  event_key text not null check (event_key ~ '^[a-f0-9]{64}$'),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null default now(),
  processing_status text not null default 'received'
    check (processing_status in ('received','review','processed')),
  contact_id uuid references public.contacts(id),
  owner_user_id uuid references public.profiles(id),
  next_step text not null default 'Revisar consulta y preparar respuesta humana',
  task_id uuid references public.tasks(id),
  activity_id uuid references public.activities(id),
  processed_at timestamptz,
  unique (organization_id,event_key)
);
create table public.whatsapp_identities (
  organization_id uuid not null references public.organizations(id),
  waba_id text not null,
  phone_number_id text not null,
  wa_id text not null,
  contact_id uuid not null references public.contacts(id),
  confirmed_at timestamptz not null default now(),
  primary key (organization_id,waba_id,phone_number_id,wa_id)
);
alter table public.whatsapp_receipts enable row level security;
alter table public.whatsapp_identities enable row level security;
revoke all on public.whatsapp_receipts, public.whatsapp_identities from public, anon, authenticated;
grant select, insert, update on public.whatsapp_receipts, public.whatsapp_identities to service_role;
-- No commercial-user read grant yet: reuse existing task/contact screens. An inbox
-- grant for additional roles requires checking their real ownership model in DEV.
grant select on public.whatsapp_receipts to authenticated;
create policy whatsapp_admin_read on public.whatsapp_receipts for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=(select auth.uid())
    and p.organization_id=whatsapp_receipts.organization_id and p.role='ADMIN'));

create function public.whatsapp_receive_batch(p_org uuid, p_waba text, p_phone text, p_events jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare e jsonb; existing public.whatsapp_receipts; keys jsonb := '[]';
begin
  if p_org is null or p_waba is null or p_phone is null or jsonb_typeof(p_events) is distinct from 'array'
    or jsonb_array_length(p_events) not between 1 and 1000 then raise exception 'invalid_batch'; end if;
  -- Global key order prevents inversely ordered batches from deadlocking.
  for e in select value from jsonb_array_elements(p_events) order by value->>'eventKey' loop
    if e->>'wabaId' is distinct from p_waba or e->>'phoneNumberId' is distinct from p_phone
      or e->>'kind' is null or e->>'kind' not in ('message','status')
      or nullif(e->>'messageId','') is null or nullif(e->>'occurredAt','') is null
      or (e->>'kind'='message' and nullif(e->>'sender','') is null) then
      raise exception 'invalid_event';
    end if;
    insert into public.whatsapp_receipts(organization_id,event_key,content_hash,payload)
      values(p_org,e->>'eventKey',e->>'contentHash',e)
      on conflict (organization_id,event_key) do nothing;
    select * into strict existing from public.whatsapp_receipts
      where organization_id=p_org and event_key=e->>'eventKey' for update;
    if existing.content_hash is distinct from e->>'contentHash' or existing.payload is distinct from e then
      raise exception 'event_conflict';
    end if;
    keys := keys || jsonb_build_array(existing.event_key);
  end loop;
  return jsonb_build_object('committed',true,'eventKeys',keys);
end $$;

-- Separate readback transaction. JS never treats the commit HTTP status alone as evidence.
create function public.whatsapp_read_receipts(p_org uuid, p_keys jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'eventKey',r.event_key,
    'contentHash',r.content_hash,'processing',r.processing_status) order by r.event_key),'[]'::jsonb)
  from public.whatsapp_receipts r where r.organization_id=p_org
    and r.event_key in (select jsonb_array_elements_text(p_keys));
$$;

-- Only a reviewed exact contact_id establishes identity. No automatic phone merge,
-- contact creation, reassignment or inference of institutional membership.
create function public.whatsapp_bind_contact(p_org uuid,p_waba text,p_phone text,p_sender text,p_contact uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare found_contact uuid;
begin
  if not exists(select 1 from public.contacts where id=p_contact and organization_id=p_org) then
    raise exception 'contact_scope_mismatch'; end if;
  if coalesce(p_waba,'')='' or coalesce(p_phone,'')='' or coalesce(p_sender,'')='' then
    raise exception 'invalid_identity'; end if;
  insert into public.whatsapp_identities(organization_id,waba_id,phone_number_id,wa_id,contact_id)
    values(p_org,p_waba,p_phone,p_sender,p_contact) on conflict do nothing;
  select contact_id into strict found_contact from public.whatsapp_identities
    where organization_id=p_org and waba_id=p_waba and phone_number_id=p_phone and wa_id=p_sender for update;
  if found_contact<>p_contact then raise exception 'identity_conflict_requires_review'; end if;
end $$;

create function public.whatsapp_process_receipt(p_org uuid,p_key text,p_owner uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.whatsapp_receipts; linked_contact uuid; linked_task uuid; linked_activity uuid; body text;
begin
  select * into strict r from public.whatsapp_receipts where organization_id=p_org and event_key=p_key for update;
  if r.processing_status='processed' then
    return jsonb_build_object('processing','processed','contactId',r.contact_id,'taskId',r.task_id,'activityId',r.activity_id);
  end if;
  if r.payload->>'kind'='status' then
    -- Status evidence remains independent from CRM processing and is never sent.
    update public.whatsapp_receipts set processing_status='processed',processed_at=now() where id=r.id;
    return jsonb_build_object('processing','processed');
  end if;
  if p_owner is not null and not exists(select 1 from public.profiles
      where id=p_owner and organization_id=p_org and role in ('ADMIN','MANAGER','SALES')) then
    raise exception 'owner_scope_mismatch'; end if;
  if r.owner_user_id is not null and p_owner is not null and r.owner_user_id<>p_owner then
    raise exception 'owner_reassignment_requires_review'; end if;
  p_owner:=coalesce(r.owner_user_id,p_owner);
  select contact_id into linked_contact from public.whatsapp_identities where organization_id=p_org
    and waba_id=r.payload->>'wabaId' and phone_number_id=r.payload->>'phoneNumberId' and wa_id=r.payload->>'sender';
  -- Recheck membership: an identity may outlive a contact's organization assignment.
  if linked_contact is not null and not exists(select 1 from public.contacts
      where id=linked_contact and organization_id=p_org) then raise exception 'contact_scope_mismatch'; end if;
  body := coalesce(r.payload->>'text','Mensaje no textual: revisar adjunto desde el canal autorizado.');
  linked_task:=r.task_id;
  if linked_task is null then
    insert into public.tasks(organization_id,contact_id,title,status,priority,assigned_to,automation_key,notes)
      values(p_org,linked_contact,'Revisar consulta WhatsApp','PENDING','MEDIUM',p_owner,
        'wa:receipt:'||r.id::text,body) returning id into linked_task;
  else
    if exists(select 1 from public.tasks where id=linked_task and organization_id=p_org
      and assigned_to is not null and assigned_to is distinct from p_owner) then
      raise exception 'task_owner_changed_requires_review'; end if;
    update public.tasks set contact_id=linked_contact,assigned_to=coalesce(assigned_to,p_owner)
      where id=linked_task and organization_id=p_org;
  end if;
  if linked_contact is null or p_owner is null then
    update public.whatsapp_receipts set processing_status='review',task_id=linked_task,
      contact_id=linked_contact,owner_user_id=p_owner,
      next_step=case when linked_contact is null then 'Identificar cliente y confirmar asociación'
        else 'Asignar responsable para respuesta humana' end where id=r.id;
    return jsonb_build_object('processing','review','contactId',linked_contact,'taskId',linked_task);
  end if;
  insert into public.activities(organization_id,contact_id,type,subject,notes,occurred_at,created_by)
    values(p_org,linked_contact,'WHATSAPP','Consulta recibida por WhatsApp',body,
      (r.payload->>'occurredAt')::timestamptz,p_owner) returning id into linked_activity;
  update public.whatsapp_receipts set processing_status='processed',contact_id=linked_contact,
    owner_user_id=p_owner,task_id=linked_task,activity_id=linked_activity,processed_at=now(),
    next_step='Revisar consulta y preparar respuesta humana' where id=r.id;
  return jsonb_build_object('processing','processed','contactId',linked_contact,'taskId',linked_task,'activityId',linked_activity);
end $$;

revoke all on function public.whatsapp_receive_batch(uuid,text,text,jsonb),
  public.whatsapp_read_receipts(uuid,jsonb), public.whatsapp_bind_contact(uuid,text,text,text,uuid),
  public.whatsapp_process_receipt(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_receive_batch(uuid,text,text,jsonb),
  public.whatsapp_read_receipts(uuid,jsonb), public.whatsapp_bind_contact(uuid,text,text,text,uuid),
  public.whatsapp_process_receipt(uuid,text,uuid) to service_role;
