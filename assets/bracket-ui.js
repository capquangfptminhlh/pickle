(()=>{
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const setWins=(m,side)=>(m.sets||[]).filter(s=>side==="A"?s[0]>s[1]:s[1]>s[0]).length;
  const match=(m,team,{admin=false}={})=>{
    const ready=m.a&&m.b&&m.a!=="TBD"&&m.b!=="TBD";
    const special=m.resultReason?'<small class="bracket-reason">'+esc(m.resultReason.replaceAll("_"," "))+'</small>':"";
    const action=admin&&m.status!=="done"&&ready?'<button class="mini" data-score-match="'+esc(m.id)+'">Nhập điểm</button>':"";
    const statusLabel=m.status==="live"?"LIVE":(m.status==="done"||m.status==="completed"?"KẾT THÚC":"SẮP ĐẤU");
    const statusClass=m.status==="live"?"is-live":(m.status==="done"||m.status==="completed"?"is-done":"is-wait");
    return '<div class="bracket-match bracket-match-pro '+statusClass+'" data-bracket-match="'+esc(m.id)+'">'+
      '<div class="bracket-match-meta"><span>'+esc(m.time||"")+' • Sân '+esc(m.court||"—")+'</span><b>'+statusLabel+'</b></div>'+
      '<div class="bracket-team '+(m.winner===m.a?"win":"")+'"><span>'+esc(team(m.a))+'</span><b>'+(m.status==="done"?setWins(m,"A"):"")+'</b></div>'+
      '<div class="bracket-team '+(m.winner===m.b?"win":"")+'"><span>'+esc(team(m.b))+'</span><b>'+(m.status==="done"?setWins(m,"B"):"")+'</b></div>'+
      special+action+'</div>';
  };
  const round=(title,matches,team,opts,idx=0)=>{
    const isFinal=/chung kết|grand final/i.test(title||"");
    const titleHtml=isFinal?'<span class="final-cup" aria-hidden="true">🏆</span><span>'+esc(title)+'</span>':esc(title);
    return '<div class="round bracket-round-pro bracket-round-'+(idx+1)+(isFinal?' is-final-round':'')+'" data-round-index="'+idx+'" data-round-title="'+esc(title)+'" style="--round-index:'+idx+'"><h3>'+titleHtml+'</h3><div class="bracket-round-matches">'+matches.map((m,i)=>'<div class="bracket-match-wrap" data-match-index="'+i+'" style="--bracket-delay:'+((idx*110)+(i*55))+'ms">'+match(m,team,opts)+'</div>').join("")+'</div></div>';
  };
  const sortSlot=(a,b)=>(a.bracketSlot||"").localeCompare(b.bracketSlot||"",undefined,{numeric:true});
  const seriesOf=m=>m.bracketSeries==="B"||String(m.bracketSlot||"").startsWith("B-SE-")?"B":"A";
  const slotOf=m=>String(m.bracketSlot||"").replace(/^B-/,"");
  const seriesTitle=(series,note)=>'<div class="bracket-section-title"><span>SÉRIE '+series+'</span><h3>Serie '+series+'</h3>'+(note?'<p>'+esc(note)+'</p>':'')+'</div>';
  function render(matches,team,opts={}){
    const divisions=[...new Set(matches.filter(m=>m.bracketSlot||/bán kết|chung kết/i.test(m.stage||"")).map(m=>m.divisionId||""))];
    if(divisions.length>1)return divisions.map(id=>'<section class="bracket-division" data-bracket-division="'+esc(id)+'"><h2>'+esc(opts.divisionNames?.[id]||"Nội dung thi đấu")+'</h2>'+render(matches.filter(m=>(m.divisionId||"")===id),team,opts)+'</section>').join("");
    const hasB=matches.some(m=>m.bracketSlot&&seriesOf(m)==="B");
    if(!opts.series&&(hasB||opts.seriesBEnabled))return ['A','B'].map(series=>{
      const branch=matches.filter(m=>seriesOf(m)===series),champ=champion(branch,team,{series});
      return '<section class="bracket-series" data-bracket-series="'+series+'">'+seriesTitle(series,series==="B"?"Đội hạng 3 mỗi bảng":"Nhánh chính")+render(branch,team,{...opts,series})+(opts.showChampions?'<div class="'+(opts.admin?'admin':'public')+'-champion"><span>VÔ ĐỊCH SERIE '+series+'</span><strong>'+esc(champ)+'</strong></div>':'')+'</section>';
    }).join("");
    if(opts.series)matches=matches.filter(m=>seriesOf(m)===opts.series);
    const html=renderBranch(matches,team,opts);
    return html+(!opts.series&&opts.showChampions?'<div class="'+(opts.admin?'admin':'public')+'-champion"><span>VÔ ĐỊCH</span><strong>'+esc(champion(matches,team))+'</strong></div>':'');
  }
  function renderBranch(matches,team,opts={}){
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
    const third=ko.filter(m=>slotOf(m).startsWith("SE-3RD"));
    const map=new Map();
    for(const m of ko.filter(m=>!third.includes(m))){
      const n=Number(slotOf(m).match(/^SE-R(\d+)-/)?.[1]||999);
      if(!map.has(n))map.set(n,[]);map.get(n).push(m);
    }
    const rounds=[...map.entries()].sort((a,b)=>a[0]-b[0]);
    return '<div class="bracket bracket-tree">'+rounds.map(([n,a],ri)=>{
      a.sort(sortSlot);
      const title=roundName(a.length);
      return round(title,a,team,opts,ri);
    }).join("")+'</div>'+(third.length?'<div class="bracket-third-place"><div class="bracket-section-title"><span>HẠNG BA</span><h3>Tranh hạng ba</h3></div><div class="bracket">'+round("Tranh hạng ba",third,team,opts,rounds.length)+'</div></div>':"");
  }
  const planMatch=(a,b,label)=>'<div class="bracket-match bracket-match-pro bracket-plan-match"><div class="bracket-match-meta"><span>'+esc(label||"")+'</span><span>Dự kiến</span></div><div class="bracket-team"><span>'+esc(a||"Chờ xác định")+'</span><b></b></div><div class="bracket-team"><span>'+esc(b||"Chờ xác định")+'</span><b></b></div></div>';
  const roundName=count=>count===1?"Chung kết":count===2?"Bán kết":count===4?"Tứ kết":count===8?"Vòng 1/8":"Vòng loại trực tiếp";
  const PLACE=["Nhất","Nhì","Ba","Tư","Năm","Sáu"];
  function renderPlan(teams=[],{advance=2,thirdPlace=false,seriesBEnabled=false,seriesBThirdPlaceMatch=false,series=null}={}){
    if(seriesBEnabled&&!series)return ['A','B'].map(branch=>'<section class="bracket-series" data-bracket-series="'+branch+'">'+seriesTitle(branch,branch==="B"?"Hạng 3 mỗi bảng • dự kiến":"Top "+advance+" mỗi bảng • dự kiến")+renderPlan(teams,{advance,thirdPlace:branch==="B"?seriesBThirdPlaceMatch:thirdPlace,series:branch})+'</section>').join("");
    const groups=[...new Set((teams||[]).map(t=>t.group).filter(Boolean))].sort();
    if(!groups.length)return '<div class="bracket-plan-empty"><b>BTC chưa chia bảng</b><span>Sơ đồ thi đấu sẽ hiện ngay khi BTC bốc thăm chia bảng.</span></div>';
    const qualifiers=[];for(const g of groups){if(series==="B")qualifiers.push("Ba bảng "+g);else for(let i=0;i<Math.min(teams.filter(t=>t.group===g).length,Math.max(1,advance));i++)qualifiers.push((PLACE[i]||("Hạng "+(i+1)))+" bảng "+g)}
    if(qualifiers.length<2)return '<div class="bracket-plan-empty"><b>Chưa đủ đội dự kiến</b><span>Cần ít nhất hai đội vào loại trực tiếp.</span></div>';
    const thirdNote=thirdPlace&&qualifiers.length>=4?'<div class="bracket-third-place"><div class="bracket-section-title"><span>HẠNG BA</span><h3>Tranh hạng ba'+(series?' Serie '+series:'')+'</h3></div><div class="bracket"><div class="round bracket-round-pro"><div class="bracket-round-matches"><div class="bracket-match-wrap">'+planMatch("Thua Bán kết 1","Thua Bán kết 2","Tranh hạng ba")+'</div></div></div></div></div>':"";
    if(qualifiers.length===2)return '<div class="bracket-plan-wrap"><div class="bracket-section-title final"><span>SƠ ĐỒ DỰ KIẾN</span><h3>Từ vòng bảng đến Chung kết</h3></div><div class="bracket"><div class="round bracket-round-pro"><h3>Chung kết</h3><div class="bracket-round-matches"><div class="bracket-match-wrap">'+planMatch(qualifiers[0],qualifiers[1],"Trận Chung kết")+'</div></div></div></div><div class="bracket-plan-note">Hai đội cùng bảng chỉ gặp lại ở Chung kết.</div></div>';
    let size=2;while(size<qualifiers.length)size*=2;
    let order=[1,2];for(let n=4;n<=size;n*=2){const next=[];for(const seed of order)next.push(seed,n+1-seed);order=next}
    let current=order.map(n=>qualifiers[n-1]||"BYE"),rounds=[];
    while(current.length>=2){
      const count=current.length/2,matches=[];for(let i=0;i<count;i++)matches.push({a:current[i*2],b:current[i*2+1],label:"Trận "+(i+1)});
      rounds.push({title:roundName(count),matches});current=matches.map((_,i)=>"Thắng "+roundName(count)+" "+(i+1));
    }
    return '<div class="bracket-plan-wrap"><div class="bracket-section-title"><span>SƠ ĐỒ DỰ KIẾN • '+qualifiers.length+' CẶP VÀO KNOCKOUT</span><h3>'+rounds.map(r=>r.title).join(" → ")+'</h3></div><div class="bracket bracket-plan">'+rounds.map((r,ri)=>{const isFinal=/chung kết/i.test(r.title);return '<div class="round bracket-round-pro bracket-round-'+(ri+1)+(isFinal?' is-final-round':'')+'" data-round-index="'+ri+'" data-round-title="'+esc(r.title)+'" style="--round-index:'+ri+'"><h3>'+(isFinal?'<span class="final-cup" aria-hidden="true">🏆</span><span>'+esc(r.title)+'</span>':esc(r.title))+'</h3><div class="bracket-round-matches">'+r.matches.map((m,i)=>'<div class="bracket-match-wrap" data-match-index="'+i+'" style="--bracket-delay:'+((ri*110)+(i*55))+'ms">'+planMatch(m.a,m.b,m.label)+'</div>').join("")+'</div></div>'}).join("")+'</div><div class="bracket-plan-note">Số vòng tự thay đổi theo số cặp vào loại trực tiếp. Nhất và Nhì cùng bảng được tách hai nửa nhánh để chỉ có thể gặp lại ở Chung kết.</div>'+thirdNote+'</div>';
  }
  function champion(matches,team,{series="A"}={}){
    matches=matches.filter(m=>seriesOf(m)===series);
    const final=matches.find(m=>/^DE-GF(?:-|$)/.test(m.bracketSlot||""))||
      [...matches.filter(m=>/^SE-R\d+-/.test(slotOf(m)))].sort((a,b)=>slotOf(b).localeCompare(slotOf(a),undefined,{numeric:true}))[0]||
      matches.find(m=>/^chung kết(?: tổng)?$/i.test(m.stage||""));
    return final?.winner?team(final.winner):"Chưa xác định";
  }
  window.PickleBracket={render,renderPlan,champion,seriesOf,stageLabel:m=>(m.bracketSlot?"Serie "+seriesOf(m)+" · ":"")+(m.stage||"Trận đấu")};
})();
