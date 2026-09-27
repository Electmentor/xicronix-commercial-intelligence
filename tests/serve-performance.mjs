// Loopback-only fixture; never connects to or writes a backend.
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');const path=url.pathname.slice(1)||'index.html';
 if(path.includes('..')||!/^([\w-]+\.(html|js|mjs|css|svg|png|webmanifest)|tests\/browser-fixture.js)$/.test(path)){res.writeHead(404);res.end();return;}
 const file=new URL(path,root);if(!existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'none'");
 res.setHeader('Content-Type',path.endsWith('.css')?'text/css':/\.(mjs|js)$/.test(path)?'text/javascript':path.endsWith('.html')?'text/html':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'application/json');
 let content=readFileSync(file);
 if(path==='tests/browser-fixture.js'){const role=['ADMIN','SALES','VIEWER'].includes(url.searchParams.get('role'))?url.searchParams.get('role'):'ADMIN';content='window.__testConfig='+JSON.stringify({role})+';'+content.toString()+`\n(()=>{const blobs=new Map(),create=URL.createObjectURL.bind(URL),element=document.createElement.bind(document);URL.createObjectURL=b=>{const url=create(b);blobs.set(url,b);return url;};document.createElement=(tag,...args)=>{const e=element(tag,...args);if(tag==='a'){const click=e.click.bind(e);e.click=()=>{if(e.download&&blobs.has(e.href)){blobs.get(e.href).text().then(text=>{const result=element('output');result.id='fixture-export-result';result.textContent='EXPORTACIÓN VERIFICADA: '+e.download+' · '+text.split('\\r\\n').length+' filas · '+text.slice(0,160);document.body.append(result);});}click();};}return e;};})();`;}
 if(path==='index.html')content=content.toString().replace(/<script defer src="https:\/\/cdn.jsdelivr.net\/npm\/@supabase[\s\S]*?<\/script>/,'<script src="tests/browser-fixture.js?role='+encodeURIComponent(url.searchParams.get('role')||'ADMIN')+'"></script>').replace(/<script defer src="https:\/\/unpkg.com\/leaflet[^>]*><\/script>/,'').replace(/<link[^>]+https:\/\/unpkg.com\/leaflet[^>]+>/,'');
 res.end(content);
}).listen(4175,'127.0.0.1',()=>console.log('Isolated CRM: http://127.0.0.1:4175'));
