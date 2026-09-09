// Local visual-test server. Never ships real credentials or calls Supabase.
// Only explicitly listed assets are served; bound to loopback.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const allowed=['app.js','domain.mjs','workspace.mjs','demo.mjs','executive.mjs','styles.css','executive.css'];
const fixture=`window.supabase={createClient(){return {
 from(table){return {select(){return this},eq(){return this},order(){return this},or(){return this},async maybeSingle(){return {data:{id:'local-admin',organization_id:'local-demo-org',role:'ADMIN',full_name:'Dirección · prueba local'},error:null}},async range(){return {data:[],error:null}}}},
 auth:{onAuthStateChange(callback){setTimeout(()=>callback('SIGNED_IN',{user:{id:'local-admin',email:'local@example.invalid'}}),0)},async signOut(){return {error:null}}}
}}};`;
new Function(fixture); // Fail startup if the isolated SDK double has a syntax error.
createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname.slice(1);
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'self'");
 if(path==='fixture-auth.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
 if(!path||path==='index.html'){
  res.setHeader('Content-Type','text/html');
  res.end(readFileSync(new URL('index.html',root),'utf8').replace('<script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>','<script src="fixture-auth.js"></script>'));return;
 }
 if(path==='frame.html'){
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body style="margin:0"><iframe title="Prueba 1366 por 768" src="/" style="display:block;border:0;width:1366px;height:768px"></iframe></body></html>');return;
 }
 if(!allowed.includes(path)){res.writeHead(404);res.end('Not found');return;}
 res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');
 res.end(readFileSync(fileURLToPath(new URL(path,root))));
}).listen(4175,'127.0.0.1',()=>console.log('Isolated UI fixture ready: http://127.0.0.1:4175 (no external connections)'));
