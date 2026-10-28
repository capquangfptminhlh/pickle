/* Progressive, client-only discovery for tournament cards. Existing API renders results. */
(()=>{
  "use strict";
  const root=document.getElementById("publicTours");
  const input=document.getElementById("eventSearch");
  const bar=document.getElementById("eventFilters");
  const count=document.getElementById("eventResultCount");
  const empty=document.getElementById("eventFilterEmpty");
  if(!root||!input||!bar||!count||!empty)return;
  let status="all";
  const normalize=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").toLocaleLowerCase("vi").trim();
  const statusMatches=(value,filter)=>{
    if(filter==="all")return true;
    if(filter==="open")return ["open","registration","upcoming"].includes(value);
    if(filter==="live")return ["live","ongoing"].includes(value);
    if(filter==="done")return ["done","completed"].includes(value);
    return false;
  };
  const apply=()=>{
    const cards=[...root.querySelectorAll(".tour-card")],query=normalize(input.value);
    let visible=0;
    for(const card of cards){
      const show=statusMatches(card.dataset.tourStatus||"",status)&&normalize(card.textContent).includes(query);
      card.hidden=!show;
      if(show)visible++;
    }
    count.textContent=visible+"/"+cards.length+" giải phù hợp";
    empty.hidden=visible!==0||cards.length===0;
  };
  input.addEventListener("input",apply);
  bar.addEventListener("click",event=>{
    const button=event.target.closest("button[data-filter]");
    if(!button||!bar.contains(button))return;
    status=button.dataset.filter;
    for(const item of bar.querySelectorAll("button[data-filter]")){
      const selected=item===button;
      item.setAttribute("aria-pressed",String(selected));
      item.classList.toggle("is-selected",selected);
    }
    apply();
  });
  // The public application replaces cards asynchronously after API refresh.
  new MutationObserver(apply).observe(root,{childList:true});
  apply();
})();
