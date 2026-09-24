(()=>{
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isPreview=location.pathname.includes("/preview/");
  const local=p=>isPreview?p.replace(/^\//,""):p;

  const observer=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(!e.isIntersecting)return;
      e.target.classList.add("is-visible");
      observer.unobserve(e.target);
    });
  },{threshold:.055,rootMargin:"0px 0px -24px"});

  function enhance(){
    const selectors=[
      ".kpi",".panel",".tour-card",".public-match",".public-standings",
      ".public-bracket-card",".match-card",".top-player-card",".news-card",
      ".sponsor-card",".club-card",".booking-card",".metric-card",
      ".hero-media-stage",".ranking-hero-grid>img",".player-avatar-wrap"
    ].join(",");
    $$(selectors).forEach((el,i)=>{
      if(el.dataset.motionReady)return;
      el.dataset.motionReady="1";
      el.classList.add("reveal-target");
      el.style.animationDelay=Math.min(i*24,180)+"ms";
      observer.observe(el);
    });
  }

  function ripple(e){
    const btn=e.target.closest(".btn,.mini,.icon-btn,.score-control button,.nav-btn");
    if(!btn)return;
    const r=btn.getBoundingClientRect(),s=document.createElement("span");
    s.className="ripple";
    s.style.left=(e.clientX-r.left)+"px";
    s.style.top=(e.clientY-r.top)+"px";
    btn.appendChild(s);
    setTimeout(()=>s.remove(),650);
  }

  function buildAdminDock(){
    if(!document.querySelector("#nav"))return;
    let dock=document.querySelector(".mobile-dock");
    if(!dock){dock=document.createElement("div");dock.className="mobile-dock";document.body.appendChild(dock)}
    const wanted=["dashboard","matches","scores","bracket"];
    dock.innerHTML=wanted.map(id=>{
      const src=document.querySelector('[data-page="'+id+'"]');if(!src)return"";
      const icon=src.querySelector(".ico")?.innerHTML||"";
      const label=src.querySelector(":scope > span:last-child")?.textContent?.trim()||src.textContent.trim();
      return '<button data-dock-page="'+id+'" class="'+(src.classList.contains("active")?"active":"")+'"><span class="ico-clone">'+icon+'</span><small>'+label+'</small></button>';
    }).join("");
    $$("[data-dock-page]",dock).forEach(b=>b.onclick=()=>{
      document.querySelector('[data-page="'+b.dataset.dockPage+'"]')?.click();
      document.querySelector("#sidebar")?.classList.remove("open");
    });
  }

  function buildPublicDock(){
    if(!document.body.classList.contains("public-body"))return;
    if(document.querySelector(".public-mobile-dock"))return;
    const home=isPreview?"index.html":"/";
    const ranking=isPreview?"ranking.html":"/ranking.html";
    const admin=isPreview?"admin.html":"/admin";
    const current=location.pathname;
    const homeActive=current.endsWith("/")||current.endsWith("/index.html")||current.endsWith("/preview/");
    const rankActive=current.includes("ranking");
    const dock=document.createElement("nav");
    dock.className="public-mobile-dock";
    dock.setAttribute("aria-label","Điều hướng nhanh");
    dock.innerHTML=
      '<a class="'+(homeActive?"active":"")+'" href="'+home+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11 12 4l8 7v9h-6v-6h-4v6H4z"/></svg><span>Trang chủ</span></a>'+
      '<a href="'+home+'#live"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v14H4zM8 9h3v6H8zm5 0h3v6h-3z"/></svg><span>Live</span></a>'+
      '<a class="'+(rankActive?"active":"")+'" href="'+ranking+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 18V9h4v9m2 0V5h4v13m2 0v-6h3v6"/></svg><span>Ranking</span></a>'+
      '<a href="'+admin+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5 2 2 3-.5.5 3 2 2-2 2 .5 3-3 .5-2 2-2-2-3 .5-.5-3-2-2 2-2-.5-3 3-.5z"/></svg><span>Quản trị</span></a>';
    document.body.appendChild(dock);
  }

  function buildProgress(){
    if(!document.body.classList.contains("public-body"))return;
    let bar=document.querySelector(".public-scroll-progress");
    if(!bar){bar=document.createElement("div");bar.className="public-scroll-progress";document.body.appendChild(bar)}
    const update=()=>{
      const h=document.documentElement.scrollHeight-innerHeight;
      const p=h>0?Math.min(100,Math.max(0,scrollY/h*100)):0;
      bar.style.setProperty("--progress",p+"%");
    };
    addEventListener("scroll",update,{passive:true});update();
  }

  function routeTransitions(){
    if(reduced)return;
    document.addEventListener("click",e=>{
      const a=e.target.closest("a[href]");
      if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target==="_blank"||a.hasAttribute("download"))return;
      const raw=a.getAttribute("href");
      if(!raw||raw.startsWith("#")||raw.startsWith("mailto:")||raw.startsWith("tel:")||raw.startsWith("javascript:"))return;
      const u=new URL(a.href,location.href);
      if(u.origin!==location.origin)return;
      if(u.pathname===location.pathname&&u.search===location.search&&u.hash){return}
      if("startViewTransition" in document)return;
      e.preventDefault();
      document.body.classList.add("route-leaving");
      setTimeout(()=>location.href=u.href,150);
    });
  }

  function heroParallax(){
    if(reduced||matchMedia("(max-width: 800px)").matches)return;
    const stage=document.querySelector(".hero-media-stage"),img=stage?.querySelector(".hero-sport-visual");
    if(!stage||!img)return;
    stage.addEventListener("pointermove",e=>{
      const r=stage.getBoundingClientRect();
      const x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
      img.style.transform='perspective(1200px) rotateY('+(x*4)+'deg) rotateX('+(-y*3)+'deg) scale(1.012)';
    });
    stage.addEventListener("pointerleave",()=>{img.style.transform=""});
  }

  function scorePop(){
    const obs=new MutationObserver(ms=>ms.forEach(m=>{
      const el=m.target.closest?.("#scoreA,#scoreB")||m.target;
      if(el?.id==="scoreA"||el?.id==="scoreB"){
        el.classList.remove("score-pop");void el.offsetWidth;el.classList.add("score-pop");
      }
    }));
    ["scoreA","scoreB"].forEach(id=>{const e=document.getElementById(id);if(e)obs.observe(e,{childList:true,characterData:true,subtree:true})});
  }

  function watchAdminContent(){
    const content=document.querySelector("#content");
    if(content){
      new MutationObserver(()=>{
        content.classList.remove("page-swap");void content.offsetWidth;content.classList.add("page-swap");
        enhance();buildAdminDock();
      }).observe(content,{childList:true,subtree:false});
    }
    const nav=document.querySelector("#nav");
    if(nav)new MutationObserver(()=>buildAdminDock()).observe(nav,{childList:true,subtree:true});
  }

  function init(){
    document.documentElement.classList.add("motion-ready");
    enhance();buildAdminDock();buildPublicDock();buildProgress();routeTransitions();heroParallax();scorePop();watchAdminContent();
    document.addEventListener("pointerdown",ripple,{passive:true});
    document.querySelectorAll("#nav .nav-btn").forEach(b=>b.addEventListener("click",()=>document.querySelector("#sidebar")?.classList.remove("open")));
  }

  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
})();