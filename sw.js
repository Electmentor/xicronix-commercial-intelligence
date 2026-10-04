const CACHE='xicronix-v2-49-0';
const SHELL=['./assistant.mjs?v=2.47.1','./radar-lifecycle.mjs?v=2.47.1','./performance.mjs?v=2.47.1','./performance.css?v=2.47.1','./analytics-view.mjs?v=2.47.1','./','./index.html','./styles.css?v=2.47.1','./production.css?v=2.47.1','./mobile-now.css?v=2.47.1','./executive.css?v=2.47.1','./app.js?v=2.49.0','./quote-editor.mjs?v=4','./quote-editor.css?v=1','./quote-template.mjs?v=1','./quote-document.mjs?v=1'];
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
self.addEventListener('push',event=>{
 let data={};try{data=event.data?event.data.json():{}}catch{data={body:event.data?.text()||''}}
 const title=data.title||'Xicronix Commercial Intelligence';
 const options={body:data.body||'Tienes una nueva alerta comercial.',tag:data.tag||'xicronix-commercial',data:{url:data.url||'/'},renotify:true};
 event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=new URL(event.notification.data?.url||'/',self.location.origin).href;
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
  for(const client of list){if('focus'in client){client.navigate(target);return client.focus();}}
  return clients.openWindow?clients.openWindow(target):undefined;
 }));
});
