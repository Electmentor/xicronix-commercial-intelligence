-- Role regression inside a transaction: no persistent accounts or business changes.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='ADMIN' limit 1),true);
set local role authenticated;
do $$ declare c uuid; p uuid; v jsonb; begin
 insert into public.cost_profiles(organization_id,name,origin_country,currency,exchange_rate,quote_enabled,minimum_margin_pct,created_by)
 values((select organization_id from public.profiles where id=auth.uid()),'ROLE TEST','Brazil','USD',4,true,25,auth.uid()) returning id into c;
 insert into public.catalog_products(organization_id,supplier_name,supplier_sku,name,category,currency,supplier_unit_price)
 values((select organization_id from public.profiles where id=auth.uid()),'ROLE TEST','ROLE-TEST','Role test','TEST','USD',100) returning id into p;
 update public.catalog_products set supplier_unit_price=120 where id=p;
 assert (select supplier_unit_price from public.catalog_products where id=p)=120,'director edits supplier price';
 perform set_config('test.cost_profile',c::text,true);perform set_config('test.product',p::text,true);
end $$;
reset role;
-- Temporarily exercise the existing principal as SALES, then roll back everything.
update public.profiles set role='SALES' where id=auth.uid();
set local role authenticated;
do $$ declare i jsonb; items jsonb; v jsonb; v2 jsonb; f jsonb; n integer; blocked boolean; begin
 i=jsonb_build_object('cost_profile_id',current_setting('test.cost_profile'),'exchange_rate',0.01,'freight_usd',999,'minimum_margin_pct',0,'margin_pct',30,'discount_pct',0,'technical_confirmed',true);
 items=jsonb_build_array(jsonb_build_object('catalog_product_id',current_setting('test.product'),'quantity',2,'supplier_unit_price',0.01,'landed_unit_cost',0.01));
 f=public.preview_xicronix_quote(i,items);
 assert (f->>'landed_cost')::numeric=960,'forged costs ignored';
 assert (f->'items'->0->>'supplier_unit_price')::numeric=120,'authoritative supplier price';
 v=public.save_xicronix_quote(null,0,gen_random_uuid(),'{"title":"ROLE TEST","is_test":true}',i,items);
 assert (v->'inputs'->>'exchange_rate')::numeric=4,'server freezes authorized exchange rate';
 assert (v->'inputs'->>'minimum_margin_pct')::numeric=25,'seller cannot lower minimum margin';
 assert (v->'inputs'->>'technical_confirmed')::boolean=false,'seller cannot self-approve';
 update public.catalog_products set supplier_unit_price=1 where id=current_setting('test.product')::uuid;get diagnostics n=row_count;assert n=0,'seller cannot edit catalogue';
 update public.cost_profiles set exchange_rate=.01 where id=current_setting('test.cost_profile')::uuid;get diagnostics n=row_count;assert n=0,'seller cannot edit cost profile';
 update public.quote_items set supplier_unit_price=1,landed_unit_cost=1 where quote_id=(v->>'quote_id')::uuid;get diagnostics n=row_count;assert n=0,'direct cost writes blocked';
 update public.quotes set status='APPROVED',minimum_margin_pct=0 where id=(v->>'quote_id')::uuid;get diagnostics n=row_count;assert n=0,'direct header bypass blocked';
 blocked=false;begin insert into public.quote_items(quote_id,catalog_product_id,quantity,supplier_unit_price,exchange_rate,landed_unit_cost) values((v->>'quote_id')::uuid,current_setting('test.product')::uuid,1,1,1,1);exception when insufficient_privilege then blocked=true;end;assert blocked,'forged direct item insert blocked';
 v2=public.save_xicronix_quote((v->>'quote_id')::uuid,1,gen_random_uuid(),'{"title":"ROLE TEST","is_test":true}',i||'{"discount_pct":10}',items);
 assert (v2->>'revision')::int=2,'seller saves versions';
 assert (v2->'financials'->>'landed_cost')::numeric=960,'discount leaves costs unchanged';
 assert (v2->'financials'->>'net_sale')::numeric<(v->'financials'->>'net_sale')::numeric,'seller negotiates sales price';
 assert (v2->'financials'->>'requires_margin_approval')::boolean,'margin violation flagged';
 blocked=false;begin perform public.preview_xicronix_quote(i-'cost_profile_id',items);exception when others then blocked=true;end;assert blocked,'no unauthorized free-form costs';
 blocked=false;begin perform public.save_xicronix_quote(null,0,gen_random_uuid(),jsonb_build_object('title','ROLE TEST','is_test',true,'opportunity_id',gen_random_uuid()),i,items);exception when others then blocked=sqlerrm='Selecciona una oportunidad del CRM';end;assert blocked,'test quotations must validate optional opportunity links';
 assert not ((public.xicronix_customer_document((v->>'quote_id')::uuid,2)) ?| array['landed_cost','supplier_unit_price','financials','gross_profit']),'client privacy';
end $$;
rollback;
select 'PASS: director edits costs; seller cannot forge costs via catalogue, profiles, items, headers or RPC; sales discounts and versioning work' as result;
