-- DEV only; no production migration is authorized.
begin;
do $$ begin
 if current_setting('app.conversations_environment',true) is distinct from 'dev' then
  raise exception 'Requires isolated DEV environment';
 end if;
end $$;
create table public.commercial_conversations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 contact_id uuid not null references public.contacts(id),
 opportunity_id uuid references public.opportunities(id),
 owner_user_id uuid not null references public.profiles(id),
 channel text not null check(channel in ('nexa','whatsapp','email','instagram','phone')),
 external_thread_id text not null check(length(external_thread_id) between 1 and 200),
 source_evidence jsonb not null default '{}',
 status text not null default 'new' check(status in ('new','active','waiting','resolved')),
 attention text not null default 'supervised' check(attention in ('supervised','human')),
 next_action text not null default 'Revisar consulta',
 closed_reason text,
 revision integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,channel,external_thread_id)
);
create table public.commercial_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.commercial_conversations(id),
 event_key text not null check(length(event_key) between 1 and 200),
 direction text not null check(direction in ('in','out')),
 actor text not null check(actor in ('visitor','human','ai')),
 body text not null check(length(body) between 1 and 4000),
 status text not null check(status in ('received','draft','pending','accepted','delivered','read','failed','cancelled','uncertain')),
 provider_id text,
 error_code text,
 occurred_at timestamptz not null,
 created_at timestamptz not null default now(),
 unique(conversation_id,event_key)
);
create table public.commercial_conversation_events (
 id bigint generated always as identity primary key,
 conversation_id uuid not null references public.commercial_conversations(id),
 actor_id uuid references public.profiles(id),
 action text not null,
 occurred_at timestamptz not null default now()
);
create index on public.commercial_conversations(organization_id,owner_user_id,status,updated_at);
create index on public.commercial_messages(conversation_id,occurred_at,id);
create index on public.commercial_conversation_events(conversation_id,occurred_at);
alter table public.commercial_conversations enable row level security;
alter table public.commercial_messages enable row level security;
alter table public.commercial_conversation_events enable row level security;
create policy conversation_read on public.commercial_conversations for select to authenticated using (
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=commercial_conversations.organization_id
 and (p.role in ('ADMIN','MANAGER') or (p.role='SALES' and commercial_conversations.owner_user_id=p.id)))
);
create policy message_read on public.commercial_messages for select to authenticated using (
 exists(select 1 from public.commercial_conversations c where c.id=conversation_id)
);
create policy event_read on public.commercial_conversation_events for select to authenticated using (
 exists(select 1 from public.commercial_conversations c where c.id=conversation_id)
);
revoke all on public.commercial_conversations,public.commercial_messages,public.commercial_conversation_events from public,anon,authenticated;
grant select on public.commercial_conversations,public.commercial_messages,public.commercial_conversation_events to authenticated;
grant select,insert,update on public.commercial_conversations,public.commercial_messages,public.commercial_conversation_events to service_role;
grant usage,select on sequence public.commercial_conversation_events_id_seq to service_role;
-- All transitions are serialized on the conversation row. No browser has write grants.
create function public.conversation_command(p_org uuid,p_actor uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.commercial_conversations; m public.commercial_messages; role_name text; cid uuid; owner_id uuid;
begin
 if p_action='receive' then
  if p_actor is not null or p_data->>'channel' <> 'nexa' or p_data->>'consent' is distinct from 'true' then raise exception 'invalid_intake'; end if;
  owner_id=(p_data->>'owner_id')::uuid;
  if not exists(select 1 from contacts where id=(p_data->>'contact_id')::uuid and organization_id=p_org)
   or not exists(select 1 from profiles where id=owner_id and organization_id=p_org and role in ('ADMIN','MANAGER','SALES')) then raise exception 'scope_mismatch'; end if;
  insert into commercial_conversations(organization_id,contact_id,owner_user_id,channel,external_thread_id,source_evidence)
   values(p_org,(p_data->>'contact_id')::uuid,owner_id,'nexa',p_data->>'thread_id',jsonb_build_object('kind','consented_nexa','page',p_data->>'source_page','consent_version',p_data->>'consent_version'))
   on conflict(organization_id,channel,external_thread_id) do nothing;
  select * into c from commercial_conversations where organization_id=p_org and channel='nexa' and external_thread_id=p_data->>'thread_id' for update;
  if c.contact_id<>(p_data->>'contact_id')::uuid then raise exception 'identity_conflict'; end if;
  select * into m from commercial_messages where conversation_id=c.id and event_key=p_data->>'event_key';
  if found then
   if m.body is distinct from p_data->>'body' or m.direction<>'in' or m.occurred_at is distinct from (p_data->>'occurred_at')::timestamptz then raise exception 'event_conflict'; end if;
   return jsonb_build_object('conversation_id',c.id,'message_id',m.id,'duplicate',true);
  end if;
  insert into commercial_messages(conversation_id,event_key,direction,actor,body,status,occurred_at)
   values(c.id,p_data->>'event_key','in','visitor',p_data->>'body','received',(p_data->>'occurred_at')::timestamptz) returning * into m;
  update commercial_conversations set status=case when status='new' then 'new' else 'active' end,closed_reason=null,revision=revision+1,updated_at=now() where id=c.id;
  insert into commercial_conversation_events(conversation_id,action) values(c.id,'incoming');
  return jsonb_build_object('conversation_id',c.id,'message_id',m.id,'duplicate',false);
 end if;
 select * into c from commercial_conversations where id=(p_data->>'conversation_id')::uuid and organization_id=p_org for update;
 if not found then raise exception 'not_found'; end if;
 select role into role_name from profiles where id=p_actor and organization_id=p_org;
 if role_name is null or role_name not in ('ADMIN','MANAGER','SALES') or (role_name='SALES' and c.owner_user_id<>p_actor) then raise exception 'forbidden'; end if;
 if p_action='reply' then
  select * into m from commercial_messages where conversation_id=c.id and event_key=p_data->>'event_key';
  if found then
   if m.body is distinct from p_data->>'body' or m.actor<>'human' then raise exception 'event_conflict'; end if;
   return to_jsonb(m);
  end if;
 end if;
 if (p_data->>'revision')::int is distinct from c.revision then raise exception 'stale_revision'; end if;
 if p_action='takeover' then
  update commercial_messages set status='cancelled',error_code='human_takeover' where conversation_id=c.id and actor='ai' and status in ('draft','pending');
  update commercial_conversations set attention='human',status='active' where id=c.id;
 elsif p_action='supervise' then
  update commercial_conversations set attention='supervised' where id=c.id;
 elsif p_action='update' then
  owner_id=(p_data->>'owner_id')::uuid;
  if owner_id<>c.owner_user_id and role_name not in ('ADMIN','MANAGER') then raise exception 'forbidden'; end if;
  if not exists(select 1 from profiles where id=owner_id and organization_id=p_org and role in ('ADMIN','MANAGER','SALES')) then raise exception 'scope_mismatch'; end if;
  if nullif(p_data->>'opportunity_id','') is not null and not exists(select 1 from opportunities where id=(p_data->>'opportunity_id')::uuid and organization_id=p_org) then raise exception 'scope_mismatch'; end if;
  if length(trim(coalesce(p_data->>'next_action','')))=0 then raise exception 'next_action_required'; end if;
  if p_data->>'status'='resolved' and (length(trim(coalesce(p_data->>'closed_reason','')))=0 or exists(select 1 from commercial_messages where conversation_id=c.id and status in ('pending','accepted','uncertain'))) then raise exception 'closure_blocked'; end if;
  update commercial_conversations set owner_user_id=owner_id,next_action=p_data->>'next_action',status=p_data->>'status',closed_reason=p_data->>'closed_reason',opportunity_id=nullif(p_data->>'opportunity_id','')::uuid where id=c.id;
 elsif p_action='reply' then
  if c.attention<>'human' or c.status='resolved' then raise exception 'takeover_required'; end if;
  -- In stage 1 this is queued for the Nexa bridge. It is NOT delivered.
  insert into commercial_messages(conversation_id,event_key,direction,actor,body,status,occurred_at)
   values(c.id,p_data->>'event_key','out','human',p_data->>'body','pending',now()) returning * into m;
  update commercial_conversations set status='waiting' where id=c.id;
 else raise exception 'unsupported_action'; end if;
 update commercial_conversations set revision=revision+1,updated_at=now() where id=c.id;
 insert into commercial_conversation_events(conversation_id,actor_id,action) values(c.id,p_actor,p_action);
 return jsonb_build_object('conversation_id',c.id,'revision',c.revision+1,'message_id',m.id,'status',m.status);
end $$;
revoke all on function public.conversation_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.conversation_command(uuid,uuid,text,jsonb) to service_role;
create function public.conversation_bridge(p_org uuid,p_contact uuid,p_thread text,p_ack uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.commercial_conversations; result jsonb;
begin
 select * into c from commercial_conversations where organization_id=p_org and channel='nexa' and external_thread_id=p_thread and contact_id=p_contact for update;
 if not found then raise exception 'not_found'; end if;
 if p_ack is not null then
  update commercial_messages set status='delivered' where id=p_ack and conversation_id=c.id and direction='out' and status in ('pending','accepted');
  if not found and not exists(select 1 from commercial_messages where id=p_ack and conversation_id=c.id and direction='out' and status='delivered') then raise exception 'invalid_ack'; end if;
  return jsonb_build_object('message_id',p_ack,'status','delivered');
 end if;
 update commercial_messages set status='accepted',provider_id='nexa:'||id::text where conversation_id=c.id and direction='out' and status='pending';
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body,'status',status,'occurred_at',occurred_at) order by occurred_at,id),'[]'::jsonb) into result from commercial_messages
 where conversation_id=c.id and direction='out' and status in ('accepted','delivered');
 return jsonb_build_object('attention',c.attention,'status',c.status,'messages',result);
end $$;
revoke all on function public.conversation_bridge(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.conversation_bridge(uuid,uuid,text,uuid) to service_role;
commit;
