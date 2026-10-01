(()=>{
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const setWins=(m,side)=>{
    if(m.status!=="done"&&m.status!=="completed")return "";
    const last=m.sets?.[m.sets.length-1];
    if(last&&(Number(last[0])>=25||Number(last[1])>=25)){
      return side==="A"?last[0]:last[1];
    }
    return (m.sets||[]).filter(s=>side==="A"?s[0]>s[1]:s[1]>s[0]).length;
  };
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
    return '<div class="round bracket-round-pro bracket-round-'+(idx+1)+(isFinal?' is-final-round':'')+'" data-round-index="'+idx+'" data-round-title="'+esc(title)+'" style="--round-index:'+idx+'"><h3>'+titleHtml+'</h3>'+matches.map((m,i)=>'<div class="bracket-match-wrap" data-match-index="'+i+'" style="--bracket-delay:'+((idx*110)+(i*55))+'ms">'+match(m,team,opts)+'</div>').join("")+'</div>';
  };
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
    const hasSeriesB=ko.some(m=>(m.bracketSlot||"").startsWith("SE-B-"));
    const renderSeTree=(subKo,sectionTitle,sectionSub)=>{
      const map=new Map();
      const bronzeMatches=[];
      for(const m of subKo){
        if((m.bracketSlot||"").endsWith("BRONZE")){
          bronzeMatches.push(m);
          continue;
        }
        const n=Number((m.bracketSlot||"").match(/R(\d+)-/)?.[1]||999);
        if(!map.has(n))map.set(n,[]);map.get(n).push(m);
      }
      const rounds=[...map.entries()].sort((a,b)=>a[0]-b[0]);
      let html='<div class="bracket bracket-tree">'+rounds.map(([n,a],ri)=>{
        a.sort(sortSlot);
        const title=roundName(a.length);
        return round(title,a,team,opts,ri);
      }).join("");
      if(bronzeMatches.length){
        html+=round("Tranh Hạng 3 🥉",bronzeMatches,team,opts,rounds.length);
      }
      html+='</div>';
      if(!sectionTitle)return html;
      return '<div class="series-bracket-section"><div class="bracket-section-title"><span>'+esc(sectionTitle)+'</span><h3>'+esc(sectionSub||"")+'</h3></div>'+html+'</div>';
    };
    if(hasSeriesB){
      const koA=ko.filter(m=>(m.bracketSlot||"").startsWith("SE-A-")||!(m.bracketSlot||"").startsWith("SE-B-"));
      const koB=ko.filter(m=>(m.bracketSlot||"").startsWith("SE-B-"));
      return '<div class="series-brackets-container">'+
        renderSeTree(koA,"SERIES A","Cúp Vàng - Championship")+
        renderSeTree(koB,"SERIES B","Cúp Bạc - Plate")+
      '</div>';
    }
    return renderSeTree(ko);
  }
  const planMatch=(a,b,label)=>'<div class="bracket-match bracket-match-pro bracket-plan-match"><div class="bracket-match-meta"><span>'+esc(label||"")+'</span><span>Dự kiến</span></div><div class="bracket-team"><span>'+esc(a||"Chờ xác định")+'</span><b></b></div><div class="bracket-team"><span>'+esc(b||"Chờ xác định")+'</span><b></b></div></div>';
  const roundName=count=>count===1?"Chung kết":count===2?"Bán kết":count===4?"Tứ kết":count===8?"Vòng 1/8":"Vòng loại trực tiếp";
  function renderPlan(teams=[]){
    const groups=[...new Set((teams||[]).map(t=>t.group).filter(Boolean))].sort();
    if(!groups.length)return '<div class="bracket-plan-empty"><b>Chưa chia bảng</b><span>Bấm “Quay số chia bảng” để hệ thống tạo bảng và sơ đồ thi đấu.</span></div>';
    const qualifiers=[];for(const g of groups)qualifiers.push("Nhất bảng "+g,"Nhì bảng "+g);
    if(qualifiers.length===2)return '<div class="bracket-plan-wrap"><div class="bracket-section-title final"><span>SƠ ĐỒ DỰ KIẾN</span><h3>Từ vòng bảng đến Chung kết</h3></div><div class="bracket"><div class="round bracket-round-pro"><h3>Chung kết</h3>'+planMatch(qualifiers[0],qualifiers[1],"Trận Chung kết")+'</div></div><div class="bracket-plan-note">Hai đội cùng bảng chỉ gặp lại ở Chung kết.</div></div>';
    let size=2;while(size<qualifiers.length)size*=2;
    const upperGroups=[],lowerGroups=[];
    groups.forEach((g,idx)=>{
      if(idx%4===0||idx%4===3)upperGroups.push(g);
      else lowerGroups.push(g);
    });
    const upperFirsts=upperGroups.map(g=>"Nhất bảng "+g);
    const upperSeconds=lowerGroups.map(g=>"Nhì bảng "+g);
    const lowerFirsts=lowerGroups.map(g=>"Nhất bảng "+g);
    const lowerSeconds=upperGroups.map(g=>"Nhì bảng "+g);
    const halfMatchCount=size/4;
    const slots=new Array(size).fill(null);
    for(let i=0;i<halfMatchCount;i++){
      slots[i*2]=upperFirsts[i]||null;
      slots[i*2+1]=upperSeconds[upperSeconds.length-1-i]||upperSeconds[i]||null;
    }
    for(let i=0;i<halfMatchCount;i++){
      slots[size/2+i*2]=lowerFirsts[i]||null;
      slots[size/2+i*2+1]=lowerSeconds[lowerSeconds.length-1-i]||lowerSeconds[i]||null;
    }
    let current=slots.map(x=>x||"BYE"),rounds=[];
    while(current.length>=2){
      const count=current.length/2,matches=[];for(let i=0;i<count;i++)matches.push({a:current[i*2],b:current[i*2+1],label:"Trận "+(i+1)});
      rounds.push({title:roundName(count),matches});current=matches.map((_,i)=>"Thắng "+roundName(count)+" "+(i+1));
    }
    if(size>=4){
      rounds.push({title:"Tranh Hạng Ba 🥉",matches:[{a:"Thua Bán kết 1",b:"Thua Bán kết 2",label:"Tranh Hạng 3 🥉"}]});
    }
    return '<div class="bracket-plan-wrap"><div class="bracket-section-title"><span>SƠ ĐỒ DỰ KIẾN • '+qualifiers.length+' CẶP VÀO KNOCKOUT</span><h3>'+rounds.map(r=>r.title).join(" → ")+'</h3></div><div class="bracket bracket-plan">'+rounds.map((r,ri)=>{const isFinal=/chung kết/i.test(r.title);return '<div class="round bracket-round-pro bracket-round-'+(ri+1)+(isFinal?' is-final-round':'')+'" data-round-index="'+ri+'" data-round-title="'+esc(r.title)+'" style="--round-index:'+ri+'"><h3>'+(isFinal?'<span class="final-cup" aria-hidden="true">🏆</span><span>'+esc(r.title)+'</span>':esc(r.title))+'</h3>'+r.matches.map((m,i)=>'<div class="bracket-match-wrap" data-match-index="'+i+'" style="--bracket-delay:'+((ri*110)+(i*55))+'ms">'+planMatch(m.a,m.b,m.label)+'</div>').join("")+'</div>'}).join("")+'</div><div class="bracket-plan-note">Số vòng tự thay đổi theo số cặp vào loại trực tiếp. Nhất và Nhì cùng bảng được tách hai nửa nhánh để chỉ có thể gặp lại ở Chung kết.</div></div>';
  }
  function champion(matches,team){
    const koB=matches.filter(m=>(m.bracketSlot||"").startsWith("SE-B-"));
    if(koB.length){
      const finalA=matches.find(m=>m.bracketSlot==="SE-A-R2-M1"||((m.bracketSlot||"").startsWith("SE-A-")&&m.stage?.includes("Chung kết")))||
        [...matches.filter(m=>(m.bracketSlot||"").startsWith("SE-A-"))].sort((a,b)=>(b.bracketSlot||"").localeCompare(a.bracketSlot||"",undefined,{numeric:true}))[0];
      const finalB=matches.find(m=>m.bracketSlot==="SE-B-R2-M1"||((m.bracketSlot||"").startsWith("SE-B-")&&m.stage?.includes("Chung kết")))||
        [...koB].sort((a,b)=>(b.bracketSlot||"").localeCompare(a.bracketSlot||"",undefined,{numeric:true}))[0];
      const champA=finalA?.winner?team(finalA.winner):"";
      const champB=finalB?.winner?team(finalB.winner):"";
      if(champA&&champB)return "🥇 Series A: "+champA+"  |  🥈 Series B: "+champB;
      if(champA)return "🥇 Series A: "+champA;
      if(champB)return "🥈 Series B: "+champB;
      return "Chưa xác định";
    }
    const final=matches.find(m=>m.bracketSlot==="DE-GF")||
      [...matches.filter(m=>(m.bracketSlot||"").startsWith("SE-"))].sort((a,b)=>(b.bracketSlot||"").localeCompare(a.bracketSlot||"",undefined,{numeric:true}))[0]||
      matches.find(m=>/chung kết/i.test(m.stage||""));
    const bronze=matches.find(m=>(m.bracketSlot||"").endsWith("BRONZE")||/hạng ba/i.test(m.stage||""));
    if(!final?.winner)return "Chưa xác định";
    const champ=team(final.winner);
    const runnerUp=final.winner===final.a?team(final.b):team(final.a);
    const bronzeTeam=bronze?.winner?team(bronze.winner):"";
    return `🥇 ${champ}  |  🥈 ${runnerUp}${bronzeTeam?`  |  🥉 ${bronzeTeam}`:""}`;
  }
  window.PickleBracket={render,renderPlan,champion};
})();