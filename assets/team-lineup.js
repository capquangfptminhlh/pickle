// Three-player MLP uses unique A/B/C skill groups when present, then confirmed
// member order for same-grade teams. Relay positions never change skill grades.
(()=>{
  const letters="ABCD";
  const team=(id,state)=>state?.teams?.find(item=>item.id===id)||null;
  const players=(id,state)=>(state?.teamPlayers?.[id]||[]).map(playerId=>state?.players?.find(player=>player.id===playerId)).filter(Boolean);
  const source=(id,state)=>state?.teamLineupSources?.[id]||"unassigned";
  const playerName=player=>player?.full_name||player?.nickname||"VĐV";
  const skill=player=>String(player?.skillLevel||player?.skill_level||"").trim().toUpperCase();
  const skillRole=player=>/^([ABC])\+?$/.exec(skill(player))?.[1]||"";
  function roster(id,state){
    const rows=players(id,state);
    return {team:team(id,state),players:rows,source:source(id,state),ready:rows.length>0&&source(id,state)!=="unassigned",text:rows.map(playerName).join(" / ")};
  }
  const validOrder=order=>Array.isArray(order)&&order.length===3&&new Set(order).size===3&&order.every(code=>["AB","BC","CA"].includes(code));
  const started=match=>Boolean(match&&(match.startedAt||match.started_at||match.hasHistory||match.scoreHistoryCount||match.history?.length||match.scoreEvents?.length||["live","done","completed","walkover","cancelled"].includes(match.status)||match.winner||(match.sets||[]).length||(match.current||[]).some(Number)));
  const requiresDraw=(division,match)=>Boolean(match&&division?.eventType==="team"&&Number(division.relaySegmentPoints)>0&&Number(division.relayTeamSize||Math.ceil(Number(division.pointsToWin)/Number(division.relaySegmentPoints)))===3);
  const drawn=match=>validOrder(match?.relayOrderA)&&validOrder(match?.relayOrderB);
  const awaitingDraw=(division,match)=>requiresDraw(division,match)&&!drawn(match)&&!started(match);
  function pairAt(id,index,size,state,order){
    let info=roster(id,state);
    const pairs=window.PickleMatchFormat?.relayPairs?.(size)||[];
    const code=(order||pairs)[index]||"";
    if(Number(size)===3){
      const gradeBased=info.players.length===3&&[..."ABC"].every(letter=>info.players.filter(player=>skillRole(player)===letter).length===1);
      const ordered=info.players.length===3&&["assigned","inferred"].includes(info.source),ready=gradeBased||ordered;
      info={...info,gradeBased,ready,players:gradeBased?[..."ABC"].map(letter=>info.players.find(player=>skillRole(player)===letter)):info.players,
        identityWarning:ready?"":info.players.length!==3?"MLP 3 người cần đúng 3 VĐV · Kiểm tra thành viên":"Chưa xác định thứ tự A/B/C · Chọn thứ tự thành viên trong Sửa đội"};
    }
    if(!code||!info.ready||info.players.length<size)return {...info,ready:false,code,names:[],label:info.team?.name||"Chưa xác định",short:info.team?.name||"Chưa xác định"};
    const names=[...code].map(letter=>playerName(info.players[letters.indexOf(letter)])).filter(Boolean);
    if(names.length!==code.length)return {...info,ready:false,code,names:[],label:info.team?.name||"Chưa xác định",short:info.team?.name||"Chưa xác định"};
    return {...info,code,names,label:`Cặp ${code} · ${names.join(" + ")}`,short:`Cặp ${code}: ${names.join(" + ")}`};
  }
  function match(id,division,scoreA,scoreB,state,metadata){
    const leg=window.PickleMatchFormat?.relayLeg?.(scoreA,scoreB,division);
    if(!leg)return {...roster(id,state),relay:false,label:team(id,state)?.name||"Chưa xác định",short:team(id,state)?.name||"Chưa xác định",next:null};
    const pending=awaitingDraw(division,metadata),order=leg.size===3&&drawn(metadata)?(id===metadata.a?metadata.relayOrderA:metadata.relayOrderB):pending?[]:undefined;
    const identity=pairAt(id,leg.index,leg.size,state,pending?undefined:order);
    const current=pending?{...identity,code:"",names:[],label:identity.team?.name||"Chưa xác định",short:identity.team?.name||"Chưa xác định"}:identity;
    const next=leg.index+1<leg.count?pairAt(id,leg.index+1,leg.size,state,order):null;
    return {...current,relay:true,leg,next,awaitingDraw:pending,identityWarning:current.identityWarning||(pending?"Bốc thăm cặp trước khi nhập điểm":"")};
  }
  function legText(teamAId,teamBId,division,scoreA,scoreB,state,metadata){
    const a=match(teamAId,division,scoreA,scoreB,state,metadata),b=match(teamBId,division,scoreA,scoreB,state,metadata);
    if(!a.relay)return "";
    if(a.awaitingDraw||b.awaitingDraw)return "Bốc thăm thứ tự cặp chung cho hai đội trước khi nhập điểm";
    const current=a.code&&b.code?`A: Cặp ${a.code} vs B: Cặp ${b.code}`:`Lượt ${a.leg.index+1}`;
    const next=a.next&&b.next?` • Tiếp theo A: ${a.next.code}${a.next.ready?": "+a.next.names.join(" + "):""} vs B: ${b.next.code}${b.next.ready?": "+b.next.names.join(" + "):""}`:"";
    const warning=!a.ready||!b.ready?" • "+(a.identityWarning||b.identityWarning||"Chưa gán đủ vị trí A/B/C"):"";
    return `Đang đánh ${current} • đến ${a.leg.until} điểm${next}${warning}`;
  }
  function renderDrawPanel(element,button,metadata,division,state){
    if(!element)return;
    element.hidden=!requiresDraw(division,metadata)||started(metadata);
    if(element.hidden)return;
    if(button){button.hidden=false;button.disabled=!metadata.a||!metadata.b||metadata.a==="TBD"||metadata.b==="TBD";button.textContent=drawn(metadata)?"Bốc thăm lại thứ tự cặp":"Bốc thăm thứ tự cặp"}
    const list=element.querySelector(".relay-draw-orders");if(!list)return;
    list.replaceChildren();
    if(!drawn(metadata)){list.textContent="Bốc thăm một lần thứ tự AB, BC, CA và áp dụng cho cả hai đội. Bốc thăm xong mới nhập điểm.";return}
    for(let index=0;index<3;index++){
      const row=document.createElement("div");row.className="relay-draw-leg";
      const a=pairAt(metadata.a,index,3,state,metadata.relayOrderA),b=pairAt(metadata.b,index,3,state,metadata.relayOrderB);
      row.textContent=`Lượt ${index+1} · đến ${Number(division.relaySegmentPoints)*(index+1)} điểm · A: ${a.short} vs B: ${b.short}`;list.append(row);
    }
  }
  function renderRoster(element,lineup,servingServer=0,finished=false){
    if(!element)return;
    element.replaceChildren();
    if(!lineup?.relay)return;
    const fragment=document.createDocumentFragment();
    if(!lineup.ready&&!lineup.awaitingDraw){const warning=document.createElement("span");warning.className="lineup-warning";warning.textContent=lineup.identityWarning||"Chưa gán đủ vị trí A/B/C";fragment.append(warning)}
    (lineup.ready?lineup.players.slice(0,lineup.leg.size):lineup.players).forEach((player,index)=>{
      const letter=letters[index],playing=!finished&&lineup.ready&&lineup.code.includes(letter),serving=playing&&lineup.code[servingServer-1]===letter;
      const row=document.createElement("span"),slot=document.createElement("b"),name=document.createElement("span"),grade=document.createElement("span");
      row.className="lineup-player";row.dataset.playerId=player.id;
      if(lineup.ready)row.dataset.playerSlot=letter;
      row.dataset.playing=String(playing);row.dataset.serving=String(serving);
      slot.className="lineup-slot";slot.textContent=lineup.ready?"Vị trí "+letter:"Chưa xếp";
      name.className="lineup-name";name.textContent=playerName(player);
      grade.className="lineup-grade";grade.textContent="Trình "+(skill(player)||"Chưa nhập");
      row.append(slot,name,grade);
      row.setAttribute("aria-label",`${slot.textContent}: ${name.textContent} · ${grade.textContent} · ${finished?"Trận đã kết thúc":lineup.ready?(playing?"Đang đánh":"Chờ lượt"):"Chưa xác định vị trí"}${serving?" · Đang giao":""}`);
      if(serving){const badge=document.createElement("i");badge.className="lineup-serving";badge.textContent="GIAO";row.append(badge)}
      fragment.append(row);
    });
    element.append(fragment);
  }
  window.PickleTeamLineup={roster,pairAt,match,legText,renderRoster,renderDrawPanel,validOrder,started,requiresDraw,drawn,awaitingDraw};
})();
