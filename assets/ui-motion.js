(()=>{
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isPreview=location.pathname.includes("/preview/");
  const local=p=>p.replace(/^\//,"");
  const entranceSelector=[
    ".kpi",".panel",".tour-card",".public-match",".public-standings",
    ".public-bracket-card",".match-card",".top-player-card",".news-card",
    ".sponsor-card",".club-card",".booking-card",".metric-card",".card",
    ".hero-media-stage",".ranking-hero-grid>img",".player-avatar-wrap",
    ".table tbody tr","[role='row']","dialog",".modal","[role='dialog']",
    ".toast","[role='status']"
  ].join(",");
  const observers=new Set(),ripples=new Set(),entranceIds=new WeakMap();
  let nextEntranceId=0,dynamicFrame=0,routeTimer=0;
  const track=observer=>(observers.add(observer),observer);
  const entranceId=element=>{
    if(!entranceIds.has(element))entranceIds.set(element,++nextEntranceId);
    return entranceIds.get(element);
  };
  const outermost=elements=>{
    const unique=[...new Set(elements)];
    return unique.filter(element=>!unique.some(ancestor=>ancestor!==element&&ancestor.contains(element)));
  };
  const nearViewport=element=>{
    if(!element.getClientRects().length)return false;
    const rect=element.getBoundingClientRect(),margin=24;
    return rect.bottom>=-margin&&rect.top<=innerHeight+margin&&rect.right>=-margin&&rect.left<=innerWidth+margin;
  };
  const showFinal=elements=>elements.forEach(element=>{
    element.classList.remove("reveal-target","is-visible");
    Object.assign(element.style,{opacity:"1",visibility:"visible",transform:"none",filter:"none"});
  });
  const enter=elements=>{
    const candidates=elements.filter(element=>element.dataset.motionEntered!=="1");
    const targets=outermost(candidates),selected=new Set(targets);
    candidates.forEach(element=>{if(!selected.has(element))element.dataset.motionEntered="1"});
    if(!targets.length)return;
    targets.forEach(element=>element.dataset.motionEntered="1");
    const motion=window.PickleMotion;
    if(reduced||!motion?.entrance){showFinal(targets);return}
    motion.entrance(targets,{key:"ui-entrance:"+targets.map(entranceId).join("-"),stagger:.055,y:28});
  };
  const observer=track(new IntersectionObserver(entries=>{
    const visible=entries.filter(entry=>entry.isIntersecting).map(entry=>entry.target);
    if(!visible.length)return;
    const groups=new Map();
    visible.forEach(element=>{
      observer.unobserve(element);
      const parent=element.parentElement||document.body;
      if(!groups.has(parent))groups.set(parent,[]);
      groups.get(parent).push(element);
    });
    groups.forEach((elements,parent)=>{
      const siblings=[...parent.children].filter(element=>element.matches(entranceSelector)&&element.dataset.motionReady==="1"&&element.dataset.motionEntered!=="1"&&nearViewport(element));
      const targets=outermost([...elements,...siblings]);
      targets.forEach(element=>observer.unobserve(element));
      targets.sort((a,b)=>a===b?0:a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
      enter(targets);
    });
  },{threshold:.055,rootMargin:"0px 0px -24px"}));

  function decorateTables(){
    document.querySelectorAll(".table").forEach(table=>{
      const labels=[...table.querySelectorAll("thead th")].map(th=>th.textContent.trim());
      table.querySelectorAll("tbody tr").forEach(row=>{
        [...row.children].forEach((cell,i)=>{
          if(!cell.dataset.label)cell.dataset.label=labels[i]||"";
        });
      });
    });
  }

  function enhance(root=document){
    const elements=[];
    if(root instanceof Element&&root.matches(entranceSelector))elements.push(root);
    if(root.querySelectorAll)elements.push(...root.querySelectorAll(entranceSelector));
    const fresh=elements.filter(element=>!element.dataset.motionReady);
    const targets=outermost(fresh),selected=new Set(targets);
    fresh.forEach(el=>{
      el.dataset.motionReady="1";
      if(!selected.has(el)){el.dataset.motionEntered="1";return}
      if(reduced||!window.PickleMotion?.entrance){enter([el]);return}
      observer.observe(el);
    });
  }

  function scheduleEnhance(node){
    if(!(node instanceof Element)||node.classList.contains("motion-ripple"))return;
    if(!scheduleEnhance.nodes)scheduleEnhance.nodes=new Set();
    scheduleEnhance.nodes.add(node);
    if(dynamicFrame)return;
    dynamicFrame=requestAnimationFrame(()=>{
      dynamicFrame=0;
      const nodes=[...scheduleEnhance.nodes];scheduleEnhance.nodes.clear();
      const pending=new Set(),groups=new Map();
      decorateTables();
      nodes.forEach(element=>{
        enhance(element);
        if(element.matches(entranceSelector))pending.add(element);
        element.querySelectorAll(entranceSelector).forEach(target=>pending.add(target));
      });
      pending.forEach(target=>{
        if(target.dataset.motionReady!=="1"||target.dataset.motionEntered==="1")return;
        if(!nearViewport(target))return;
        const parent=target.parentElement||document.body;
        if(!groups.has(parent))groups.set(parent,[]);
        groups.get(parent).push(target);
      });
      groups.forEach(targets=>{
        targets.forEach(target=>observer.unobserve(target));
        targets.sort((a,b)=>a===b?0:a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
        enter(targets);
      });
    });
  }

  function buildBackdrop(){
    if(!document.querySelector("#sidebar"))return;
    let backdrop=document.querySelector(".app-backdrop");
    if(!backdrop){
      backdrop=document.createElement("div");
      backdrop.className="app-backdrop";
      document.body.appendChild(backdrop);
      backdrop.onclick=()=>closeDrawer();
    }
    const sidebar=document.querySelector("#sidebar");
    const sync=()=>{
      const open=sidebar?.classList.contains("open");
      backdrop.classList.toggle("show",!!open);
      document.body.classList.toggle("app-drawer-open",!!open);
    };
    const sidebarObserver=track(new MutationObserver(sync));
    sidebarObserver.observe(sidebar,{attributes:true,attributeFilter:["class"]});
    sync();
  }

  function closeDrawer(){
    document.querySelector("#sidebar")?.classList.remove("open");
    document.querySelector(".app-backdrop")?.classList.remove("show");
    document.body.classList.remove("app-drawer-open");
  }

  function buildFab(){
    if(!document.querySelector("#nav"))return;
    let fab=document.querySelector(".app-fab");
    let label=document.querySelector(".app-fab-label");
    if(!fab){
      fab=document.createElement("button");
      fab.type="button";fab.className="app-fab";fab.setAttribute("aria-label","Tạo nhanh");fab.textContent="+";
      document.body.appendChild(fab);
    }
    if(!label){
      label=document.createElement("div");label.className="app-fab-label";label.textContent="Tạo nhanh";document.body.appendChild(label);
    }
    const current=document.querySelector("#nav .nav-btn.active")?.dataset.page||"dashboard";
    const map={
      dashboard:["Tạo giải",()=>document.querySelector("#quickTournament")?.click()],
      tournaments:["Tạo giải",()=>document.querySelector('[data-action="newTournament"]')?.click()],
      players:["Thêm VĐV",()=>document.querySelector('[data-action="newPlayer"]')?.click()],
      matches:["Tạo trận",()=>document.querySelector('[data-action="newMatch"]')?.click()],
      scores:["Nhập điểm",()=>document.querySelector("[data-score-match]")?.click()],
      courts:["Thêm sân",()=>document.querySelector('[data-action="newCourt"]')?.click()],
      referees:["Thêm trọng tài",()=>document.querySelector('[data-action="newReferee"]')?.click()]
    };
    const action=map[current]||null;
    const show=!!action&&current!=="dashboard"&&current!=="scores";
    fab.hidden=!show;label.hidden=!show;
    if(!action)return;
    label.textContent=action[0];
    fab.onclick=()=>{if(navigator.vibrate)navigator.vibrate(8);action[1]()};
  }

  function buildAdminDock(){
    if(!document.querySelector("#nav"))return;
    let dock=document.querySelector(".mobile-dock");
    if(!dock){dock=document.createElement("div");dock.className="mobile-dock";document.body.appendChild(dock)}
    const icon={
      dashboard:"<path d='M4 11 12 4l8 7v9h-6v-6h-4v6H4z'/>",
      club_events:"<path d='M4 5h16v15H4zM8 3v4M16 3v4M4 9h16M8 13h3M13 13h3'/>",
      club_attendance:"<path d='M4 5h16v14H4zM8 3v4M16 3v4M8 12l2.5 2.5L16 9'/>",
      treasury:"<path d='M3 6h18v12H3zM3 9h18M7 14h4'/>",
      matches:"<path d='M4 5h16v15H4zM8 3v4M16 3v4M4 9h16M8 13h3M13 13h3'/>",
      scores:"<path d='M4 5h16v14H4zM8 9h3v6H8zm5 0h3v6h-3z'/>",
      players:"<path d='M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-4 2.7-6 6-6s6 2 6 6H2Z'/>",
      tournaments:"<path d='M8 3h8v5a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v6m-4 2h8'/>",
      clubs:"<path d='M3 20h18M5 20V8l7-4 7 4v12M9 12h2M13 12h2M9 16h6'/>",
      payments:"<path d='M3 6h18v12H3zM3 9h18M7 14h4'/>",
      reports:"<path d='M4 20V10h4v10m2 0V4h4v16m2 0v-7h4v7'/>",
      standings:"<path d='M5 6h14M5 12h14M5 18h14'/>",
      more:"<circle cx='5' cy='12' r='1.5'/><circle cx='12' cy='12' r='1.5'/><circle cx='19' cy='12' r='1.5'/>"
    };
    const labels={dashboard:"Trang chủ",tournaments:"Giải đấu",club_events:"Lịch CLB",club_attendance:"Điểm danh",treasury:"Thu chi",matches:"Lịch đấu",scores:"Điểm",players:"VĐV",clubs:"CLB",payments:"Phí giải",reports:"Báo cáo",standings:"BXH"};
    const available=[...document.querySelectorAll("#nav .nav-btn")].map(x=>x.dataset.page);
    const preference=available.includes("tournaments")?["dashboard","tournaments","players","scores"]:["dashboard","club_events","players","club_attendance","treasury","matches","scores","clubs","payments","reports","standings"];
    const primary=preference.filter(id=>available.includes(id)).slice(0,4);
    const hasMore=available.some(id=>!primary.includes(id));
    const items=[...primary,...(hasMore?["more"]:[])];
    const active=document.querySelector("#nav .nav-btn.active")?.dataset.page||"dashboard";
    dock.innerHTML=items.map(id=>{
      const isActive=id==="more"?!primary.includes(active):active===id;
      return '<button data-dock-page="'+id+'" class="'+(isActive?"active":"")+'"><span class="ico-clone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">'+icon[id]+'</svg></span><small>'+(labels[id]||"Khác")+'</small></button>';
    }).join("");
    $$(".mobile-dock [data-dock-page]",dock).forEach(b=>b.onclick=()=>{
      if(navigator.vibrate)navigator.vibrate(6);
      if(b.dataset.dockPage==="more"){
        document.querySelector("#sidebar")?.classList.add("open");
        document.querySelector(".app-backdrop")?.classList.add("show");
        document.body.classList.add("app-drawer-open");
        return;
      }
      document.querySelector('[data-page="'+b.dataset.dockPage+'"]')?.click();
      closeDrawer();
    });
  }

  function buildPublicDock(){
    if(!document.body.classList.contains("public-body"))return;
    if(document.querySelector(".public-mobile-dock"))return;
    const isPreview=location.pathname.startsWith("/preview/");
    const home=isPreview?"index.html":"/";
    const ranking=isPreview?"ranking.html":"/ranking.html";
    const admin="login.html";
    const dock=document.createElement("nav");
    dock.className="public-mobile-dock";
    dock.setAttribute("aria-label","Điều hướng nhanh");
    dock.innerHTML=
      '<a data-public-tab="home" href="'+home+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11 12 4l8 7v9h-6v-6h-4v6H4z"/></svg><span>Trang chủ</span></a>'+
      '<a data-public-tab="events" href="'+home+'#tournaments"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 4h8v3a4 4 0 0 1-8 0V4ZM5 5h3v2a4 4 0 0 1-3-2Zm11 0h3a4 4 0 0 1-3 2V5ZM12 11v5m-4 4h8"/></svg><span>Giải</span></a>'+
      '<a data-public-tab="live" href="'+home+'#live"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M5.5 5.5a9 9 0 0 0 0 13m13-13a9 9 0 0 1 0 13"/></svg><span>Live</span></a>'+
      '<a data-public-tab="ranking" href="'+ranking+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 18V9h4v9m2 0V5h4v13m2 0v-6h3v6"/></svg><span>BXH</span></a>'+
      '<a data-public-tab="community" href="'+home+'#news"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v12H8l-4 3V5Z"/><path d="M8 9h8M8 13h5"/></svg><span>Cộng đồng</span></a>';
    document.body.appendChild(dock);
    const sync=()=>{
      const path=location.pathname,hash=location.hash;
      $$(".public-mobile-dock a",dock).forEach(a=>a.classList.remove("active"));
      let key="home";
      if(path.includes("ranking")||path.includes("player"))key="ranking";
      else if(hash==="#news")key="community";
      else if(path.includes("tournament")||hash==="#tournaments"||hash==="#bracket")key="events";
      else if(hash==="#live")key="live";
      dock.querySelector('[data-public-tab="'+key+'"]')?.classList.add("active");
    };
    dock.addEventListener("click",e=>{if(e.target.closest("a"))setTimeout(sync,0)});
    addEventListener("hashchange",sync);sync();
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

  function syncPublicHeader(){
    const header=document.querySelector(".public-header");
    if(!header)return;
    const measure=()=>document.documentElement.style.setProperty("--public-header-height",Math.ceil(header.getBoundingClientRect().height)+"px");
    measure();
    if("ResizeObserver" in window){const resize=track(new ResizeObserver(measure));resize.observe(header)}
    else addEventListener("resize",measure,{passive:true});
    const path=p=>p.replace(/\/index\.html$/,"/");
    const links=$$(".public-nav nav a",header);
    const parentLink=links.find(a=>a.hasAttribute("aria-current"));
    const parentCurrent=parentLink?.getAttribute("aria-current");
    const sync=()=>{
      const samePage=links.filter(a=>{const u=new URL(a.href);return u.origin===location.origin&&path(u.pathname)===path(location.pathname)&&u.search===location.search});
      const current=samePage.find(a=>new URL(a.href).hash===location.hash)||samePage.find(a=>!new URL(a.href).hash)||parentLink||(!location.hash?samePage.find(a=>new URL(a.href).hash):null);
      links.forEach(a=>{
        if(a===current)a.setAttribute("aria-current",a===parentLink?parentCurrent:new URL(a.href).hash?"location":"page");
        else a.removeAttribute("aria-current");
      });
    };
    addEventListener("hashchange",sync);addEventListener("pageshow",sync);sync();
  }

  function routeTransitions(){
    if(reduced)return;
    document.addEventListener("click",e=>{
      const a=e.target.closest("a[href]");
      if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||String(a.target).toLowerCase()==="_blank"||a.hasAttribute("download"))return;
      const raw=a.getAttribute("href");
      if(!raw||raw.startsWith("#")||raw.startsWith("mailto:")||raw.startsWith("tel:")||raw.startsWith("javascript:"))return;
      const u=new URL(a.href,location.href);
      if(u.origin!==location.origin)return;
      if(u.pathname===location.pathname&&u.search===location.search)return;
      if(typeof document.startViewTransition==="function")return;
      e.preventDefault();
      if(document.body.classList.contains("motion-route-leaving"))return;
      let navigated=false;
      const navigate=()=>{
        if(navigated)return;
        navigated=true;
        clearTimeout(routeTimer);routeTimer=0;
        location.assign(u.href);
      };
      document.body.classList.add("route-leaving","motion-route-leaving");
      routeTimer=setTimeout(navigate,180);
      const motion=window.PickleMotion;
      if(!motion?.keyed)return;
      motion.keyed("route",timeline=>timeline.to(document.body,{opacity:0,duration:.12,ease:"power1.in",overwrite:"auto"}),navigate);
    });
  }

  function pressFeedback(event){
    const control=event.target.closest?.("button,[role='button'],input[type='button'],input[type='submit'],input[type='reset'],.btn");
    if(!control||control.disabled||control.getAttribute("aria-disabled")==="true"||reduced)return;
    window.PickleMotion?.press?.(control);
    const rect=control.getBoundingClientRect(),size=Math.max(rect.width,rect.height)*1.35;
    const x=Number.isFinite(event.clientX)?event.clientX:rect.left+rect.width/2;
    const y=Number.isFinite(event.clientY)?event.clientY:rect.top+rect.height/2;
    const ripple=document.createElement("span");
    ripple.className="motion-ripple";
    ripple.setAttribute("aria-hidden","true");
    Object.assign(ripple.style,{position:"fixed",inset:"auto",left:x+"px",top:y+"px",width:size+"px",height:size+"px",zIndex:"9999",willChange:"transform,opacity"});
    document.body.appendChild(ripple);ripples.add(ripple);
    const remove=()=>{ripples.delete(ripple);ripple.remove()};
    const animation=ripple.animate([
      {opacity:.34,transform:"translate(-50%, -50%) scale(.08)"},
      {opacity:0,transform:"translate(-50%, -50%) scale(1)"}
    ],{duration:380,easing:"cubic-bezier(.2,.8,.2,1)",fill:"forwards"});
    animation.addEventListener("finish",remove,{once:true});
    animation.addEventListener("cancel",remove,{once:true});
  }

  function syncTournamentNavigation(){
    const nav=document.querySelector(".tournament-tabs");
    if(!nav)return;
    const links=$$("a[href^='#']",nav);
    const sync=()=>{
      const current=links.find(a=>a.hash===location.hash)||links[0];
      links.forEach(a=>{
        const active=a===current;a.classList.toggle("active",active);
        if(active)a.setAttribute("aria-current","location");else a.removeAttribute("aria-current");
      });
    };
    addEventListener("hashchange",sync);addEventListener("pageshow",sync);sync();
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
    const obs=track(new MutationObserver(ms=>ms.forEach(m=>{
      const el=m.target.closest?.("#scoreA,#scoreB")||m.target;
      if(el?.id==="scoreA"||el?.id==="scoreB"){
        el.classList.remove("score-pop");void el.offsetWidth;el.classList.add("score-pop");
      }
    })));
    ["scoreA","scoreB"].forEach(id=>{const e=document.getElementById(id);if(e)obs.observe(e,{childList:true,characterData:true,subtree:true})});
  }

  function watchAdminContent(){
    const content=document.querySelector("#content");
    if(content){
      const contentObserver=track(new MutationObserver(()=>{
        content.classList.remove("page-swap");void content.offsetWidth;content.classList.add("page-swap");
        decorateTables();enhance();buildAdminDock();buildFab();
      }));
      contentObserver.observe(content,{childList:true,subtree:false});
    }
    const nav=document.querySelector("#nav");
    if(nav){const navObserver=track(new MutationObserver(()=>{buildAdminDock();buildFab()}));navObserver.observe(nav,{childList:true,subtree:true})}
  }

  function normalizeProjectLinks(){
    if(!location.hostname.endsWith(".github.io"))return;
    const parts=location.pathname.split("/").filter(Boolean);
    const project=parts[0]||"pickle";
    const base="/"+project+"/";
    document.querySelectorAll('a[href^="/"]').forEach(a=>{
      const raw=a.getAttribute("href");
      if(!raw||raw.startsWith("//")||raw.startsWith(base))return;
      a.setAttribute("href",base+raw.replace(/^\/+/, ""));
    });
  }

  function enforcePublicScrollSafety(){
    if(!document.body.classList.contains("public-body"))return;
    document.body.classList.remove("app-drawer-open","route-leaving","motion-route-leaving");
    document.documentElement.style.height="auto";
    document.documentElement.style.minHeight="100%";
    document.documentElement.style.overflowX="hidden";
    document.documentElement.style.overflowY="auto";
    document.body.style.position="static";
    document.body.style.height="auto";
    document.body.style.minHeight="100vh";
    document.body.style.maxHeight="none";
    document.body.style.overflowX="clip";
    document.body.style.overflowY="visible";
    document.body.style.touchAction="pan-y";
  }

  function init(){
    document.documentElement.classList.add("motion-ready");
    if(!("startViewTransition" in document))document.documentElement.classList.add("no-view-transition");
    if(!reduced&&!("startViewTransition" in document))document.body.classList.add("route-entering");
    if(matchMedia("(max-width:760px)").matches)closeDrawer();
    enforcePublicScrollSafety();normalizeProjectLinks();syncPublicHeader();syncTournamentNavigation();decorateTables();enhance();buildBackdrop();buildAdminDock();buildFab();buildPublicDock();buildProgress();routeTransitions();heroParallax();scorePop();watchAdminContent();
    const contentObserver=track(new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(scheduleEnhance))));
    contentObserver.observe(document.body,{childList:true,subtree:true});
    const finishEntry=e=>{if(e.target===document.body&&e.animationName==="routeEnterFallback")document.body.classList.remove("route-entering")};
    document.body.addEventListener("animationend",finishEntry);document.body.addEventListener("animationcancel",finishEntry);
    document.querySelectorAll("#nav .nav-btn").forEach(b=>b.addEventListener("click",()=>closeDrawer()));
    document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDrawer()});
    document.addEventListener("pointerdown",pressFeedback,{passive:true});
    const resetRoute=()=>{
      clearTimeout(routeTimer);routeTimer=0;
      document.body.classList.remove("route-leaving","motion-route-leaving");
      document.body.style.opacity="";
    };
    addEventListener("pageshow",e=>{resetRoute();if(e.persisted)document.body.classList.remove("route-entering");enforcePublicScrollSafety()});
    addEventListener("pagehide",e=>{
      resetRoute();
      ripples.forEach(ripple=>{ripple.getAnimations().forEach(animation=>animation.cancel());ripple.remove()});ripples.clear();
      if(!e.persisted){observers.forEach(item=>item.disconnect());observers.clear();if(dynamicFrame)cancelAnimationFrame(dynamicFrame);scheduleEnhance.nodes?.clear()}
    });
    addEventListener("focus",enforcePublicScrollSafety);document.addEventListener("visibilitychange",()=>{if(!document.hidden)enforcePublicScrollSafety()});
    document.addEventListener("click",e=>{
      const score=e.target.closest("[data-score]");
      if(score&&navigator.vibrate)navigator.vibrate(score.dataset.delta==="1"?7:4);
    });
  }

  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
})();
