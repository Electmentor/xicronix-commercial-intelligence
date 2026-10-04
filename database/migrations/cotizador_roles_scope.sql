-- Validate optional opportunity links even on test quotations.
begin;
create or replace function private.save_xicronix_quote(p_quote_id uuid,p_expected_revision integer,p_request_id uuid,p_header jsonb,p_inputs jsonb,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid; actor_role text; q public.quotes%rowtype; v public.quote_versions%rowtype; f jsonb; item jsonb; opp uuid; test boolean;
begin
 select organization_id,role into org,actor_role from public.profiles where id=auth.uid() and role in ('ADMIN','MANAGER','SALES');
 if org is null then raise exception 'Acceso comercial requerido'; end if;
 select * into v from public.quote_versions where request_id=p_request_id and organization_id=org;
 if found then
  if actor_role<>'ADMIN' and v.created_by<>auth.uid() then raise exception 'Cotización no autorizada'; end if;
  return to_jsonb(v); end if;
 if p_request_id is null or p_expected_revision is null then raise exception 'Identificador y versión requeridos'; end if;
 test=coalesce((p_header->>'is_test')::boolean,false); opp=nullif(p_header->>'opportunity_id','')::uuid;
 if (not test or opp is not null) and not exists(select 1 from public.opportunities where id=opp and organization_id=org) then raise exception 'Selecciona una oportunidad del CRM'; end if;
 if actor_role<>'ADMIN' and opp is not null and not exists(select 1 from public.opportunities where id=opp and organization_id=org and coalesce(owner_user_id,created_by)=auth.uid()) then raise exception 'Selecciona una oportunidad asignada a ti'; end if;
 p_inputs=private.xicronix_quote_inputs(p_inputs);
 if length(trim(coalesce(p_header->>'title','')))=0 then raise exception 'Indica el título'; end if;
 f=public.preview_xicronix_quote(p_inputs,p_items);
 if p_quote_id is null then
  if p_expected_revision<>0 then raise exception 'Versión inicial inválida'; end if;
  insert into public.quotes(organization_id,opportunity_id,created_by,title,is_test,status,target_margin_pct,minimum_margin_pct,discount_pct,currency)
  values(org,opp,auth.uid(),left(p_header->>'title',240),test,'DRAFT',(p_inputs->>'margin_pct')::numeric,(p_inputs->>'minimum_margin_pct')::numeric,coalesce((p_inputs->>'discount_pct')::numeric,0),'PEN') returning * into q;
 else
  select * into q from public.quotes where id=p_quote_id and organization_id=org for update;
  if not found or (actor_role<>'ADMIN' and q.created_by<>auth.uid()) or q.revision<>p_expected_revision then raise exception 'Conflicto de versión. Recarga la cotización'; end if;
  update public.quotes set title=left(p_header->>'title',240),opportunity_id=opp,is_test=test,status='DRAFT',
   target_margin_pct=(p_inputs->>'margin_pct')::numeric,minimum_margin_pct=(p_inputs->>'minimum_margin_pct')::numeric,discount_pct=coalesce((p_inputs->>'discount_pct')::numeric,0)
   where id=q.id returning * into q;
 end if;
 insert into public.quote_versions(quote_id,organization_id,revision,request_id,inputs,financials,customer_document,created_by)
 values(q.id,org,q.revision+1,p_request_id,p_inputs,jsonb_build_object('items',p_items),'{}',auth.uid()) returning * into v;
 delete from public.quote_items where quote_id=q.id;
 for item in select value from jsonb_array_elements(v.financials->'items') loop
  insert into public.quote_items(quote_id,catalog_product_id,quantity,supplier_unit_price,exchange_rate,landed_unit_cost,target_margin_pct,negotiated_unit_price,discount_pct)
  values(q.id,(item->>'catalog_product_id')::uuid,(item->>'quantity')::numeric,(item->>'supplier_unit_price')::numeric,(p_inputs->>'exchange_rate')::numeric,
  (item->>'landed_unit_cost')::numeric,0,(item->>'unit_price')::numeric,0);
 end loop;
 update public.quotes set revision=v.revision,status=case when (v.customer_document->>'is_draft')::boolean then 'REVIEW' else 'APPROVED' end,updated_at=now() where id=q.id;
 return to_jsonb(v);
end $$;
commit;
