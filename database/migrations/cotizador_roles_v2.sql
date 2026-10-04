-- Director-owned costs; commercial users write through the validated quotation command.
begin;
alter table public.cost_profiles add column if not exists quote_enabled boolean not null default false;
alter table public.cost_profiles add column if not exists minimum_margin_pct numeric not null default 20 check(minimum_margin_pct>=0 and minimum_margin_pct<100);
alter table public.cost_profiles add column if not exists recoverable_igv boolean not null default true;
alter table public.cost_profiles add column if not exists supplier_advance_pct numeric not null default 100 check(supplier_advance_pct between 0 and 100);

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
 'perception_pct',c.perception_rate*100,'local_cost_pen',(c.customs_broker_fee+c.terminal_fee+c.storage_fee+c.inland_transport+c.installation_fee)*c.exchange_rate,
 'contingency_pct',c.contingency_rate*100,'minimum_margin_pct',c.minimum_margin_pct,'recoverable_igv',c.recoverable_igv,
 'supplier_advance_pct',c.supplier_advance_pct,'costs_confirmed',true,'technical_confirmed',false);
end $$;
revoke all on function private.xicronix_quote_inputs(jsonb) from public,anon;
grant execute on function private.xicronix_quote_inputs(jsonb) to authenticated;

-- Block direct REST writes; the narrow command below verifies actor, organization,
-- opportunity ownership and authoritative costs before persisting derived values.
create policy quotes_direct_insert_director on public.quotes as restrictive for insert to authenticated with check(private.is_org_admin(organization_id));
create policy quotes_direct_update_director on public.quotes as restrictive for update to authenticated using(private.is_org_admin(organization_id)) with check(private.is_org_admin(organization_id));
create policy quote_items_direct_insert_director on public.quote_items as restrictive for insert to authenticated with check(exists(select 1 from public.quotes q where q.id=quote_id and private.is_org_admin(q.organization_id)));
create policy quote_items_direct_update_director on public.quote_items as restrictive for update to authenticated using(exists(select 1 from public.quotes q where q.id=quote_id and private.is_org_admin(q.organization_id))) with check(exists(select 1 from public.quotes q where q.id=quote_id and private.is_org_admin(q.organization_id)));
create policy quote_items_direct_delete_director on public.quote_items as restrictive for delete to authenticated using(exists(select 1 from public.quotes q where q.id=quote_id and private.is_org_admin(q.organization_id)));
create or replace function public.preview_xicronix_quote(p_inputs jsonb,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 org uuid; fx numeric; freight numeric; insurance numeric; duty_rate numeric; igv_rate numeric; perception_rate numeric;
 local_cost numeric; contingency_rate numeric; margin numeric; discount numeric; minimum_margin numeric;
 advance numeric; supplier_advance numeric; recoverable boolean;
 fob numeric:=0; cif numeric; duty numeric; import_igv numeric; perception numeric; contingency numeric;
 economic numeric; cash_need numeric; allocated numeric:=0; line_cost numeric; unit_cost numeric; unit_price numeric;
 qty numeric; item_discount numeric; net numeric:=0; igv numeric; total numeric; profit numeric; line_net numeric; share numeric;
 rows jsonb:='[]'; result_rows jsonb:='[]'; item jsonb; product public.catalog_products%rowtype; idx integer:=0;
begin
 select organization_id into org from public.profiles where id=auth.uid() and role in ('ADMIN','MANAGER','SALES');
 if org is null then raise exception 'Acceso comercial requerido'; end if;
 p_inputs=private.xicronix_quote_inputs(p_inputs);
 if jsonb_typeof(p_inputs)<>'object' or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Incluye entre 1 y 200 partidas'; end if;
 fx=private.quote_number(p_inputs,'exchange_rate',null,0.000001,10000);
 if fx is null then raise exception 'Indica el tipo de cambio'; end if;
 freight=private.quote_number(p_inputs,'freight_usd',0,0,100000000);
 insurance=private.quote_number(p_inputs,'insurance_usd',0,0,100000000);
 local_cost=private.quote_number(p_inputs,'local_cost_pen',0,0,100000000);
 duty_rate=private.quote_number(p_inputs,'duty_pct',0,0,100)/100;
 igv_rate=private.quote_number(p_inputs,'igv_pct',18,0,100)/100;
 perception_rate=private.quote_number(p_inputs,'perception_pct',0,0,100)/100;
 contingency_rate=private.quote_number(p_inputs,'contingency_pct',0,0,100)/100;
 margin=private.quote_number(p_inputs,'margin_pct',30,0,99.99);
 minimum_margin=private.quote_number(p_inputs,'minimum_margin_pct',20,0,99.99);
 discount=private.quote_number(p_inputs,'discount_pct',0,0,100);
 advance=private.quote_number(p_inputs,'advance_pct',0,0,100)/100;
 supplier_advance=private.quote_number(p_inputs,'supplier_advance_pct',100,0,100)/100;
 recoverable=coalesce((p_inputs->>'recoverable_igv')::boolean,true);
 for item in select value from jsonb_array_elements(p_items) loop
  select * into product from public.catalog_products where id=(item->>'catalog_product_id')::uuid and organization_id=org and active;
  if not found or product.currency<>'USD' then raise exception 'Producto no disponible o moneda distinta a USD'; end if;
  qty=private.quote_number(item,'quantity',null,1,10000);
  if qty is null or qty<>trunc(qty) then raise exception 'Cantidad entera requerida'; end if;
  item_discount=private.quote_number(item,'discount_pct',0,0,100);
  if item ? 'negotiated_unit_price' and item->'negotiated_unit_price'<>'null'::jsonb then
   perform private.quote_number(item,'negotiated_unit_price',null,0,100000000);
  end if;
  fob=fob+product.supplier_unit_price*qty;
  rows=rows||jsonb_build_array(jsonb_build_object('catalog_product_id',product.id,'sku',product.supplier_sku,'description',product.name,
   'quantity',qty,'supplier_unit_price',product.supplier_unit_price,'source',product.source_metadata,'source_notes',product.notes,
   'discount_pct',item_discount,'negotiated_unit_price',item->'negotiated_unit_price'));
 end loop;
 if fob<=0 then raise exception 'El valor proveedor debe ser positivo'; end if;
 cif=round((fob+freight+insurance)*fx,2); duty=round(cif*duty_rate,2);
 import_igv=round((cif+duty)*igv_rate,2);
 perception=round((cif+duty+import_igv)*perception_rate,2);
 contingency=round((cif+duty+local_cost)*contingency_rate,2);
 economic=cif+duty+local_cost+contingency+case when recoverable then 0 else import_igv end;
 cash_need=economic+case when recoverable then import_igv else 0 end+perception;
 for item in select value from jsonb_array_elements(rows) loop
  idx=idx+1; qty=(item->>'quantity')::numeric;
  share=(item->>'supplier_unit_price')::numeric*qty/fob;
  line_cost=case when idx=jsonb_array_length(rows) then economic-allocated else round(economic*share,2) end;
  allocated=allocated+line_cost; unit_cost=line_cost/qty;
  unit_price=coalesce((item->>'negotiated_unit_price')::numeric,round(unit_cost/(1-margin/100),2));
  -- Published unit price is after item discount; global discount applied to rounded lines.
  unit_price=round(unit_price*(1-(item->>'discount_pct')::numeric/100),2);
  line_net=round(unit_price*qty,2); net=net+line_net;
  result_rows=result_rows||jsonb_build_array(item||jsonb_build_object('landed_total',line_cost,'landed_unit_cost',round(unit_cost,6),'unit_price',unit_price,'line_subtotal',line_net));
 end loop;
 net=round(net*(1-discount/100),2); igv=round(net*igv_rate,2); total=net+igv; profit=net-economic;
 return jsonb_build_object('engine_version','1.0','currency','PEN','items',result_rows,'fob_usd',fob,'cif_pen',cif,'duty_pen',duty,
 'import_igv_pen',import_igv,'perception_pen',perception,'contingency_pen',contingency,'landed_cost',economic,'cash_need',cash_need,
 'net_sale',net,'sales_igv',igv,'total',total,'gross_profit',profit,
 'real_margin_pct',case when net>0 then round(profit/net*100,4) else null end,
 'markup_pct',case when economic>0 then round(profit/economic*100,4) else null end,
 'requires_margin_approval',net<=0 or profit/nullif(net,0)*100<minimum_margin,
 'customer_advance',round(total*advance,2),
 'working_capital',greatest(0,cash_need-round(total*advance,2)),
 'initial_supplier_payment',round(fob*fx*supplier_advance,2));
end $$;
revoke all on function public.preview_xicronix_quote(jsonb,jsonb) from public,anon;
grant execute on function public.preview_xicronix_quote(jsonb,jsonb) to authenticated;

create or replace function private.prepare_quote_version()
returns trigger language plpgsql security invoker set search_path='' as $$
declare q public.quotes%rowtype; f jsonb; cust text; lines jsonb;
begin
 select * into q from public.quotes where id=new.quote_id for update;
 if not found or q.organization_id<>new.organization_id or auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=q.organization_id and p.role in ('ADMIN','MANAGER','SALES')) then raise exception 'Cotización no autorizada'; end if;
 if new.created_by<>auth.uid() or new.revision<>q.revision+1 then raise exception 'Versión desactualizada. Recarga antes de guardar'; end if;
 new.inputs=private.xicronix_quote_inputs(new.inputs);
 f=public.preview_xicronix_quote(new.inputs,new.financials->'items');
 new.financials=f; new.created_at=now();
 if q.is_test then cust='Prueba interna — sin cliente vinculado'; else
  select i.name into cust from public.opportunities o join public.institutions i on i.id=o.institution_id
  where o.id=q.opportunity_id and o.organization_id=q.organization_id and i.organization_id=q.organization_id;
  if cust is null then raise exception 'Vincula una oportunidad y un cliente de la misma organización'; end if;
 end if;
 select jsonb_agg(jsonb_build_object('sku',x->>'sku','description',x->>'description','quantity',x->'quantity','unit_price',x->'unit_price','subtotal',x->'line_subtotal')) into lines from jsonb_array_elements(f->'items') x;
 new.customer_document=jsonb_build_object('issuer','XICRONIX E.I.R.L.','quote_number','XQ-'||upper(left(q.id::text,8)),
  'revision',new.revision,'date',to_char(now() at time zone 'America/Lima','YYYY-MM-DD'),'title',q.title,'customer',cust,'currency','PEN',
  'is_draft',q.is_test or coalesce((new.inputs->>'costs_confirmed')::boolean,false)=false or coalesce((new.inputs->>'technical_confirmed')::boolean,false)=false or (f->>'requires_margin_approval')::boolean,
  'scope',left(coalesce(new.inputs->>'scope',''),6000),'terms',left(coalesce(new.inputs->>'terms',''),4000),'items',lines,
  'discount_pct',private.quote_number(new.inputs,'discount_pct',0,0,100),'net_sale',f->'net_sale','igv_pct',private.quote_number(new.inputs,'igv_pct',18,0,100),'sales_igv',f->'sales_igv','total',f->'total');
 return new;
end $$;


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
 if not test and not exists(select 1 from public.opportunities where id=opp and organization_id=org) then raise exception 'Selecciona una oportunidad del CRM'; end if;
 if actor_role<>'ADMIN' and not test and not exists(select 1 from public.opportunities where id=opp and organization_id=org and coalesce(owner_user_id,created_by)=auth.uid()) then raise exception 'Selecciona una oportunidad asignada a ti'; end if;
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
revoke all on function private.save_xicronix_quote(uuid,integer,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function private.save_xicronix_quote(uuid,integer,uuid,jsonb,jsonb,jsonb) to authenticated;
create or replace function public.save_xicronix_quote(p_quote_id uuid,p_expected_revision integer,p_request_id uuid,p_header jsonb,p_inputs jsonb,p_items jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.save_xicronix_quote(p_quote_id,p_expected_revision,p_request_id,p_header,p_inputs,p_items);
$$;
revoke all on function public.save_xicronix_quote(uuid,integer,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_xicronix_quote(uuid,integer,uuid,jsonb,jsonb,jsonb) to authenticated;
commit;
