(()=>{
  if(!("serviceWorker" in navigator))return;
  let deferred=null,refreshing=false;
  const button=()=>{
    let b=document.querySelector("[data-pwa-install]");
    if(b)return b;
    b=document.createElement("button");b.className="mini pwa-install";b.dataset.pwaInstall="1";b.textContent="Cài ứng dụng";b.hidden=!deferred;
    (document.querySelector(".top-actions")||document.querySelector(".public-nav"))?.appendChild(b);
    b.onclick=async()=>{if(!deferred)return;deferred.prompt();await deferred.userChoice.catch(()=>{});deferred=null;b.hidden=true};
    return b;
  };
  addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferred=e;const b=button();if(b)b.hidden=false});
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(refreshing)return;refreshing=true;
    if(sessionStorage.getItem("pickle-sw-reloaded")==="1"){sessionStorage.removeItem("pickle-sw-reloaded");return}
    sessionStorage.setItem("pickle-sw-reloaded","1");location.reload();
  });
  navigator.serviceWorker.register("service-worker.js",{scope:"./"}).then(reg=>{
    reg.update().catch(()=>{});
    if(reg.waiting)reg.waiting.postMessage({type:"SKIP_WAITING"});
    reg.addEventListener("updatefound",()=>{
      const worker=reg.installing;
      worker?.addEventListener("statechange",()=>{
        if(worker.state==="installed"&&navigator.serviceWorker.controller)worker.postMessage({type:"SKIP_WAITING"});
      });
    });
  }).catch(console.error);
  button();
})();