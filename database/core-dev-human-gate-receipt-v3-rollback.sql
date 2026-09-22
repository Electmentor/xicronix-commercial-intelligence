-- CORE DEV ONLY: restores previous wrapper. Does not remove approval records or audit evidence.
CREATE OR REPLACE FUNCTION public.core_adaptive_decide_experiment(p_evolution uuid, p_expected_hash text, p_approve boolean, p_relation text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core', 'auth'
AS $function$
begin
  perform core.ac_require_human((select organization_id from core.core_evolution_queue where id=p_evolution));
  return core.ac_decide_experiment(p_evolution,p_expected_hash,p_approve,p_relation,p_reason);
end
$function$
