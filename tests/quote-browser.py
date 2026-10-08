"""Quotation UI against candidate assets and a synthetic backend. No real sessions or writes."""
import argparse
import functools
import hashlib
import http.server
import json
import os
import pathlib
import threading
import time
import urllib.request
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--base-url', help='Optional deployed candidate; every quote asset must match this checkout')
parser.add_argument('--output', default=str(root / 'review-artifacts' / 'quote-browser'))
args = parser.parse_args()
out = pathlib.Path(args.output)
out.mkdir(parents=True, exist_ok=True)
# Even startup/deployment failures leave explicit unsuccessful review evidence.
(out / 'result.json').write_text(json.dumps({'passed': False, 'stage': 'starting', 'checks': []}))

class QuietServer(http.server.SimpleHTTPRequestHandler):
 def log_message(self, *_):
  pass

server = None
if args.base_url:
 base = args.base_url.rstrip('/') + '/'
else:
 server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietServer, directory=str(root)))
 threading.Thread(target=server.serve_forever, daemon=True).start()
 base = f'http://127.0.0.1:{server.server_port}/'

fixture='''<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="quote-editor.css?v=1"><body><h1>Isolated A009 quotation regression</h1><button id="open">Open saved quotation</button><script type="module">
import {openQuoteEditor} from './quote-editor.mjs?v=6';
const products=['SCN-F001A','EQ003VC','SCN-B006','EQ377E'].map((sku,n)=>({id:'product-'+n,supplier_sku:sku,name:'Synthetic '+sku,active:true}));
let versions=[],quoteId=null;const crm={catalog_products:products,opportunities:[{id:'opportunity-test',name:'Synthetic school opportunity'}],quotes:[]};
function calculate(inputs,items){inputs={exchange_rate:4,margin_pct:30,...inputs};if(!(inputs.exchange_rate>0))throw Error('Indica el tipo de cambio');const landed=items.reduce((s,i)=>s+i.quantity*100,0);const net=Math.round(landed/(1-inputs.margin_pct/100)*(1-inputs.discount_pct/100)*100)/100;return {items:items.map(i=>({...i,sku:products.find(p=>p.id===i.catalog_product_id).supplier_sku,description:'Synthetic',supplier_unit_price:100,landed_unit_cost:100,unit_price:100,line_subtotal:100*i.quantity})),landed_cost:landed,net_sale:net,gross_profit:net-landed,sales_igv:net*.18,total:net*1.18,working_capital:500,import_igv_pen:100,perception_pen:30,cash_need:landed+130,customer_advance:500,initial_supplier_payment:landed,real_margin_pct:30,markup_pct:42.86,requires_margin_approval:false};}
const authorizedCosts={id:'cost-test',name:'Authorized costs',quote_enabled:true,currency:'USD',exchange_rate:4,local_cost_pen:1800,freight_international:50,insurance:10,ad_valorem_rate:0,igv_rate:.18,perception_rate:0,contingency_rate:0,minimum_margin_pct:25,recoverable_igv:true,supplier_advance_pct:100};
const sb={from(table){if(table==='cost_profiles')return {select(){return this},eq(){return Promise.resolve({data:[authorizedCosts]})}};let filters=[];return {select(){return this},eq(k,v){filters.push([k,v]);return this},order(){return Promise.resolve({data:versions.filter(v=>filters.every(([k,x])=>v[k]===x))})},single(){return Promise.resolve({data:versions.find(v=>filters.every(([k,x])=>v[k]===x))})}}},async rpc(name,args){if(name==='xicronix_sales_data')return {data:{catalog_products:products,cost_profiles:[{id:authorizedCosts.id,name:authorizedCosts.name,quote_enabled:true}]}};if(name==='xicronix_quote_version')return {data:args.p_revision==null?versions.filter(v=>v.quote_id===args.p_quote_id).map(v=>({revision:v.revision,created_at:v.created_at})):versions.find(v=>v.quote_id===args.p_quote_id&&v.revision===args.p_revision)};if(name==='preview_xicronix_quote'){try{return {data:calculate(args.p_inputs,args.p_items)}}catch(e){return {error:{message:e.message}}}}if(name==='save_xicronix_quote'){quoteId='quote-test';let revision=versions.length+1;const financials=calculate(args.p_inputs,args.p_items);const customer_document={issuer:'XICRONIX',quote_number:'XQ-TEST',revision,date:'2026-10-03',title:args.p_header.title,customer:'Synthetic school',is_draft:true,currency:'PEN',scope:args.p_inputs.scope,terms:args.p_inputs.terms,items:financials.items.map(i=>({sku:i.sku,description:i.description,quantity:i.quantity,unit_price:i.unit_price,subtotal:i.line_subtotal})),net_sale:financials.net_sale,sales_igv:financials.sales_igv,total:financials.total,igv_pct:18,discount_pct:args.p_inputs.discount_pct};const v={id:'version-'+revision,quote_id:quoteId,revision,created_at:'2026-10-03',inputs:structuredClone(args.p_inputs),financials,customer_document};versions.push(v);crm.quotes=[{id:quoteId,revision,...args.p_header}];return {data:v};}if(name==='xicronix_customer_document')return {data:versions.find(v=>v.revision===args.p_revision).customer_document};return {error:{message:'Unexpected RPC'}};}};
let role='ADMIN',workspace='admin';window.openSeller=()=>{role='SALES';workspace='seller';quoteId=null;return open()};window.openAdminSeller=()=>{role='ADMIN';workspace='seller';return open()};window.openDirector=()=>{role='ADMIN';workspace='admin';return open()};const open=()=>openQuoteEditor({sb,profile:{role},workspace,data:crm,quoteId,onSaved:async()=>{}});document.querySelector('#open').onclick=open;open();
</script></body></html>'''
# A PR must exercise its own assets, not wait for it to be deployed to production.
# Explicit deployed verification remains available and never accepts an older build.
assets = ['quote-editor.mjs', 'quote-editor.css', 'quote-document.mjs', 'quote-template.mjs', 'brand/xicronix-logo-official.png']
if args.base_url:
 for attempt in range(24):
  try:
   for asset in assets:
    with urllib.request.urlopen(base + asset + '?quote-verification=' + str(time.time()), timeout=20) as response:
     body = response.read()
    assert hashlib.sha256(body).digest() == hashlib.sha256((root / asset).read_bytes()).digest(), asset
   break
  except Exception:
   if attempt == 23:
    (out / 'result.json').write_text(json.dumps({'passed': False, 'stage': 'candidate-assets', 'base_url': base, 'error': 'Deployed quotation assets did not match the candidate checkout'}))
    raise
   time.sleep(5)

checks, errors, blocked = [], [], []
passed = False
with sync_playwright() as p:
 executable = os.environ.get('BROWSER_EXECUTABLE') or ('/usr/bin/chromium' if pathlib.Path('/usr/bin/chromium').exists() else None)
 try:
  browser = p.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])
 except Exception as error:
  (out / 'result.json').write_text(json.dumps({'passed': False, 'stage': 'browser-launch', 'base_url': base, 'error': str(error)}))
  if server:
   server.shutdown()
  raise
 context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
 def route_request(route):
  url = route.request.url
  if url == base + '__quote_regression__':
   route.fulfill(status=200, content_type='text/html', body=fixture)
  elif urlparse(url).netloc == urlparse(base).netloc:
   route.continue_()
  else:
   blocked.append(url.split('?')[0])
   route.abort()
 context.route('**/*', route_request)
 context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
 page = context.new_page()
 export = page.get_by_role('button', name='Documento oficial · PDF / imprimir', exact=True)
 def opened_document(action, revision):
  with page.expect_popup() as event:
   action()
  document = event.value
  expect(document.get_by_role('button', name='Imprimir / Guardar PDF', exact=True)).to_be_visible()
  expect(document.locator('body')).to_contain_text(f'Versión {revision}')
  expect(document.locator('.draft')).to_contain_text('BORRADOR COMERCIAL')
  # This catches broken root-relative logo URLs in blob previews and CSP failures.
  expect(document.locator('.brand img')).to_be_visible()
  logo = document.locator('.brand img')
  deadline = time.monotonic() + 10
  while not logo.evaluate('(image) => image.complete && image.naturalWidth > 0'):
   assert time.monotonic() < deadline, 'Official logo did not load under the document CSP'
   time.sleep(0.1)
  # Exercise the real button under the document CSP without opening an OS print dialog.
  document.evaluate('window.__printCalls = 0; window.print = () => window.__printCalls++')
  document.get_by_role('button', name='Imprimir / Guardar PDF', exact=True).click()
  assert document.evaluate('window.__printCalls') == 1, 'Document CSP blocked its print action'
  document.screenshot(path=str(out / f'customer-version-{revision}.png'), full_page=True)
  html = page.evaluate('(url) => fetch(url).then(response => response.text())', document.url)
  for private_field in ['supplier_unit_price', 'landed_unit_cost', 'financials', 'markup_pct', 'gross_profit']:
   assert private_field not in html, private_field
  document.close()
  return html
 try:
  page.goto(base + '__quote_regression__', wait_until='networkidle')
  expect(page.get_by_role('button', name='Cargar Lab FQBM 12/4')).to_be_visible()
  page.get_by_role('button', name='Cargar Lab FQBM 12/4').click()
  expect(page.get_by_label('Cantidad 1', exact=True)).to_have_value('4')
  expect(page.locator('[data-items] tbody tr')).to_have_count(4)
  checks.append('template quantities and all four products')
  page.get_by_label('Cantidad 1', exact=True).fill('5')
  page.get_by_label('Margen bruto objetivo · %', exact=True).fill('35')
  page.get_by_label('Descuento global · %', exact=True).fill('5')
  expect(page.locator('[data-message]')).to_contain_text('Cálculo actualizado')
  page.get_by_role('button', name='Guardar nueva versión').click()
  expect(page.locator('[data-message]')).to_contain_text('Versión 1 guardada')
  checks.append('quantity margin and discount changes save version 1')
  page.screenshot(path=str(out / 'desktop.png'), full_page=True)
  html = opened_document(export.click, 1)
  (out / 'client-test.html').write_text(html)
  checks.append('customer popup is branded printable and contains no internal financial fields')
  # Verify the supported download fallback separately, rather than forcing every export down it.
  page.evaluate('window.__originalOpen = window.open; window.open = () => null')
  try:
   with page.expect_download() as event:
    export.click()
   download = event.value
   assert download.suggested_filename == 'XQ-TEST-v1.html'
   download.save_as(out / 'client-fallback.html')
   assert (out / 'client-fallback.html').read_text() == html
   expect(page.locator('[data-message]')).to_contain_text('Se descargó el documento imprimible')
  finally:
   page.evaluate('window.open = window.__originalOpen; delete window.__originalOpen')
  checks.append('blocked popup downloads the identical approved customer document')
  page.get_by_role('button', name='Cerrar cotizador').click()
  page.get_by_role('button', name='Open saved quotation').click()
  expect(page.get_by_label('Cantidad 1', exact=True)).to_have_value('5')
  expect(page.get_by_label('Margen bruto objetivo · %', exact=True)).to_have_value('35')
  checks.append('saved quotation restores quantity and margin')
  page.get_by_label('Descuento global · %', exact=True).fill('7')
  expect(export).to_be_disabled()
  page.get_by_role('button', name='Guardar nueva versión').click()
  expect(page.locator('[data-message]')).to_contain_text('Versión 2 guardada')
  expect(page.locator('[data-history] option')).to_have_count(3)
  checks.append('unsaved changes block export and saving creates a second version')
  historical = opened_document(lambda: page.get_by_label('Versiones guardadas').select_option('1'), 1)
  (out / 'client-version-1.html').write_text(historical)
  assert historical == html
  expect(page.get_by_label('Descuento global · %', exact=True)).to_have_value('7')
  expect(export).to_be_enabled()
  checks.append('historical export is immutable and does not dirty the current quotation')
  page.set_viewport_size({'width': 390, 'height': 844})
  assert page.locator('dialog').evaluate('(el) => el.getBoundingClientRect().width <= innerWidth'), 'Dialog exceeds mobile viewport'
  page.screenshot(path=str(out / 'mobile.png'), full_page=True)
  checks.append('dialog fits the mobile viewport')
  page.evaluate('window.openSeller()')
  expect(page.locator('[name=exchange_rate]')).to_have_count(0)
  expect(page.locator('[name=minimum_margin_pct]')).to_have_count(0)
  expect(page.locator('[name=costs_confirmed]')).to_have_count(0)
  expect(page.locator('[name=technical_confirmed]')).to_have_count(0)
  page.locator('[name=cost_profile_id]').select_option('cost-test')
  expect(page.locator('[name=exchange_rate]')).to_have_count(0)
  expect(page.locator('[name=local_cost_pen]')).to_have_count(0)
  page.get_by_role('button', name='Cargar Lab FQBM 12/4').click()
  expect(page.locator('[name=exchange_rate]')).to_have_count(0)
  expect(page.locator('[name=local_cost_pen]')).to_have_count(0)
  expect(page.get_by_label('Cantidad 1', exact=True)).to_be_enabled()
  expect(page.get_by_label('Precio 1', exact=True)).to_be_enabled()
  expect(page.locator('[name=discount_pct]')).to_be_enabled()
  page.get_by_label('Cantidad 1', exact=True).fill('6')
  page.get_by_role('button', name='Guardar nueva versión').click()
  expect(page.locator('[data-message]')).to_contain_text('Versión 3 guardada')
  expect(page.locator('[name=exchange_rate]')).to_have_count(0)
  expect(page.locator('[name=margin_pct]')).to_have_count(0)
  for label in ['Costo puesto', 'Utilidad bruta', 'Capital de trabajo', 'Margen bruto real', 'Pago inicial proveedor']:
   assert label not in page.locator('dialog').inner_text(), label
  page.screenshot(path=str(out / 'seller.png'), full_page=True)
  checks.append('seller can price and save without director-only costs or margin')
  page.evaluate('window.openAdminSeller()')
  expect(page.locator('[name=exchange_rate]')).to_have_count(0)
  expect(page.locator('[name=margin_pct]')).to_have_count(0)
  for label in ['Costo puesto', 'Utilidad bruta', 'Capital de trabajo', 'Margen bruto real', 'Pago inicial proveedor']:
   assert label not in page.locator('dialog').inner_text(), label
  page.locator('[name=discount_pct]').fill('4')
  page.get_by_role('button', name='Guardar nueva versión').click()
  expect(page.locator('[data-message]')).to_contain_text('Versión 4 guardada')
  expect(page.locator('[name=exchange_rate]')).to_have_count(0)
  page.screenshot(path=str(out / 'admin-commercial.png'), full_page=True)
  checks.append('administrator commercial mode keeps director financial details hidden')
  page.evaluate('window.openDirector()')
  expect(page.locator('[name=exchange_rate]')).to_be_visible()
  expect(page.locator('[data-summary]')).to_contain_text('Costo puesto')
  checks.append('director mode restores authorized cost details')
  assert not errors, errors
  assert not blocked, blocked
  checks.append('no JavaScript errors or requests to external services')
  passed = True
 except Exception as error:
  errors.append(str(error))
  page.screenshot(path=str(out / 'failure.png'), full_page=True)
  raise
 finally:
  (out / 'result.json').write_text(json.dumps({'passed': passed, 'base_url': base, 'scope': 'candidate quotation assets with isolated synthetic backend; SQL engine tested separately', 'checks': checks, 'javascript_errors': errors, 'blocked_requests': blocked}, ensure_ascii=False, indent=2))
  browser.close()
  if server:
   server.shutdown()
print(f'PASS: {len(checks)} quotation UI checks; desktop/mobile, versioning, print popup and download fallback')
