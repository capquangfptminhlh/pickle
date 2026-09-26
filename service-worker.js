const VERSION="pickle-tour-v16-desktop-app-hub";
const STATIC=[
  "/offline.html",
  "/manifest.webmanifest",
  "/assets/styles.css",
  "/assets/public.css",
  "/assets/ui-motion.js",
  "/assets/pwa.js",
  "/assets/login.js",
  "/assets/members-binh-loi-data.js",
  "/assets/app-icon.svg"
];

async function cacheCore(){
  const cache=await caches.open(VERSION);
  await Promise.allSettled(STATIC.map(url=>cache.add(url)));
}

self.addEventListener("install",event=>{
  event.waitUntil(cacheCore().then(()=>self.skipWaiting()));
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING")self.skipWaiting();
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  if(url.pathname.startsWith("/api/")||
     url.pathname.startsWith("/socket.io/")||
     url.pathname.startsWith("/uploads/")){
    return;
  }

  if(req.mode==="navigate"){
    event.respondWith(
      fetch(req).then(async res=>{
        if(res.ok){const c=await caches.open(VERSION);await c.put(req,res.clone())}
        return res;
      }).catch(async()=>await caches.match(req)||await caches.match("/offline.html"))
    );
    return;
  }

  if(req.destination==="script"||req.destination==="style"||req.destination==="font"){
    event.respondWith(
      fetch(req).then(async res=>{
        if(res.ok){const c=await caches.open(VERSION);await c.put(req,res.clone())}
        return res;
      }).catch(()=>caches.match(req))
    );
    return;
  }

  if(req.destination==="image"){
    event.respondWith(
      caches.match(req).then(cached=>{
        const refresh=fetch(req).then(async res=>{
          if(res.ok){const c=await caches.open(VERSION);await c.put(req,res.clone())}
          return res;
        }).catch(()=>cached);
        return cached||refresh;
      })
    );
  }
});