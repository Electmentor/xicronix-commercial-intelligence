-- Run via an authorized database connection. All business mutations roll back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='ADMIN' limit 1),true);
set local role authenticated;
do $$
declare inputs jsonb; items jsonb; f jsonb; discounted jsonb; v1 jsonb; v2 jsonb; retry jsonb; qid uuid; rid uuid:=gen_random_uuid(); blocked boolean;
begin
 inputs='{"exchange_rate":3.75,"freight_usd":600,"insurance_usd":60,"duty_pct":0,"local_cost_pen":1800,"contingency_pct":3,"igv_pct":18,"perception_pct":3.5,"recoverable_igv":true,"margin_pct":30,"minimum_margin_pct":20,"discount_pct":0,"advance_pct":50,"supplier_advance_pct":100}';
 insert into public.catalog_products(organization_id,supplier_name,supplier_sku,name,category,currency,supplier_unit_price) select (select organization_id from public.profiles where id=auth.uid()),'AUTOMATED ROLLBACK','XQ-TEST-'||n,'Synthetic test product','TEST','USD',100*n from generate_series(1,4) n;
 select jsonb_agg(jsonb_build_object('catalog_product_id',p.id,'quantity',case when p.supplier_sku='XQ-TEST-4' then 1 else 4 end,'discount_pct',0) order by p.supplier_sku) into items from public.catalog_products p where supplier_name='AUTOMATED ROLLBACK';
 f=public.preview_xicronix_quote(inputs,items);
 assert (f->>'fob_usd')::numeric=2800,'FOB';
 assert (f->>'landed_cost')::numeric=15218.25,'landed';
 assert (f->>'cash_need')::numeric=18089.62,'cash';
 assert abs((f->>'real_margin_pct')::numeric-30)<.001,'margin';
 assert abs((f->>'markup_pct')::numeric-42.857143)<.001,'markup distinct from margin';
 assert (select sum((x->>'landed_total')::numeric) from jsonb_array_elements(f->'items') x)=(f->>'landed_cost')::numeric,'allocation';
 discounted=public.preview_xicronix_quote(inputs||'{"discount_pct":10}',items);
 assert (discounted->>'net_sale')::numeric=round((f->>'net_sale')::numeric*.9,2),'discount';
 assert (discounted->>'landed_cost')::numeric=(f->>'landed_cost')::numeric,'discount must not reduce cost';
 discounted=public.preview_xicronix_quote(inputs||'{"recoverable_igv":false}',items);
 assert (discounted->>'cash_need')::numeric=(f->>'cash_need')::numeric,'non recoverable IGV counted once';
 assert (discounted->>'landed_cost')::numeric=(f->>'landed_cost')::numeric+(f->>'import_igv_pen')::numeric,'non recoverable cost';
 blocked=false;begin perform public.preview_xicronix_quote(inputs||'{"margin_pct":100}',items); exception when others then blocked=true;end;assert blocked,'reject 100 margin';
 blocked=false;begin perform public.preview_xicronix_quote(inputs||'{"exchange_rate":0}',items); exception when others then blocked=true;end;assert blocked,'reject zero fx';
 blocked=false;begin perform public.preview_xicronix_quote(inputs,jsonb_set(items,'{0,quantity}','1.5')); exception when others then blocked=true;end;assert blocked,'reject fractional qty';
 blocked=false;begin perform public.preview_xicronix_quote(inputs,jsonb_set(items,'{0,catalog_product_id}',to_jsonb(gen_random_uuid()::text))); exception when others then blocked=true;end;assert blocked,'reject missing product';
 v1=public.save_xicronix_quote(null,0,rid,'{"title":"AUTOMATED ROLLBACK TEST","is_test":true}',inputs,items);qid=(v1->>'quote_id')::uuid;
 retry=public.save_xicronix_quote(null,0,rid,'{"title":"AUTOMATED ROLLBACK TEST","is_test":true}',inputs,items);
 assert retry->>'id'=v1->>'id','idempotent retry';
 v2=public.save_xicronix_quote(qid,1,gen_random_uuid(),'{"title":"AUTOMATED ROLLBACK TEST","is_test":true}',inputs||'{"discount_pct":10}',items);
 assert (v2->>'revision')::integer=2,'version increment';
 assert (select financials from public.quote_versions where id=(v1->>'id')::uuid)=v1->'financials','immutable first financials';
 assert (public.xicronix_customer_document(qid,1)->>'total')::numeric=(v1->'financials'->>'total')::numeric,'historical client document';
 assert (v1->'customer_document'->>'is_draft')::boolean,'test watermark';
 assert not ((v1->'customer_document') ?| array['financials','landed_cost','margin_pct','source','supplier_unit_price','gross_profit','markup_pct']),'private header fields absent';
 assert not ((v1->'customer_document'->'items'->0) ?| array['source','supplier_unit_price','landed_unit_cost','discount_pct','target_margin_pct']),'private item fields absent';
 blocked=false;begin perform public.save_xicronix_quote(qid,1,gen_random_uuid(),'{"title":"TEST","is_test":true}',inputs,items); exception when others then blocked=true;end;assert blocked,'stale save rejected';
 blocked=false;begin update public.quote_versions set inputs='{}' where quote_id=qid; exception when insufficient_privilege then blocked=true;end;assert blocked,'versions cannot be changed';
 blocked=false;begin delete from public.quote_versions where quote_id=qid; exception when insufficient_privilege then blocked=true;end;assert blocked,'versions cannot be deleted';
end $$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$ declare blocked boolean:=false; begin
 assert (select count(*) from public.quote_versions)=0,'unlinked user cannot read versions';
 begin perform public.preview_xicronix_quote('{}','[]'); exception when others then blocked=true;end;assert blocked,'unlinked user cannot calculate';
end $$;
set local role anon;
do $$ declare blocked boolean:=false; begin
 begin perform * from public.quote_versions; exception when insufficient_privilege then blocked=true;end;assert blocked,'anon cannot read';
 blocked=false;begin perform public.xicronix_customer_document(gen_random_uuid(),1); exception when insufficient_privilege then blocked=true;end;assert blocked,'anon cannot export';
end $$;
rollback;
select 'PASS: financials, discounts, capital, server validation, atomic versioning, retries, immutable history, sanitized documents, RLS' as result;
