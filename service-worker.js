const VERSION="pickleup-v33-theme-choice-20261007";
const STATIC=[
  // Offline templates request versioned URLs; cache those exact requests too.
  "/assets/theme.js?v=1",
  "/assets/theme.css?v=1",
  "/assets/site-light.css?v=1",
  "/assets/admin-light.css?v=1",
  "/assets/site-sport.css?v=2",
  "/assets/admin-sport.css?v=4",
  "/assets/theme.js",
  "/assets/theme.css",
  "/assets/site-light.css",
  "/assets/admin-light.css",
  "/assets/submit-mobile.css",
  "/assets/home-mobile.css",
  "/offline.html",
  "/manifest.webmanifest",
  "/assets/styles.css",
  "/assets/public.css",
  "/assets/pickleup-ui.css",
  "/assets/admin-sport.css",
  "/assets/site-sport.css",
  "/assets/ui-motion.js",
  "/assets/draw-flex.js",
  "/referee.html",
  "/court-board.html",
  "/match.html",
  "/assets/courtside.css",
  "/assets/referee-courtside.js",
  "/assets/court-board.css",
  "/assets/court-board.js",
  "/assets/match-live.css",
  "/assets/match-live.js",
  "/assets/pwa.js",
  "/assets/login.js",
  "/assets/members-binh-loi-data.js",
  "/assets/app-icon-sport-v3.svg",
  "/assets/app-icon-sport-v3.svg",
  "/assets/pickleup-logo-sport-v3.svg"
];

async function cacheCore(){
  const cache=await caches.open(VERSION);
  await Promise.allSettled(STATIC.map(url=>cache.add(url)));
}

self.addEventListener("install",event=>{
  event.waitUntil(cacheCore());
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith("pickleup-")&&k!==VERSION).map(k=>caches.delete(k))))
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
      fetch(new Request(req,{cache:"reload"})).then(async res=>{
        if(res.ok){const c=await caches.open(VERSION);await c.put(req,res.clone())}
        return res;
      }).catch(async()=>await caches.match(req)||await caches.match("/offline.html"))
    );
    return;
  }

  if(req.destination==="script"||req.destination==="style"||req.destination==="font"){
    event.respondWith(
      fetch(new Request(req,{cache:"reload"})).then(async res=>{
        if(res.ok){const c=await caches.open(VERSION);await c.put(req,res.clone())}
        return res;
      }).catch(()=>caches.match(req))
    );
    return;
  }

  if(req.destination==="image"){
    event.respondWith(
      caches.match(req).then(cached=>{
        const refresh=fetch(new Request(req,{cache:"reload"})).then(async res=>{
          if(res.ok){const c=await caches.open(VERSION);await c.put(req,res.clone())}
          return res;
        }).catch(()=>cached);
        return cached||refresh;
      })
    );
  }
});
