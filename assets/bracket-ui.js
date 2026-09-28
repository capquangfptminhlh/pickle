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
  const planMatch=(a,b,label)=>'<div class="bracket-match bracket-match-pro bracket-plan-match"><div class="bracket-match-meta"><span>'+esc(label||"")+'</span><span>Dự kiến</span></div><div class="bracket-team"><span>'+esc(a||"Chờ xác định")+'</span><b></b></div><div class="bracket-team"><span>'+esc(b||"Chờ xác định")+'</span><b></b></div></div>';
  const roundName=count=>count===1?"Chung kết":count===2?"Bán kết":count===4?"Tứ kết":count===8?"Vòng 1/8":"Vòng loại trực tiếp";
  function renderPlan(teams=[]){
    const groups=[...new Set((teams||[]).map(t=>t.group).filter(Boolean))].sort();
    if(!groups.length)return '<div class="bracket-plan-empty"><b>Chưa chia bảng</b><span>Bấm “Quay số chia bảng” để hệ thống tạo bảng và sơ đồ thi đấu.</span></div>';
    const qualifiers=[];for(const g of groups)qualifiers.push("Nhất bảng "+g,"Nhì bảng "+g);
    if(qualifiers.length===2)return '<div class="bracket-plan-wrap"><div class="bracket-section-title final"><span>SƠ ĐỒ DỰ KIẾN</span><h3>Từ vòng bảng đến Chung kết</h3></div><div class="bracket"><div class="round bracket-round-pro"><h3>Chung kết</h3>'+planMatch(qualifiers[0],qualifiers[1],"Trận Chung kết")+'</div></div><div class="bracket-plan-note">Hai đội cùng bảng chỉ gặp lại ở Chung kết.</div></div>';
    let size=2;while(size<qualifiers.length)size*=2;
    let order=[1,2];for(let n=4;n<=size;n*=2){const next=[];for(const seed of order)next.push(seed,n+1-seed);order=next}
    let current=order.map(n=>qualifiers[n-1]||"BYE"),rounds=[];
    while(current.length>=2){
      const count=current.length/2,matches=[];for(let i=0;i<count;i++)matches.push({a:current[i*2],b:current[i*2+1],label:"Trận "+(i+1)});
      rounds.push({title:roundName(count),matches});current=matches.map((_,i)=>"Thắng "+roundName(count)+" "+(i+1));
    }
    return '<div class="bracket-plan-wrap"><div class="bracket-section-title"><span>SƠ ĐỒ DỰ KIẾN</span><h3>Top 2 mỗi bảng → '+rounds.map(r=>r.title).join(" → ")+'</h3></div><div class="bracket bracket-plan">'+rounds.map(r=>'<div class="round bracket-round-pro"><h3>'+esc(r.title)+'</h3>'+r.matches.map(m=>planMatch(m.a,m.b,m.label)).join("")+'</div>').join("")+'</div><div class="bracket-plan-note">Nhất và Nhì cùng bảng nằm ở hai nửa nhánh khác nhau, chỉ có thể gặp lại ở Chung kết.</div></div>';
  }
  function champion(matches,team){
    const final=matches.find(m=>m.bracketSlot==="DE-GF")||
      [...matches.filter(m=>(m.bracketSlot||"").startsWith("SE-"))].sort((a,b)=>(b.bracketSlot||"").localeCompare(a.bracketSlot||"",undefined,{numeric:true}))[0]||
      matches.find(m=>/chung kết/i.test(m.stage||""));
    return final?.winner?team(final.winner):"Chưa xác định";
  }
  window.PickleBracket={render,renderPlan,champion};
})();