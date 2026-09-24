(()=>{
  if(!("serviceWorker" in navigator))return;

  const state={deferred:null};
  const toast=(text,action)=>{
    const old=document.querySelector(".pwa-toast");if(old)old.remove();
    const el=document.createElement("div");el.className="pwa-toast";
    el.innerHTML=`<span>${text}</span>${action?`<button type="button">${action.label}</button>`:""}`;
    document.body.appendChild(el);
    if(action)el.querySelector("button").onclick=action.onClick;
    setTimeout(()=>{if(el.isConnected)el.remove()},9000);
  };

  const installButton=()=>{
    let b=document.querySelector("[data-pwa-install]");
    if(b)return b;
    b=document.createElement("button");
    b.type="button";b.className="mini pwa-install";b.dataset.pwaInstall="1";b.textContent="Cài ứng dụng";
    const target=document.querySelector(".top-actions")||document.querySelector(".public-nav");
    if(target)target.appendChild(b); else return null;
    b.hidden=!state.deferred;
    b.onclick=async()=>{
      if(!state.deferred)return;
      state.deferred.prompt();
      await state.deferred.userChoice.catch(()=>{});
      state.deferred=null;b.hidden=true;
    };
    return b;
  };

  window.addEventListener("beforeinstallprompt",e=>{
    e.preventDefault();state.deferred=e;const b=installButton();if(b)b.hidden=false;
  });
  window.addEventListener("appinstalled",()=>{state.deferred=null;toast("Đã cài Pickle Tour trên thiết bị.")});

  const showNetwork=()=>{
    document.documentElement.dataset.network=navigator.onLine?"online":"offline";
    if(!navigator.onLine)toast("Bạn đang offline. Live score sẽ đồng bộ khi có mạng.");
  };
  addEventListener("online",showNetwork);addEventListener("offline",showNetwork);showNetwork();

  navigator.serviceWorker.register("/service-worker.js",{scope:"/"}).then(reg=>{
    if(reg.waiting)toast("Có phiên bản mới.",{label:"Cập nhật",onClick:()=>reg.waiting.postMessage({type:"SKIP_WAITING"})});
    reg.addEventListener("updatefound",()=>{
      const worker=reg.installing;
      worker?.addEventListener("statechange",()=>{
        if(worker.state==="installed"&&navigator.serviceWorker.controller){
          toast("Có phiên bản mới.",{label:"Cập nhật",onClick:()=>worker.postMessage({type:"SKIP_WAITING"})});
        }
      });
    });
  }).catch(console.error);

  let refreshing=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(refreshing)return;refreshing=true;location.reload();
  });

  installButton();
})();