-- Reuses workflow_status, updated_at and commercial_radar_evidence.
-- Additive enum-like constraint extension; no row rewrite, new table or deletion.
alter table public.commercial_radar_signals drop constraint commercial_radar_signals_workflow_status_check;
alter table public.commercial_radar_signals add constraint commercial_radar_signals_workflow_status_check
 check (workflow_status in ('DETECTED','RESEARCHING','OBSERVING','VALIDATE_REMOTE','CONTACT_READY','PROMOTED_TO_LEAD','DISCARDED','IN_REVIEW','RESOLVED'));

create or replace function private.radar_preserve_closed_lifecycle()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.workflow_status in ('RESOLVED','DISCARDED') then
  new.workflow_status := old.workflow_status;
  new.actionable := false;
 end if;
 if new.workflow_status in ('RESOLVED','DISCARDED') then new.actionable := false; end if;
 return new;
end;
$$;
-- Runs after trg_radar_score_signal, so enrichment cannot reopen a closed signal.
create trigger zz_radar_preserve_closed_lifecycle before update on public.commercial_radar_signals
 for each row execute function private.radar_preserve_closed_lifecycle();

create or replace function public.crm_transition_radar_signal(
 p_signal_id uuid, p_status text, p_expected_status text,
 p_expected_updated_at timestamptz, p_reason text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 s public.commercial_radar_signals%rowtype;
 actor uuid := auth.uid();
 stamp timestamptz := clock_timestamp();
 reason text := nullif(btrim(p_reason),'');
 event_record jsonb;
begin
 if actor is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_status not in ('IN_REVIEW','RESOLVED','DISCARDED') or p_status is null then raise exception 'INVALID_TRANSITION'; end if;
 if length(coalesce(reason,'')) > 2000 then raise exception 'REASON_TOO_LONG'; end if;
 if p_status in ('RESOLVED','DISCARDED') and reason is null then raise exception 'REASON_REQUIRED'; end if;
 select * into s from public.commercial_radar_signals where id=p_signal_id for update;
 if not found then raise exception 'RADAR_SIGNAL_NOT_FOUND'; end if;
 if not exists(select 1 from public.profiles where id=actor and organization_id=s.organization_id and role in ('ADMIN','MANAGER','SALES')) then raise exception 'NOT_AUTHORIZED'; end if;
 if s.workflow_status is distinct from p_expected_status or s.updated_at is distinct from p_expected_updated_at then raise exception 'STALE_RADAR_SIGNAL'; end if;
 if s.workflow_status in ('RESOLVED','DISCARDED') or s.workflow_status=p_status then raise exception 'INVALID_TRANSITION'; end if;
 update public.commercial_radar_signals set workflow_status=p_status,updated_at=stamp where id=s.id;
 if not found then raise exception 'NOT_AUTHORIZED'; end if;
 -- Close only the system task generated for this exact signal.
 if p_status in ('RESOLVED','DISCARDED') then
  update public.tasks set status=case when p_status='RESOLVED' then 'COMPLETED' else 'CANCELLED' end,updated_at=stamp
  where organization_id=s.organization_id and automation_key='crm:radar:'||s.id::text and status not in ('COMPLETED','CANCELLED');
 end if;
 event_record := jsonb_build_object('from',s.workflow_status,'to',p_status,'actor_id',actor,'at',stamp,'reason',reason);
 insert into public.commercial_radar_evidence(organization_id,signal_id,evidence_type,source_url,source_title,observed_at,strength,excerpt)
 values(s.organization_id,s.id,'WORKFLOW_TRANSITION','https://xicronix-commercial-intelligence.vercel.app/#page=radar','Cambio explícito de estado Radar',stamp,0,event_record::text);
 return jsonb_build_object('signal_id',s.id,'workflow_status',p_status,'updated_at',stamp,'event',event_record);
end;
$$;
revoke all on function public.crm_transition_radar_signal(uuid,text,text,timestamptz,text) from public,anon;
grant execute on function public.crm_transition_radar_signal(uuid,text,text,timestamptz,text) to authenticated;
revoke all on function private.radar_preserve_closed_lifecycle() from public,anon;
-- Rollback: remove RPC and guard only; retain widened constraint while terminal rows
-- exist, preserving history and meaning. Never remap/delete resolved records.
