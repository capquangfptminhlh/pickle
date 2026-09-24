(()=> {
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const enhance=()=>{
    $$(".kpi,.panel,.tour-card,.public-match,.public-standings,.public-bracket-card,.match-card").forEach((el,i)=>{
      if(el.dataset.motionReady)return;
      el.dataset.motionReady="1";
      el.classList.add("reveal-target");
      el.style.animationDelay=Math.min(i*28,220)+"ms";
      observer.observe(el);
    });
  };
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add("is-visible");observer.unobserve(e.target)}});
  },{threshold:.06,rootMargin:"0px 0px -20px"});
  const addRipple=e=>{
    const btn=e.target.closest(".btn,.mini,.icon-btn,.score-control button");
    if(!btn)return;
    const r=btn.getBoundingClientRect(),s=document.createElement("span");s.className="ripple";
    s.style.left=(e.clientX-r.left)+"px";s.style.top=(e.clientY-r.top)+"px";btn.appendChild(s);setTimeout(()=>s.remove(),650);
  };
  const buildDock=()=>{
    if(!document.querySelector("#nav"))return;
    let dock=document.querySelector(".mobile-dock");
    if(!dock){dock=document.createElement("div");dock.className="mobile-dock";document.body.appendChild(dock)}
    const wanted=["dashboard","matches","scores","bracket"];
    dock.innerHTML=wanted.map(id=>{
      const src=document.querySelector(`[data-page="${id}"]`);if(!src)return"";
      const ico=src.querySelector(".ico")?.textContent||"•",label=src.textContent.replace(ico,"").trim();
      return `<button data-dock-page="${id}" class="${src.classList.contains("active")?"active":""}"><span>${ico}</span>${label}</button>`;
    }).join("");
    $$("[data-dock-page]",dock).forEach(b=>b.onclick=()=>document.querySelector(`[data-page="${b.dataset.dockPage}"]`)?.click());
  };
  document.addEventListener("pointerdown",addRipple,{passive:true});
  const scoreObs=new MutationObserver(ms=>ms.forEach(m=>{
    const el=m.target;if(el.id==="scoreA"||el.id==="scoreB"){el.classList.remove("score-pop");void el.offsetWidth;el.classList.add("score-pop")}
  }));
  const contentObs=new MutationObserver(()=>{const c=document.querySelector("#content");if(c){c.classList.remove("page-swap");void c.offsetWidth;c.classList.add("page-swap")}enhance();buildDock()});
  const init=()=>{
    enhance();buildDock();
    ["scoreA","scoreB"].forEach(id=>{const e=document.getElementById(id);if(e)scoreObs.observe(e,{childList:true,characterData:true,subtree:true})});
    const c=document.querySelector("#content");if(c)contentObs.observe(c,{childList:true,subtree:false});
    const n=document.querySelector("#nav");if(n)contentObs.observe(n,{childList:true,subtree:false});
  };
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
})();