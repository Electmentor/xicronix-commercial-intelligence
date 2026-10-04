begin;
create or replace function private.xicronix_quote_inputs(p_inputs jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.profiles%rowtype; c public.cost_profiles%rowtype;
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null or actor.role not in ('ADMIN','MANAGER','SALES') then raise exception 'Acceso comercial requerido'; end if;
 if actor.role='ADMIN' and not coalesce((p_inputs->>'sales_view')::boolean,false) then return p_inputs; end if;
 select * into c from public.cost_profiles where id=nullif(p_inputs->>'cost_profile_id','')::uuid
 and organization_id=actor.organization_id and quote_enabled and currency='USD'
 and (valid_from is null or valid_from<=current_date) and (valid_until is null or valid_until>=current_date);
 if not found then raise exception 'Dirección debe habilitar un perfil de costos vigente para cotizar'; end if;
 -- Overwrite every protected value. Client-side disabled inputs are not a security boundary.
 return p_inputs || jsonb_build_object('margin_pct',c.target_margin_pct,'exchange_rate',c.exchange_rate,'freight_usd',c.freight_international,
 'insurance_usd',c.insurance,'duty_pct',c.ad_valorem_rate*100,'igv_pct',c.igv_rate*100,
 'perception_pct',c.perception_rate*100,'local_cost_pen',coalesce(c.local_cost_pen,(c.customs_broker_fee+c.terminal_fee+c.storage_fee+c.inland_transport+c.installation_fee)*c.exchange_rate),
 'contingency_pct',c.contingency_rate*100,'minimum_margin_pct',c.minimum_margin_pct,'recoverable_igv',c.recoverable_igv,
 'supplier_advance_pct',c.supplier_advance_pct,'costs_confirmed',true,'technical_confirmed',false);
end $$;
create or replace function private.preview_xicronix_sales(p_inputs jsonb,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f jsonb; org uuid;
begin
 select organization_id into org from public.profiles where id=auth.uid() and role in ('ADMIN','MANAGER','SALES');
 if org is null then raise exception 'Acceso comercial requerido'; end if;
 f=private.calculate_xicronix_quote(p_inputs,p_items);
 if private.is_org_admin(org) and not coalesce((p_inputs->>'sales_view')::boolean,false) then return f; end if;
 return private.quote_sales_financials(f);
end $$;
commit;
