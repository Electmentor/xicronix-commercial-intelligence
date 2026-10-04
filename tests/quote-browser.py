"""Isolated quotation UI regression against deployed modules. No user session or real writes."""
import json, pathlib, os, hashlib, time, urllib.request
from playwright.sync_api import sync_playwright, expect
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'review-artifacts'/'quote-browser';out.mkdir(parents=True,exist_ok=True)
base='https://xicronix-commercial-intelligence.vercel.app/'
fixture='''<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="quote-editor.css?v=1"><body><h1>Isolated A009 quotation regression</h1><button id="open">Open saved quotation</button><script type="module">
import {openQuoteEditor} from './quote-editor.mjs?v=3';
const products=['SCN-F001A','EQ003VC','SCN-B006','EQ377E'].map((sku,n)=>({id:'product-'+n,supplier_sku:sku,name:'Synthetic '+sku,active:true}));
let versions=[],quoteId=null;const crm={catalog_products:products,opportunities:[{id:'opportunity-test',name:'Synthetic school opportunity'}],quotes:[]};
function calculate(inputs,items){if(!(inputs.exchange_rate>0))throw Error('Indica el tipo de cambio');const landed=items.reduce((s,i)=>s+i.quantity*100,0);const net=Math.round(landed/(1-inputs.margin_pct/100)*(1-inputs.discount_pct/100)*100)/100;return {items:items.map(i=>({...i,sku:products.find(p=>p.id===i.catalog_product_id).supplier_sku,description:'Synthetic',supplier_unit_price:100,landed_unit_cost:100,unit_price:100,line_subtotal:100*i.quantity})),landed_cost:landed,net_sale:net,gross_profit:net-landed,sales_igv:net*.18,total:net*1.18,working_capital:500,import_igv_pen:100,perception_pen:30,cash_need:landed+130,customer_advance:500,initial_supplier_payment:landed,real_margin_pct:30,markup_pct:42.86,requires_margin_approval:false};}
const authorizedCosts={id:'cost-test',name:'Authorized costs',quote_enabled:true,currency:'USD',exchange_rate:4,local_cost_pen:1800,freight_international:50,insurance:10,ad_valorem_rate:0,igv_rate:.18,perception_rate:0,contingency_rate:0,minimum_margin_pct:25,recoverable_igv:true,supplier_advance_pct:100};
const sb={from(table){if(table==='cost_profiles')return {select(){return this},eq(){return Promise.resolve({data:[authorizedCosts]})}};let filters=[];return {select(){return this},eq(k,v){filters.push([k,v]);return this},order(){return Promise.resolve({data:versions.filter(v=>filters.every(([k,x])=>v[k]===x))})},single(){return Promise.resolve({data:versions.find(v=>filters.every(([k,x])=>v[k]===x))})}}},async rpc(name,args){if(name==='preview_xicronix_quote'){try{return {data:calculate(args.p_inputs,args.p_items)}}catch(e){return {error:{message:e.message}}}}if(name==='save_xicronix_quote'){quoteId='quote-test';let revision=versions.length+1;const financials=calculate(args.p_inputs,args.p_items);const customer_document={issuer:'XICRONIX',quote_number:'XQ-TEST',revision,date:'2026-10-03',title:args.p_header.title,customer:'Synthetic school',is_draft:true,currency:'PEN',scope:args.p_inputs.scope,terms:args.p_inputs.terms,items:financials.items.map(i=>({sku:i.sku,description:i.description,quantity:i.quantity,unit_price:i.unit_price,subtotal:i.line_subtotal})),net_sale:financials.net_sale,sales_igv:financials.sales_igv,total:financials.total,igv_pct:18,discount_pct:args.p_inputs.discount_pct};const v={id:'version-'+revision,quote_id:quoteId,revision,created_at:'2026-10-03',inputs:structuredClone(args.p_inputs),financials,customer_document};versions.push(v);crm.quotes=[{id:quoteId,revision,...args.p_header}];return {data:v};}if(name==='xicronix_customer_document')return {data:versions.find(v=>v.revision===args.p_revision).customer_document};return {error:{message:'Unexpected RPC'}};}};
let role='ADMIN';window.openSeller=()=>{role='SALES';quoteId=null;return open()};const open=()=>openQuoteEditor({sb,profile:{role},data:crm,quoteId,onSaved:async()=>{}});document.querySelector('#open').onclick=open;open();
</script></body></html>'''
# Wait for the exact candidate assets; testing a prior deployment is not success.
assets=['quote-editor.mjs','quote-editor.css','quote-document.mjs','quote-template.mjs']
for attempt in range(24):
 try:
  for asset in assets:
   with urllib.request.urlopen(base+asset+'?quote-verification='+str(time.time()),timeout=20) as response: body=response.read()
   assert hashlib.sha256(body).digest()==hashlib.sha256((root/asset).read_bytes()).digest(),asset
  break
 except Exception:
  if attempt==23:raise
  time.sleep(5)
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route(base+'__quote_regression__',lambda route:route.fulfill(status=200,content_type='text/html',body=fixture))
 page.goto(base+'__quote_regression__',wait_until='networkidle')
 expect(page.get_by_role('button',name='Cargar Lab FQBM 12/4')).to_be_visible()
 page.get_by_role('button',name='Cargar Lab FQBM 12/4').click()
 expect(page.get_by_label('Cantidad 1',exact=True)).to_have_value('4')
 expect(page.locator('[data-items] tbody tr')).to_have_count(4)
 page.get_by_label('Cantidad 1',exact=True).fill('5')
 page.get_by_label('Margen bruto objetivo · %',exact=True).fill('35')
 page.get_by_label('Descuento global · %',exact=True).fill('5')
 expect(page.locator('[data-message]')).to_contain_text('Cálculo actualizado')
 page.get_by_role('button',name='Guardar nueva versión').click()
 expect(page.locator('[data-message]')).to_contain_text('Versión 1 guardada')
 page.screenshot(path=str(out/'desktop.png'),full_page=True)
 with page.expect_download() as event:page.get_by_role('button',name='Documento cliente · HTML / PDF').click()
 download=event.value;file=out/'client-test.html';download.save_as(file)
 html=file.read_text();assert 'BORRADOR' in html
 for word in ['supplier_unit_price','landed_unit_cost','financials','markup_pct','gross_profit']:assert word not in html,word
 page.get_by_role('button',name='Cerrar cotizador').click()
 page.get_by_role('button',name='Open saved quotation').click()
 expect(page.get_by_label('Cantidad 1',exact=True)).to_have_value('5')
 expect(page.get_by_label('Margen bruto objetivo · %',exact=True)).to_have_value('35')
 page.get_by_label('Descuento global · %',exact=True).fill('7')
 expect(page.get_by_role('button',name='Documento cliente · HTML / PDF')).to_be_disabled()
 page.get_by_role('button',name='Guardar nueva versión').click()
 expect(page.locator('[data-message]')).to_contain_text('Versión 2 guardada')
 expect(page.locator('[data-history] option')).to_have_count(3)
 with page.expect_download() as old_event:page.get_by_label('Versiones guardadas').select_option('1')
 old_file=out/'client-version-1.html';old_event.value.save_as(old_file);assert old_file.read_text()==html
 page.set_viewport_size({'width':390,'height':844})
 assert page.locator('dialog').evaluate('(el)=>el.getBoundingClientRect().width<=innerWidth'), 'Dialog exceeds mobile viewport'
 page.screenshot(path=str(out/'mobile.png'),full_page=True)
 page.evaluate('window.openSeller()')
 expect(page.locator('[name=exchange_rate]')).to_be_disabled()
 expect(page.locator('[name=minimum_margin_pct]')).to_be_disabled()
 expect(page.locator('[name=costs_confirmed]')).to_be_disabled()
 expect(page.locator('[name=technical_confirmed]')).to_be_disabled()
 page.locator('[name=cost_profile_id]').select_option('cost-test')
 expect(page.locator('[name=exchange_rate]')).to_have_value('4')
 expect(page.locator('[name=local_cost_pen]')).to_have_value('1800')
 page.get_by_role('button',name='Cargar Lab FQBM 12/4').click()
 expect(page.locator('[name=exchange_rate]')).to_have_value('4')
 expect(page.locator('[name=local_cost_pen]')).to_have_value('1800')
 expect(page.get_by_label('Cantidad 1',exact=True)).to_be_enabled()
 expect(page.get_by_label('Precio 1',exact=True)).to_be_enabled()
 expect(page.locator('[name=discount_pct]')).to_be_enabled()
 page.get_by_label('Cantidad 1',exact=True).fill('6')
 page.get_by_role('button',name='Guardar nueva versión').click()
 expect(page.locator('[data-message]')).to_contain_text('Versión 3 guardada')
 expect(page.locator('[name=exchange_rate]')).to_be_disabled()
 page.screenshot(path=str(out/'seller.png'),full_page=True)
 assert not errors,errors
 browser.close()
(out/'result.json').write_text(json.dumps({'passed':True,'scope':'deployed quotation modules with isolated synthetic backend; actual SQL engine tested separately','checks':['template','add/edit quantities','margin/discount inputs','save','reload','versioning','historic export','client privacy','mobile bounds','no JS errors']}))
print('PASS: deployed quotation UI with isolated data; desktop/mobile, versioning and client export')
