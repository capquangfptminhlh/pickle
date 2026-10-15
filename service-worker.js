const VERSION="pickleup-v81-sequential-group-draw-20261015";
const STATIC=[
  "/assets/api.js?v=58",
  "/assets/tournament-gallery.js?v=1",
  "/assets/tournament-gallery.css?v=1",
  "/assets/referee-arena.css?v=5",
  "/assets/referee-arena.css",
  "/assets/courtside.css?v=1",
  "/assets/typography.css?v=1",
  "/assets/typography.css",
  "/assets/fonts/barlow-400-vietnamese.woff2",
  "/assets/fonts/barlow-400-latin.woff2",
  "/assets/fonts/barlow-500-vietnamese.woff2",
  "/assets/fonts/barlow-500-latin.woff2",
  "/assets/fonts/barlow-600-vietnamese.woff2",
  "/assets/fonts/barlow-600-latin.woff2",
  "/assets/fonts/barlow-700-vietnamese.woff2",
  "/assets/fonts/barlow-700-latin.woff2",
  "/assets/fonts/barlow-800-vietnamese.woff2",
  "/assets/fonts/barlow-800-latin.woff2",
  "/assets/fonts/barlow-condensed-700-vietnamese.woff2",
  "/assets/fonts/barlow-condensed-700-latin.woff2",
  "/assets/fonts/barlow-condensed-800-vietnamese.woff2",
  "/assets/fonts/barlow-condensed-800-latin.woff2",
  "/assets/draw-flex.js?v=10",
  "/assets/draw-reveal.js?v=1",
  "/assets/referee-courtside.js?v=17",
  "/assets/timeout-clock.js?v=1",
  "/assets/timeout-clock.css?v=1",
  "/assets/timeout-clock.js",
  "/assets/timeout-clock.css",
  "/assets/court-board.js?v=9",
  "/assets/court-board.css?v=3",
  "/assets/match-live.js?v=5",
  "/assets/public-refresh.css?v=2",
  "/assets/public-refresh.css",
  "/assets/ranking.js?v=3",
  "/assets/public.js?v=55",
  // Offline templates request versioned URLs; cache those exact requests too.
  "/assets/theme.js?v=1",
  "/assets/theme.css?v=2",
  "/assets/site-light.css?v=1",
  "/assets/admin-light.css?v=2",
  "/assets/site-sport.css?v=10",
  "/assets/styles.css?v=4",
  "/assets/ui-motion.js?v=34",
  "/assets/tournament-detail.css?v=1",
  "/assets/tournament.js?v=57",
  "/assets/admin-sport.css?v=7",
  "/assets/player-avatar-input.js?v=1",
  "/assets/admin-app.js?v=84",
  "/assets/bracket-ui.js?v=38",
  "/assets/admin-crud.js?v=13",
  "/assets/player-picker.js?v=3",
  "/assets/match-format.js?v=7",
  "/assets/match-format.js",
  "/assets/team-lineup.js?v=8",
  "/assets/team-lineup.css?v=5",
  "/assets/team-lineup.css",
  "/assets/team-lineup.js",
  "/assets/theme.js",
  "/assets/theme.css",
  "/assets/site-light.css",
  "/assets/admin-light.css",
  "/assets/player-avatar-input.js",
  "/assets/admin-app.js",
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
  "/assets/login.js?v=3",
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
      fetch(new Request(req.url,{headers:req.headers,credentials:req.credentials,redirect:"follow"})).then(async res=>{
        if(res.ok){
          let finalRes=res;
          if(res.redirected){
            finalRes=new Response(res.body,{status:res.status,statusText:res.statusText,headers:res.headers});
          }else{
            try{const c=await caches.open(VERSION);await c.put(req,finalRes.clone());}catch(_){}
          }
          return finalRes;
        }
        return (await caches.match(req))||(await caches.match("/offline.html"))||res;
      }).catch(async()=>(await caches.match(req))||(await caches.match("/offline.html"))||new Response("<!doctype html><title>Offline</title><p>Mạng không khả dụng.</p>",{status:503,headers:{"Content-Type":"text/html; charset=utf-8"}}))
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
