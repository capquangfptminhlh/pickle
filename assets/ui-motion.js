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

  function enhance(){
    const selectors=[
      ".kpi",".panel",".tour-card",".public-match",".public-standings",
      ".public-bracket-card",".match-card",".top-player-card",".news-card",
      ".sponsor-card",".club-card",".booking-card",".metric-card",
      ".hero-media-stage",".ranking-hero-grid>img",".player-avatar-wrap"
    ].join(",");
    const mobile=matchMedia("(max-width:760px)").matches;
    $$(selectors).forEach((el,i)=>{
      if(el.dataset.motionReady)return;
      el.dataset.motionReady="1";
      if(mobile){
        el.style.opacity="1";
        el.style.transform="none";
        return;
      }
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
    new MutationObserver(sync).observe(sidebar,{attributes:true,attributeFilter:["class"]});
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
      clubs:"<path d='M3 20h18M5 20V8l7-4 7 4v12M9 12h2M13 12h2M9 16h6'/>",
      payments:"<path d='M3 6h18v12H3zM3 9h18M7 14h4'/>",
      reports:"<path d='M4 20V10h4v10m2 0V4h4v16m2 0v-7h4v7'/>",
      standings:"<path d='M5 6h14M5 12h14M5 18h14'/>",
      more:"<circle cx='5' cy='12' r='1.5'/><circle cx='12' cy='12' r='1.5'/><circle cx='19' cy='12' r='1.5'/>"
    };
    const labels={dashboard:"Trang chủ",club_events:"Lịch CLB",club_attendance:"Điểm danh",treasury:"Thu chi",matches:"Lịch đấu",scores:"Điểm",players:"Thành viên",clubs:"CLB",payments:"Phí giải",reports:"Báo cáo",standings:"BXH"};
    const available=[...document.querySelectorAll("#nav .nav-btn")].map(x=>x.dataset.page);
    const preference=["dashboard","club_events","players","club_attendance","treasury","matches","scores","clubs","payments","reports","standings"];
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
    const home=isPreview?"index.html":"/";
    const ranking=isPreview?"ranking.html":"/ranking.html";
    const admin=isPreview?"login.html":"/login";
    const current=location.pathname;
    const homeActive=current.endsWith("/")||current.endsWith("/index.html")||current.endsWith("/preview/");
    const rankActive=current.includes("ranking");
    const dock=document.createElement("nav");
    dock.className="public-mobile-dock";
    dock.setAttribute("aria-label","Điều hướng nhanh");
    dock.innerHTML=
      '<a class="'+(homeActive?"active":"")+'" href="'+home+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11 12 4l8 7v9h-6v-6h-4v6H4z"/></svg><span>Home</span></a>'+
      '<a href="'+home+'#tournaments"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 4h8v3a4 4 0 0 1-8 0V4ZM5 5h3v2a4 4 0 0 1-3-2Zm11 0h3a4 4 0 0 1-3 2V5ZM12 11v5m-4 4h8"/></svg><span>Giải</span></a>'+
      '<a href="'+home+'#live"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M5.5 5.5a9 9 0 0 0 0 13m13-13a9 9 0 0 1 0 13"/></svg><span>Live</span></a>'+
      '<a class="'+(rankActive?"active":"")+'" href="'+ranking+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 18V9h4v9m2 0V5h4v13m2 0v-6h3v6"/></svg><span>Ranking</span></a>'+
      '<a href="'+admin+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5 2 2 3-.5.5 3 2 2-2 2 .5 3-3 .5-2 2-2-2-3 .5-.5-3-2-2 2-2-.5-3 3-.5z"/></svg><span>Đăng nhập</span></a>';
    document.body.appendChild(dock);
    const syncPublicDock=()=>{
      const hash=location.hash;
      const path=location.pathname;
      $$(".public-mobile-dock a",dock).forEach(a=>a.classList.remove("active"));
      if(path.includes("ranking"))dock.querySelector('a[href*="ranking"]')?.classList.add("active");
      else if(hash==="#live")dock.querySelector('a[href$="#live"]')?.classList.add("active");
      else if(hash==="#tournaments")dock.querySelector('a[href$="#tournaments"]')?.classList.add("active");
      else dock.querySelector("a")?.classList.add("active");
    };
    dock.addEventListener("click",e=>{if(e.target.closest("a"))setTimeout(syncPublicDock,0)});
    addEventListener("hashchange",syncPublicDock);
    syncPublicDock();
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
        decorateTables();enhance();buildAdminDock();buildFab();
      }).observe(content,{childList:true,subtree:false});
    }
    const nav=document.querySelector("#nav");
    if(nav)new MutationObserver(()=>{buildAdminDock();buildFab()}).observe(nav,{childList:true,subtree:true});
  }

  function init(){
    document.documentElement.classList.add("motion-ready");
    if(!reduced&&!("startViewTransition" in document))document.body.classList.add("route-entering");
    if(matchMedia("(max-width:760px)").matches)closeDrawer();
    decorateTables();enhance();buildBackdrop();buildAdminDock();buildFab();buildPublicDock();buildProgress();routeTransitions();heroParallax();scorePop();watchAdminContent();
    document.addEventListener("pointerdown",ripple,{passive:true});
    document.querySelectorAll("#nav .nav-btn").forEach(b=>b.addEventListener("click",()=>closeDrawer()));
    document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDrawer()});
    document.addEventListener("click",e=>{
      const score=e.target.closest("[data-score]");
      if(score&&navigator.vibrate)navigator.vibrate(score.dataset.delta==="1"?7:4);
    });
  }

  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
})();