const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
 const page=await browser.newPage({viewport:{width:1366,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:4173/')?route.continue():route.abort());
 await page.goto('http://127.0.0.1:4173');
 await page.getByRole('button',{name:'Enviar consulta sintética'}).click();
 await page.getByRole('button',{name:/Contacto sintético/}).click();
 await page.getByRole('button',{name:'Tomar atención humana'}).click();
 await page.locator('#cv-reply textarea:enabled').fill('[SYNTHETIC] Aquí tienes la información de laboratorio solicitada.');
 await page.getByRole('button',{name:'Poner respuesta en cola'}).click();
 await page.getByText('Pendiente de envío',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Recibir respuestas de Nexa'}).click();
 await page.getByText('Entregado al navegador',{exact:false}).waitFor();
 await page.locator('#cv-edit input[name=next_action]').fill('Seguimiento sintético concluido');
 await page.locator('#cv-edit input[name=closed_reason]').fill('Consulta respondida');
 await page.locator('#cv-edit input[name=closure_evidence]').fill('Información solicitada entregada y solicitud satisfecha');
 await page.locator('#cv-edit input[name=resolution_confirmed]').check();
 await page.locator('#cv-edit input[name=follow_up_at]').fill('2026-10-10T10:00');
 await page.locator('#cv-edit select[name=status]').selectOption('resolved');
 await page.getByRole('button',{name:'Guardar seguimiento'}).click();
 await page.getByText('nexa · Resuelta',{exact:false}).waitFor();
 await page.reload();await page.locator('#cv-pending').uncheck();await page.getByRole('button',{name:/Contacto sintético/}).click();
 await page.locator('#cv-edit input[name=closed_reason]').waitFor();
 assert.equal(await page.locator('#cv-edit input[name=closed_reason]').inputValue(),'Consulta respondida');
 assert.equal(await page.locator('#cv-edit select[name=status]').inputValue(),'resolved');
 assert.equal(await page.locator('#cv-edit input[name=next_action]').inputValue(),'Seguimiento sintético concluido');
 await page.screenshot({path:process.env.SCREENSHOT_PATH||'/tmp/a009-conversations-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);if(overflow)throw Error('mobile_overflow');
 await page.screenshot({path:(process.env.SCREENSHOT_PATH||'/tmp/a009-conversations-desktop.png').replace('desktop','mobile'),fullPage:true});
 const newSession=await browser.newContext();const fresh=await newSession.newPage();await fresh.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:4173/')?r.continue():r.abort());await fresh.goto('http://127.0.0.1:4173');await fresh.locator('#cv-pending').uncheck();await fresh.getByRole('button',{name:/Contacto sintético/}).click();assert.equal(await fresh.locator('#cv-edit select[name=status]').inputValue(),'resolved');assert.equal(await fresh.locator('#cv-edit input[name=closure_evidence]').inputValue(),'Información solicitada entregada y solicitud satisfecha');await newSession.close();
 if(errors.length)throw Error(errors.join(';'));
 console.log('PASS: synthetic browser intake, inbox, takeover, reply, visitor ack, closure, persisted reload fields, mobile width; no page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
