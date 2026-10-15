/* Animated reveal of server-authoritative group assignments. No draw randomization runs in this client. */
(function(){
  "use strict";
  const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const groupName=value=>String(value??"").trim().toUpperCase();
  const reducedMotion=()=>Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

  function prepare(payload){
    const assignments=Array.isArray(payload?.assignments)?payload.assignments:[];
    const valid=assignments.filter(entry=>entry&&entry.teamId&&entry.teamName&&/^[A-Z]$/.test(groupName(entry.group)));
    const byGroup=new Map();
    for(const group of Array.isArray(payload?.groups)?payload.groups:[]){
      const key=groupName(group.group);
      if(/^[A-Z]$/.test(key)&&!byGroup.has(key))byGroup.set(key,[]);
    }
    for(const entry of valid){
      const key=groupName(entry.group);
      if(!byGroup.has(key))byGroup.set(key,[]);
      byGroup.get(key).push({id:String(entry.teamId),name:String(entry.teamName)});
    }
    return [...byGroup].sort(([a],[b])=>a.localeCompare(b,"en")).map(([group,teams])=>({group,teams}));
  }

  function wait(milliseconds,signal,shouldSkip,register){
    if(signal?.aborted||shouldSkip())return Promise.resolve();
    return new Promise(resolve=>{
      const timeout=setTimeout(finish,milliseconds);
      function finish(){clearTimeout(timeout);signal?.removeEventListener("abort",finish);resolve()}
      signal?.addEventListener("abort",finish,{once:true});
      register(finish);
    });
  }

  async function play(host,payload,{compact=false,signal}={}){
    if(!host)return {cancelled:true};
    const groups=prepare(payload);
    const total=groups.reduce((sum,g)=>sum+g.teams.length,0);
    if(!total)return {unavailable:true};
    let skipped=reducedMotion(),count=0,releaseWait=()=>{};
    const stepDelay=Math.max(185,Math.min(compact?400:520,Math.floor((compact?7200:8500)/total)));
    const content=groups.map(({group,teams})=>
      '<section class="draw-reveal-group" data-reveal-group="'+group+'" aria-label="Bảng '+group+'">'+
        '<header><span class="draw-reveal-group-letter">'+group+'</span><div><b>BẢNG '+group+'</b><small data-reveal-count="'+group+'">0/'+teams.length+' cặp</small></div><span class="draw-reveal-indicator" aria-hidden="true">○</span></header>'+
        '<div class="draw-reveal-rows" data-reveal-rows="'+group+'"></div>'+
      '</section>').join("");
    host.innerHTML='<div class="draw-reveal-stage'+(compact?" compact":"")+'">'+
      '<div class="draw-reveal-kicker"><i></i> BỐC THĂM CHIA BẢNG · TRỰC TIẾP</div>'+
      '<h2>Đang công bố bảng <span data-reveal-current>A</span></h2>'+
      '<p class="draw-reveal-sub">Từng cặp được xướng tên, hoàn tất bảng này mới chuyển bảng tiếp theo</p>'+
      '<div class="draw-reveal-progress"><span data-reveal-progress></span></div>'+
      '<div class="draw-reveal-stats"><strong data-reveal-status role="status" aria-live="polite">Chuẩn bị công bố kết quả</strong><span data-reveal-total>0/'+total+' cặp</span></div>'+
      '<div class="draw-reveal-groups">'+content+'</div>'+
      '<div class="draw-reveal-footer"><span data-reveal-footer>Vui lòng theo dõi kết quả bốc thăm</span><button type="button" class="draw-reveal-skip" data-reveal-skip>Bỏ qua hiệu ứng »</button></div>'+
    '</div>';
    const scene=host.querySelector(".draw-reveal-stage");
    const skipButton=host.querySelector("[data-reveal-skip]");
    skipButton.addEventListener("click",()=>{skipped=true;releaseWait()});
    if(skipped)skipButton.hidden=true;
    const panels=new Map(groups.map(g=>[g.group,host.querySelector('[data-reveal-group="'+g.group+'"]')]));
    const status=host.querySelector("[data-reveal-status]");
    const footer=host.querySelector("[data-reveal-footer]");
    for(const group of groups){
      if(signal?.aborted||!host.isConnected)return {cancelled:true};
      const panel=panels.get(group.group);
      panel.classList.add("is-active");
      if(!skipped)panel.scrollIntoView?.({block:"nearest",behavior:"smooth"});
      host.querySelector("[data-reveal-current]").textContent=group.group;
      status.textContent="Bảng "+group.group+" đang bốc thăm";
      footer.textContent="Đang đưa các cặp vào bảng "+group.group;
      if(count&&!skipped)await wait(220,signal,()=>skipped,fn=>{releaseWait=fn});
      const rows=panel.querySelector(".draw-reveal-rows");
      for(let i=0;i<group.teams.length;i++){
        if(signal?.aborted||!host.isConnected)return {cancelled:true};
        const team=group.teams[i];
        const row=document.createElement("div");
        row.className="draw-reveal-team"+(skipped?" is-instant":"");
        row.dataset.teamId=team.id;
        row.innerHTML='<span class="draw-reveal-index">'+String(i+1).padStart(2,"0")+'</span><strong>'+escapeHtml(team.name)+'</strong><span class="draw-reveal-check" aria-hidden="true">✓</span>';
        rows.appendChild(row);
        count++;
        status.textContent="Bảng "+group.group+" · Cặp "+(i+1)+"/"+group.teams.length+": "+team.name;
        panel.querySelector("[data-reveal-count]").textContent=(i+1)+"/"+group.teams.length+" cặp";
        host.querySelector("[data-reveal-total]").textContent=count+"/"+total+" cặp";
        host.querySelector("[data-reveal-progress]").style.width=(count/total*100)+"%";
        if(!skipped)await wait(stepDelay,signal,()=>skipped,fn=>{releaseWait=fn});
      }
      panel.classList.remove("is-active");
      panel.classList.add("is-complete");
      panel.querySelector(".draw-reveal-indicator").textContent="✓";
    }
    if(signal?.aborted||!host.isConnected)return {cancelled:true};
    scene.classList.add("is-complete");
    host.querySelector("[data-reveal-current]").textContent="HOÀN TẤT";
    scene.querySelector("h2").textContent="Đã chia xong "+groups.length+" bảng!";
    status.textContent="Đã công bố "+total+" cặp/đội chính xác theo kết quả hệ thống";
    footer.textContent="Kết quả bốc thăm đã được lưu và đồng bộ";
    skipButton.hidden=true;
    return {total,groups:groups.length,skipped};
  }
  window.PickleDrawReveal={play,prepare};
})();
