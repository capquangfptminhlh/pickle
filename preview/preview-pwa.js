(()=>{
  if(!("serviceWorker" in navigator))return;
  let deferred=null;
  const button=()=>{
    let b=document.querySelector("[data-pwa-install]");
    if(b)return b;
    b=document.createElement("button");b.className="mini pwa-install";b.dataset.pwaInstall="1";b.textContent="Cài ứng dụng";b.hidden=!deferred;
    (document.querySelector(".top-actions")||document.querySelector(".public-nav"))?.appendChild(b);
    b.onclick=async()=>{if(!deferred)return;deferred.prompt();await deferred.userChoice.catch(()=>{});deferred=null;b.hidden=true};
    return b;
  };
  addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferred=e;const b=button();if(b)b.hidden=false});
  navigator.serviceWorker.register("service-worker.js",{scope:"./"}).catch(console.error);
  button();
})();