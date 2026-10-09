-- Additive DEV-only upgrade to PR70. Never run against production.
begin;
do $$ begin
 if current_setting('app.conversations_environment',true) is distinct from 'dev' then
  raise exception 'Requires isolated DEV environment';
 end if;
 if current_setting('app.conversations_project_ref',true) is distinct from 'rmximatxuaczhpqbcuho' then
  raise exception 'Requires exact DEV project reference';
 end if;
end $$;
alter table public.commercial_conversations
 add column follow_up_at timestamptz default (now()+interval '1 day'),
 add column dependency_pending boolean not null default false,
 add column closure_evidence text,
 add column resolution_outcome text check(resolution_outcome in ('resolved','administrative')),
 add column last_incoming_message_id uuid references public.commercial_messages(id);
alter table public.commercial_messages add column response_to_id uuid references public.commercial_messages(id);
alter table public.commercial_conversation_events add column evidence jsonb not null default '{}';
alter table public.commercial_conversations drop constraint commercial_conversations_status_check;
alter table public.commercial_conversations add constraint commercial_conversations_status_check check(status in ('new','active','waiting','resolved','closed'));
create or replace function public.conversation_command(p_org uuid,p_actor uuid,p_action text,p_data jsonb)
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
  update commercial_conversations set status=case when status='new' then 'new' else 'active' end,closed_reason=null,closure_evidence=null,resolution_outcome=null,last_incoming_message_id=m.id,follow_up_at=now()+interval '1 day',revision=revision+1,updated_at=now() where id=c.id;
  insert into commercial_conversation_events(conversation_id,action,evidence) values(c.id,case when c.status in ('resolved','closed') then 'reopened_by_incoming' else 'incoming' end,jsonb_build_object('previous_status',c.status,'previous_reason',c.closed_reason,'previous_evidence',c.closure_evidence,'previous_outcome',c.resolution_outcome,'message_id',m.id));
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
  if c.status in ('resolved','closed') then raise exception 'closure_blocked'; end if;
  update commercial_messages set status='cancelled',error_code='human_takeover' where conversation_id=c.id and actor='ai' and status in ('draft','pending');
  update commercial_conversations set attention='human',status='active',follow_up_at=coalesce(follow_up_at,now()+interval '1 day') where id=c.id;
 elsif p_action='supervise' then
  update commercial_conversations set attention='supervised' where id=c.id;
 elsif p_action='update' then
  owner_id=(p_data->>'owner_id')::uuid;
  if owner_id<>c.owner_user_id and role_name not in ('ADMIN','MANAGER') then raise exception 'forbidden'; end if;
  if not exists(select 1 from profiles where id=owner_id and organization_id=p_org and role in ('ADMIN','MANAGER','SALES')) then raise exception 'scope_mismatch'; end if;
  if nullif(p_data->>'opportunity_id','') is not null and not exists(select 1 from opportunities where id=(p_data->>'opportunity_id')::uuid and organization_id=p_org) then raise exception 'scope_mismatch'; end if;
  if length(trim(coalesce(p_data->>'next_action','')))=0 then raise exception 'next_action_required'; end if;
  if p_data->>'status' not in ('resolved','closed') and nullif(p_data->>'follow_up_at','') is null then raise exception 'follow_up_required'; end if;
  if p_data->>'status'='resolved' and p_data->>'resolution_confirmed' is distinct from 'true' then raise exception 'closure_blocked'; end if;
  if p_data->>'status' in ('resolved','closed') and (coalesce((p_data->>'dependency_pending')::boolean,c.dependency_pending) or length(trim(coalesce(p_data->>'closure_evidence','')))=0 or (p_data->>'status'='resolved' and not exists(select 1 from commercial_messages reply_msg where reply_msg.conversation_id=c.id and reply_msg.direction='out' and reply_msg.status in ('delivered','read') and reply_msg.response_to_id=c.last_incoming_message_id)) or length(trim(coalesce(p_data->>'closed_reason','')))=0 or exists(select 1 from commercial_messages where conversation_id=c.id and status in ('draft','pending','accepted','uncertain','failed'))) then raise exception 'closure_blocked'; end if;
  update commercial_conversations set owner_user_id=owner_id,next_action=p_data->>'next_action',status=p_data->>'status',closed_reason=case when p_data->>'status' in ('resolved','closed') then p_data->>'closed_reason' else null end,closure_evidence=case when p_data->>'status' in ('resolved','closed') then p_data->>'closure_evidence' else null end,resolution_outcome=case when p_data->>'status'='resolved' then 'resolved' when p_data->>'status'='closed' then coalesce(c.resolution_outcome,'administrative') else null end,follow_up_at=nullif(p_data->>'follow_up_at','')::timestamptz,dependency_pending=coalesce((p_data->>'dependency_pending')::boolean,c.dependency_pending),opportunity_id=nullif(p_data->>'opportunity_id','')::uuid where id=c.id;
 elsif p_action='reply' then
  if c.attention<>'human' or c.status in ('resolved','closed') then raise exception 'takeover_required'; end if;
  -- In stage 1 this is queued for the Nexa bridge. It is NOT delivered.
  insert into commercial_messages(conversation_id,event_key,direction,actor,body,status,occurred_at,response_to_id)
   values(c.id,p_data->>'event_key','out','human',p_data->>'body','pending',now(),c.last_incoming_message_id) returning * into m;
  update commercial_conversations set status='waiting',follow_up_at=coalesce(follow_up_at,now()+interval '1 day') where id=c.id;
 else raise exception 'unsupported_action'; end if;
 update commercial_conversations set revision=revision+1,updated_at=now() where id=c.id;
 insert into commercial_conversation_events(conversation_id,actor_id,action,evidence) values(c.id,p_actor,p_action,jsonb_build_object('previous_status',c.status,'resolution_outcome',case when p_data->>'status'='resolved' then 'resolved' when p_data->>'status'='closed' then coalesce(c.resolution_outcome,'administrative') else null end,'status',case when p_action='update' then p_data->>'status' else null end,'resolution_confirmed',p_data->>'resolution_confirmed','closed_reason',p_data->>'closed_reason','closure_evidence',p_data->>'closure_evidence','follow_up_at',p_data->>'follow_up_at','dependency_pending',coalesce((p_data->>'dependency_pending')::boolean,c.dependency_pending)));
 return jsonb_build_object('conversation_id',c.id,'revision',c.revision+1,'message_id',m.id,'status',m.status);
end $$;

commit;
