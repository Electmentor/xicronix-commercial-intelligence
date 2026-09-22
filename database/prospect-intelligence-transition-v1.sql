-- Prospect Intelligence transition RPC v1
-- DEV ONLY.

create or replace function public.pi_transition_case(target_case uuid,target_state text)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  c public.pi_cases%rowtype;
  allowed boolean:=false;
begin
  select * into c from public.pi_cases where id=target_case for update;
  if not found then raise exception 'PI case not found'; end if;
  if not private.can_write_org(c.organization_id) then raise exception 'Write access denied'; end if;

  allowed:=case c.state
    when 'DETECTED' then target_state in ('RESEARCHING','MONITORING','DISCARDED')
    when 'RESEARCHING' then target_state in ('QUALIFIED','MONITORING','DISCARDED')
    when 'QUALIFIED' then target_state in ('PRIORITIZED','RESEARCHING','MONITORING','DISCARDED')
    when 'PRIORITIZED' then target_state in ('READY_FOR_CRM','QUALIFIED','MONITORING','DISCARDED')
    when 'READY_FOR_CRM' then target_state in ('TRANSFERRED','PRIORITIZED')
    when 'MONITORING' then target_state in ('RESEARCHING','DISCARDED')
    when 'DISCARDED' then target_state='RESEARCHING'
    else false
  end;

  if not allowed then
    raise exception 'Invalid PI transition: % -> %',c.state,target_state;
  end if;

  update public.pi_cases
  set state=target_state,updated_at=now()
  where id=target_case;

  return jsonb_build_object('id',target_case,'from',c.state,'to',target_state,'updated_at',now());
end
$$;

revoke all on function public.pi_transition_case(uuid,text) from public,anon;
grant execute on function public.pi_transition_case(uuid,text) to authenticated;
