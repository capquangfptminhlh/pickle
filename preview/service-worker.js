const V="pickle-preview-v5";
const CORE=["./index.html","./admin.html","./ranking.html","./tournament.html","./player.html","./checkin.html","./about.html","./offline.html","./preview-api.js","./preview-public.js","./preview-pwa.js","../assets/styles.css","../assets/public.css","../assets/admin-app.js","../assets/admin-modules.js","../assets/ui-motion.js","../assets/player.js","../assets/ranking.js","../assets/tournament.js","../assets/checkin.js","../assets/app-icon.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return;
  if(e.request.mode==="navigate"){
    e.respondWith(fetch(e.request).then(r=>{const x=r.clone();caches.open(V).then(c=>c.put(e.request,x));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match("./offline.html"))));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{if(r.ok)caches.open(V).then(c=>c.put(e.request,r.clone()));return r})));
});