-- CORE DEV ONLY. Restore the former read interface without changing authentication guards.
CREATE OR REPLACE FUNCTION public.core_human_gate_list(p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'core', 'auth'
AS $function$
declare
  v_user uuid;
  v_org uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit,25),100));
begin
  v_org := (select id from core.organizations where code='XICRONIX' limit 1);
  if v_org is null then
    raise exception 'organization_not_found' using errcode='P0002';
  end if;

  v_user := core.ac_require_human(v_org);

  return jsonb_build_object(
    'organization_id', v_org,
    'actor_user_id', v_user,
    'adaptive_queue', coalesce((
      select jsonb_agg(x order by x.created_at asc)
      from (
        select
          q.id,
          q.status,
          q.affected_component,
          q.proposal_hash,
          q.baseline_hash,
          q.knowledge_relation,
          q.created_at,
          q.current_system_state,
          q.new_evidence,
          q.detected_difference,
          q.proposed_change,
          q.hypothesis,
          q.expected_benefit,
          q.recommended_dev_experiment,
          q.success_criteria,
          q.failure_criteria,
          q.rollback_plan,
          q.evidence_id,
          e.sha256 as evidence_hash,
          q.evaluation_id,
          ev.passed as evaluation_passed,
          ev.checks as evaluation_checks
        from core.core_evolution_queue q
        left join core.evidence e
          on e.organization_id=q.organization_id and e.id=q.evidence_id
        left join core.evaluations ev
          on ev.organization_id=q.organization_id and ev.id=q.evaluation_id
        where q.organization_id=v_org
          and q.status in ('awaiting_approval','awaiting_learning_approval')
        order by q.created_at asc
        limit v_limit
      ) x
    ), '[]'::jsonb),
    'evolution_proposals', coalesce((
      select jsonb_agg(y order by y.recommendation_order, y.created_at)
      from (
        select
          p.id,
          p.proposal_code,
          p.target_kind,
          p.target_ref,
          p.hypothesis,
          p.proposed_change,
          p.rationale,
          p.expected_benefit,
          p.success_criteria,
          p.failure_criteria,
          p.rollback_plan,
          p.recommendation_order,
          p.adaptive_state,
          p.created_at
        from core.control_evolution_proposals p
        where p.organization_id=v_org
          and p.adaptive_state='awaiting_human_review'
        order by p.recommendation_order, p.created_at
        limit v_limit
      ) y
    ), '[]'::jsonb)
  );
end;
$function$
