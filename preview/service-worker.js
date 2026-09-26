const VERSION="pickle-pages-preview-v20-route-guard";
const CORE=[
  "./manifest.webmanifest",
  "./index.html","./login.html","./admin.html","./ranking.html","./tournament.html","./player.html","./checkin.html","./about.html","./offline.html",
  "./preview-api.js","./preview-public.js","./preview-pwa.js","./preview-guard.js",
  "../assets/styles.css","../assets/public.css","../assets/admin-app.js","../assets/admin-modules.js","../assets/admin-crud.js",
  "../assets/bracket-ui.js","../assets/csv-import.js","../assets/ui-motion.js","../assets/player.js","../assets/ranking.js",
  "../assets/tournament.js","../assets/checkin.js","../assets/members-binh-loi-data.js","../assets/app-icon.svg"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(VERSION)
      .then(cache=>Promise.allSettled(CORE.map(url=>cache.add(url))))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  if(req.mode==="navigate"){
    event.respondWith(
      fetch(req).then(async res=>{
        if(res.ok){const cache=await caches.open(VERSION);await cache.put(req,res.clone())}
        return res;
      }).catch(async()=>await caches.match(req)||await caches.match("./offline.html"))
    );
    return;
  }

  if(req.destination==="script"||req.destination==="style"||req.destination==="font"){
    event.respondWith(
      fetch(req).then(async res=>{
        if(res.ok){const cache=await caches.open(VERSION);await cache.put(req,res.clone())}
        return res;
      }).catch(()=>caches.match(req))
    );
    return;
  }

  if(req.destination==="image"){
    event.respondWith(
      caches.match(req).then(cached=>{
        const refresh=fetch(req).then(async res=>{
          if(res.ok){const cache=await caches.open(VERSION);await cache.put(req,res.clone())}
          return res;
        }).catch(()=>cached);
        return cached||refresh;
      })
    );
  }
});