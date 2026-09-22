-- CORE DEV ONLY: yeslipuoriweapauwgog. Not for CRM databases or production.
CREATE OR REPLACE FUNCTION public.core_adaptive_decide_experiment(
 p_evolution uuid,p_expected_hash text,p_approve boolean,p_relation text,p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','core','auth'
AS $function$
DECLARE
 q core.core_evolution_queue;
 u uuid;
 a core.approvals;
 approval_id uuid;
 receipt jsonb;
 member_role text;
BEGIN
 SELECT * INTO STRICT q FROM core.core_evolution_queue WHERE id=p_evolution FOR UPDATE;
 u:=core.ac_require_human(q.organization_id);
 SELECT role INTO STRICT member_role FROM core.memberships
 WHERE organization_id=q.organization_id AND user_id=u AND role='admin' AND status='active';
 -- The authenticated request must also correspond to an actual AAL2 Auth session.
 IF NOT EXISTS(SELECT 1 FROM auth.sessions
   WHERE id=(auth.jwt()->>'session_id')::uuid AND user_id=u AND aal='aal2'
   AND (not_after IS NULL OR not_after>now())) THEN
   RAISE EXCEPTION 'ac_live_aal2_session_required' USING errcode='42501';
 END IF;
 approval_id:=core.ac_decide_experiment(p_evolution,p_expected_hash,p_approve,p_relation,p_reason);
 SELECT * INTO STRICT a FROM core.approvals WHERE id=approval_id;
 receipt:=jsonb_build_object(
   'actor_user_id',u,'proposal_id',q.id,'approval_id',a.id,'task_id',q.task_id,
   'decision',a.decision,'approved_at',a.created_at,'expires_at',a.expires_at,
   'aal',auth.jwt()->>'aal','role',member_role,'session_id',auth.jwt()->>'session_id',
   'proposal_hash',a.request_hash,'action',q.recommended_dev_experiment,
   'reason',a.reason,'knowledge_relation',p_relation,
   'environment',q.environment,'project_ref','yeslipuoriweapauwgog',
   'validation','server_auth_uid_jwt_live_aal2_session_active_admin_and_bound_proposal'
 );
 INSERT INTO core.events(organization_id,event_type,task_id,correlation_id,actor,severity,payload)
 VALUES(q.organization_id,'adaptive.human_gate_decision',q.task_id,q.id,'human:'||u::text,'AUDIT',
   receipt||jsonb_build_object('sha256',core.ac_hash(receipt::text)));
 RETURN a.id;
END
$function$;
