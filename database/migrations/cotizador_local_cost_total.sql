begin;
alter table public.cost_profiles add column if not exists local_cost_pen numeric check(local_cost_pen>=0);
create or replace function private.xicronix_quote_inputs(p_inputs jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.profiles%rowtype; c public.cost_profiles%rowtype;
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null or actor.role not in ('ADMIN','MANAGER','SALES') then raise exception 'Acceso comercial requerido'; end if;
 if actor.role='ADMIN' then return p_inputs; end if;
 select * into c from public.cost_profiles where id=nullif(p_inputs->>'cost_profile_id','')::uuid
 and organization_id=actor.organization_id and quote_enabled and currency='USD'
 and (valid_from is null or valid_from<=current_date) and (valid_until is null or valid_until>=current_date);
 if not found then raise exception 'Dirección debe habilitar un perfil de costos vigente para cotizar'; end if;
 -- Overwrite every protected value. Client-side disabled inputs are not a security boundary.
 return p_inputs || jsonb_build_object('exchange_rate',c.exchange_rate,'freight_usd',c.freight_international,
 'insurance_usd',c.insurance,'duty_pct',c.ad_valorem_rate*100,'igv_pct',c.igv_rate*100,
 'perception_pct',c.perception_rate*100,'local_cost_pen',coalesce(c.local_cost_pen,(c.customs_broker_fee+c.terminal_fee+c.storage_fee+c.inland_transport+c.installation_fee)*c.exchange_rate),
 'contingency_pct',c.contingency_rate*100,'minimum_margin_pct',c.minimum_margin_pct,'recoverable_igv',c.recoverable_igv,
 'supplier_advance_pct',c.supplier_advance_pct,'costs_confirmed',true,'technical_confirmed',false);
end $$;
revoke all on function private.xicronix_quote_inputs(jsonb) from public,anon;
grant execute on function private.xicronix_quote_inputs(jsonb) to authenticated;

commit;
