const VERSION="pickleup-pages-v21-correct-pool-sizing-20260928";
const CORE=[
  "./",
  "./index.html",
  "./login.html",
  "./admin.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./assets/styles.css",
  "./assets/pickleup-ui.css",
  "./assets/public.css",
  "./assets/home-mobile.css",
  "./assets/submit-mobile.css",
  "./assets/ui-motion.js",
  "./assets/login.js",
  "./assets/admin-app.js",
  "./preview-guard.js",
  "./assets/app-icon-v4.svg",
  "./assets/pickleup-logo-v5.svg",
  "./preview-api.js",
  "./preview-public.js",
  "./preview-pwa.js"
];
self.addEventListener("install",event=>{event.waitUntil(caches.open(VERSION).then(c=>Promise.allSettled(CORE.map(u=>c.add(u)))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting()});
self.addEventListener("fetch",event=>{
  const req=event.request;if(req.method!=="GET")return;
  const url=new URL(req.url);if(url.origin!==self.location.origin)return;
  if(req.mode==="navigate"){event.respondWith(fetch(req).then(async res=>{if(res.ok){const c=await caches.open(VERSION);await c.put(req,res.clone())}return res}).catch(async()=>await caches.match(req)||await caches.match("./offline.html")));return}
  if(["script","style","font","image"].includes(req.destination)){event.respondWith(fetch(req).then(async res=>{if(res.ok){const c=await caches.open(VERSION);await c.put(req,res.clone())}return res}).catch(()=>caches.match(req)))}
});