(()=>{
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const setWins=(m,side)=>(m.sets||[]).filter(s=>side==="A"?s[0]>s[1]:s[1]>s[0]).length;
  const match=(m,team,{admin=false}={})=>{
    const ready=m.a&&m.b&&m.a!=="TBD"&&m.b!=="TBD";
    const special=m.resultReason?'<small class="bracket-reason">'+esc(m.resultReason.replaceAll("_"," "))+'</small>':"";
    const action=admin&&m.status!=="done"&&ready?'<button class="mini" data-score-match="'+esc(m.id)+'">Nhập điểm</button>':"";
    return '<div class="bracket-match bracket-match-pro" data-bracket-match="'+esc(m.id)+'">'+
      '<div class="bracket-match-meta"><span>'+esc(m.time||"")+'</span><span>Sân '+esc(m.court||"—")+'</span></div>'+
      '<div class="bracket-team '+(m.winner===m.a?"win":"")+'"><span>'+esc(team(m.a))+'</span><b>'+(m.status==="done"?setWins(m,"A"):"")+'</b></div>'+
      '<div class="bracket-team '+(m.winner===m.b?"win":"")+'"><span>'+esc(team(m.b))+'</span><b>'+(m.status==="done"?setWins(m,"B"):"")+'</b></div>'+
      special+action+'</div>';
  };
  const round=(title,matches,team,opts)=>'<div class="round bracket-round-pro"><h3>'+esc(title)+'</h3>'+matches.map(m=>match(m,team,opts)).join("")+'</div>';
  const sortSlot=(a,b)=>(a.bracketSlot||"").localeCompare(b.bracketSlot||"",undefined,{numeric:true});
  function render(matches,team,opts={}){
    const ko=matches.filter(m=>m.bracketSlot);
    if(!ko.length){
      const legacy=matches.filter(m=>/bán kết|chung kết/i.test(m.stage||""));
      if(!legacy.length)return '<div class="empty">Chưa tạo bracket.</div>';
      return '<div class="bracket">'+round("Knockout",legacy,team,opts)+'</div>';
    }
    const isDouble=ko.some(m=>(m.bracketSlot||"").startsWith("DE-"));
    if(isDouble){
      const w=ko.filter(m=>(m.bracketSlot||"").startsWith("DE-W-")).sort(sortSlot);
      const l=ko.filter(m=>(m.bracketSlot||"").startsWith("DE-L-")).sort(sortSlot);
      const gf=ko.filter(m=>(m.bracketSlot||"")==="DE-GF").sort(sortSlot);
      const group=(arr,prefixFn)=>{
        const map=new Map();
        for(const m of arr){const key=prefixFn(m);if(!map.has(key))map.set(key,[]);map.get(key).push(m)}
        return [...map.entries()];
      };
      const wGroups=group(w,m=>{
        const s=m.bracketSlot||"";
        if(s.includes("-QF-"))return"Tứ kết";
        if(s.includes("-SF-"))return"Bán kết";
        if(s.endsWith("-F"))return"Chung kết nhánh thắng";
        return m.stage||"Nhánh thắng";
      });
      const lGroups=group(l,m=>{
        const s=m.bracketSlot||"";
        const x=s.match(/-R(\d+)-/);if(x)return"Vòng "+x[1];
        if(s.includes("-SF"))return"Bán kết nhánh thua";
        if(s.endsWith("-F"))return"Chung kết nhánh thua";
        return m.stage||"Nhánh thua";
      });
      return '<div class="double-bracket-block"><div class="bracket-section-title"><span>WINNERS BRACKET</span><h3>Nhánh thắng</h3></div><div class="bracket">'+wGroups.map(([t,a])=>round(t,a,team,opts)).join("")+'</div>'+
        '<div class="bracket-section-title losers"><span>LOSERS BRACKET</span><h3>Nhánh thua</h3></div><div class="bracket">'+lGroups.map(([t,a])=>round(t,a,team,opts)).join("")+'</div>'+
        '<div class="bracket-section-title final"><span>GRAND FINAL</span><h3>Chung kết tổng</h3></div><div class="bracket grand-final-bracket">'+round("Grand Final",gf,team,opts)+'</div></div>';
    }
    const map=new Map();
    for(const m of ko){
      const n=Number((m.bracketSlot||"").match(/^SE-R(\d+)-/)?.[1]||999);
      if(!map.has(n))map.set(n,[]);map.get(n).push(m);
    }
    const rounds=[...map.entries()].sort((a,b)=>a[0]-b[0]);
    return '<div class="bracket">'+rounds.map(([n,a])=>{
      a.sort(sortSlot);const sample=a[0]?.stage||("Vòng "+n);
      const title=sample.replace(/\s+\d+$/,"");
      return round(title,a,team,opts);
    }).join("")+'</div>';
  }
  function champion(matches,team){
    const final=matches.find(m=>m.bracketSlot==="DE-GF")||
      [...matches.filter(m=>(m.bracketSlot||"").startsWith("SE-"))].sort((a,b)=>(b.bracketSlot||"").localeCompare(a.bracketSlot||"",undefined,{numeric:true}))[0]||
      matches.find(m=>/chung kết/i.test(m.stage||""));
    return final?.winner?team(final.winner):"Chưa xác định";
  }
  window.PickleBracket={render,champion};
})();