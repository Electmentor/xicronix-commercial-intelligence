begin;
create or replace function private.xicronix_sales_data()
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid; result jsonb;
begin
 select organization_id into org from public.profiles where id=auth.uid() and role in ('ADMIN','MANAGER','SALES');
 if org is null then raise exception 'Acceso comercial requerido'; end if;
 select jsonb_build_object(
 'catalog_products',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'supplier_sku',supplier_sku,'name',name,'category',category,'active',active)) from public.catalog_products where organization_id=org and active),'[]'::jsonb),
 'cost_profiles',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'name',name,'quote_enabled',true)) from public.cost_profiles where organization_id=org and quote_enabled and currency='USD' and (valid_from is null or valid_from<=current_date) and (valid_until is null or valid_until>=current_date)),'[]'::jsonb),
 'quotes',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'organization_id',q.organization_id,'created_by',q.created_by,'opportunity_id',q.opportunity_id,'title',q.title,'revision',q.revision,'is_test',q.is_test,'status',q.status,'currency',q.currency,'created_at',q.created_at,'updated_at',q.updated_at,'net_sale',v.customer_document->'net_sale','total',v.customer_document->'total')) from public.quotes q left join public.quote_versions v on v.quote_id=q.id and v.revision=q.revision where q.organization_id=org and (q.created_by=auth.uid() or private.is_org_admin(org))),'[]'::jsonb)) into result;
 return result;
end $$;
commit;
