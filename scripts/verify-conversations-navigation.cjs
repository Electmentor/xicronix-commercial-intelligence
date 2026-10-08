const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const p=path.join(root,new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);try{res.setHeader('Content-Type',p.endsWith('.mjs')||p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(4174,'127.0.0.1',r));
 let browser;try{browser=await chromium.launch({...process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=route.request().url();if(u.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'tests/browser-fixture.js'),'utf8')});if(u.includes('/api/conversations'))return route.fulfill({status:503,contentType:'application/json',body:'{"error":"dev_unavailable"}'});if(!u.startsWith('http://127.0.0.1:4174'))return route.abort();return route.continue();});
 await page.goto('http://127.0.0.1:4174');
 if(await page.locator('#entryDirectionBtn').isVisible())await page.locator('#entryDirectionBtn').click();
 await page.locator('#navigation button[data-page=conversations]').click();
 await page.getByText('Conversaciones no disponible:',{exact:false}).waitFor();
 if(!page.url().includes('conversations'))throw Error('route_not_updated');
 await page.locator('#navigation button[data-page=dashboard]').click();await page.locator('#dashboard:visible').waitFor();
 if(errors.length)throw Error(errors.join(';'));
 console.log('PASS: CRM navigation to #conversations, truthful unavailable state, return to dashboard; no page errors');
 }finally{if(browser)await browser.close();server.close();server.closeAllConnections();}
})().catch(e=>{console.error(e);process.exit(1)});
