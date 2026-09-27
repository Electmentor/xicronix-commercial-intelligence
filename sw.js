const CACHE='xicronix-v2-46-9';
const SHELL=['./assistant.mjs?v=2.46.9','./radar-lifecycle.mjs?v=2.46.9','./performance.mjs?v=2.46.9','./performance.css?v=2.46.9','./analytics-view.mjs?v=2.46.9','./','./index.html','./styles.css?v=2.46.9','./production.css?v=2.46.9','./mobile-now.css?v=2.46.9','./executive.css?v=2.46.9','./app.js?v=2.46.9'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>{}).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 const critical=event.request.mode==='navigate'||/\/(index\.html|app\.js|styles\.css|production\.css|mobile-now\.css|executive\.css)$/.test(url.pathname);
 if(critical){
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html'))));
  return;
 }
 event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});