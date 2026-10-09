import test from 'node:test';import assert from 'node:assert/strict';
import {renderCustomerDocument} from '../quote-document.mjs';
import {LAB_FQBM} from '../quote-template.mjs';
const doc={issuer:'XICRONIX E.I.R.L.',quote_number:'XQ-TEST',revision:1,date:'2026-10-03',title:'FQBM',customer:'Colegio <script>bad()</script>',scope:'4 mesas\n12 prácticas',terms:'Por confirmar',items:[{sku:'SKU',description:'Equipo',quantity:4,unit_price:100,subtotal:400,supplier_unit_price:999,source:'INTERNAL-SOURCE'}],discount_pct:10,net_sale:360,igv_pct:18,sales_igv:64.8,total:424.8,is_draft:true,landed_cost:888,gross_profit:777,markup_pct:123,financials:{secret:'INTERNAL'}};
test('client document uses a commercial allowlist; no embedded internal payload',()=>{const html=renderCustomerDocument(doc);for(const x of ['999','888','777','INTERNAL','supplier_unit_price','gross_profit','landed_cost','markup'])assert.ok(!html.includes(x),x);assert.match(html,/BORRADOR/);assert.match(html,/424[.,]80/);assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);});
test('confirmed document has no draft banner',()=>assert.ok(!renderCustomerDocument({...doc,is_draft:false}).includes('BORRADOR')));
test('official logo is a binary PNG rather than base64 text served with an image extension',async()=>{
 const {readFileSync}=await import('node:fs');
 const png=readFileSync(new URL('../brand/xicronix-logo-official.png',import.meta.url));
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(png.subarray(12,16).toString(),'IHDR');
 assert.equal(png.readUInt32BE(16),1536);
 assert.equal(png.readUInt32BE(20),512);
});
test('template has twelve proposed practices and requires commercial/technical validation',()=>{assert.equal(LAB_FQBM.items.length,4);assert.equal((LAB_FQBM.scope.match(/\n\d+\./g)||[]).length,12);assert.equal(LAB_FQBM.inputs.costs_confirmed,false);assert.equal(LAB_FQBM.inputs.technical_confirmed,false);});

test('print action is allowed by its exact CSP hash without enabling arbitrary inline script',async()=>{
 const {createHash}=await import('node:crypto');
 const html=renderCustomerDocument(doc);
 const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
 const handler=html.match(/<button onclick="([^"]+)">Imprimir/)[1];
 const scriptPolicy=policy.split(';').map(part=>part.trim()).find(part=>part.startsWith('script-src '));
 assert.equal(handler,'window.print()');
 assert.equal(scriptPolicy,`script-src 'unsafe-hashes' 'sha256-${createHash('sha256').update(handler).digest('base64')}'`);
 assert.match(policy,/^default-src 'none';/);
 assert.ok(!scriptPolicy.includes("'unsafe-inline'"));
});

test('browser print spy setup does not count as a print invocation',async()=>{
 const {readFileSync}=await import('node:fs');
 const {runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('./quote-browser.py',import.meta.url),'utf8');
 const setup=source.match(/^PRINT_SPY_SETUP = '([^'\n]+)'$/m)?.[1];
 assert.ok(setup,'Browser print spy setup is explicitly testable');
 const context={window:{}};
 // Match Python Playwright evaluate(): automatically invoke function results.
 const result=runInNewContext(setup,context);
 if(typeof result==='function')result();
 assert.equal(context.window.__printCalls,0,'Installing the spy must not print');
 context.window.print();
 assert.equal(context.window.__printCalls,1);
 context.window.print();
 assert.equal(context.window.__printCalls,2,'Each print invocation is counted exactly once');
});

test('official logo has an absolute URL permitted by the document CSP for blob and downloaded HTML',()=>{
 const html=renderCustomerDocument(doc);
 const image=html.match(/<img src="([^"]+)"/)[1];
 const expected=new URL('../brand/xicronix-logo-official.png?v=2',import.meta.url).href;
 assert.equal(image,expected);
 const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
 const allowedImage=new URL(expected);allowedImage.search='';allowedImage.hash='';
 const imagePolicy=policy.split(';').map(part=>part.trim()).find(part=>part.startsWith('img-src '));
 assert.equal(imagePolicy,`img-src data: ${allowedImage.href}`);
 assert.ok(!imagePolicy.includes('?'),'CSP source cannot contain a query string');
 assert.ok(!imagePolicy.includes('#'),'CSP source cannot contain a fragment');
});

test('quotation history and product selection do not mark saved inputs dirty',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../quote-editor.mjs',import.meta.url),'utf8');
 const handlerSource=source.match(/form\.oninput=(e=>\{[^\n]+\});/)[1];
 let reads=0,changes=0;
 const handler=new Function('read','changed',`return (${handlerSource});`)(()=>reads++,()=>changes++);
 for(const selector of ['[data-search]','[data-product]','[data-history]']){
  handler({target:{matches:selectors=>selectors.split(',').includes(selector)}});
 }
 assert.equal(reads,0);
 assert.equal(changes,0);
 handler({target:{matches:()=>false}});
 assert.equal(reads,1);
 assert.equal(changes,1);
});
