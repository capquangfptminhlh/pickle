const VERSION="pickle-tour-v2";
const STATIC=[
  "/offline.html",
  "/assets/styles.css",
  "/assets/public.css",
  "/assets/ui-motion.js",
  "/assets/pwa.js",
  "/assets/app-icon.svg",
  "/assets/visual-hero-pickle.svg",
  "/assets/visual-court-night.svg",
  "/assets/visual-tournament.svg",
  "/assets/visual-news.svg"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(VERSION).then(c=>c.addAll(STATIC)));
});

self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING")self.skipWaiting();
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return;

  if(url.pathname.startsWith("/api/")||
     url.pathname.startsWith("/socket.io/")||
     url.pathname.startsWith("/uploads/")){
    return;
  }

  if(req.mode==="navigate"){
    event.respondWith(
      fetch(req).then(res=>{
        const copy=res.clone();
        caches.open(VERSION).then(c=>c.put(req,copy)).catch(()=>{});
        return res;
      }).catch(async()=>{
        return (await caches.match(req)) || (await caches.match("/offline.html"));
      })
    );
    return;
  }

  if(["style","script","font","image"].includes(req.destination)){
    event.respondWith(
      caches.match(req).then(cached=>{
        const network=fetch(req).then(res=>{
          if(res.ok)caches.open(VERSION).then(c=>c.put(req,res.clone())).catch(()=>{});
          return res;
        }).catch(()=>cached);
        return cached||network;
      })
    );
  }
});