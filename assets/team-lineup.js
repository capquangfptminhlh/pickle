// Three-player MLP roles follow the entered skill levels A/B/C (including +).
// Other formats retain their registered player order.
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
  function pairAt(id,index,size,state){
    let info=roster(id,state);
    const pairs=window.PickleMatchFormat?.relayPairs?.(size)||[];
    const code=pairs[index]||"";
    if(Number(size)===3){
      const complete=info.players.length===3&&[..."ABC"].every(letter=>info.players.filter(player=>skillRole(player)===letter).length===1);
      info={...info,gradeBased:true,ready:complete,players:complete?[..."ABC"].map(letter=>info.players.find(player=>skillRole(player)===letter)):info.players,
        identityWarning:complete?"":info.players.length!==3?"MLP 3 người cần đúng 3 VĐV · Kiểm tra thành viên và cột Trình":"Chưa đủ trình A/B/C · Cập nhật cột Trình của VĐV"};
    }
    if(!code||!info.ready||info.players.length<size)return {...info,ready:false,code,names:[],label:info.team?.name||"Chưa xác định",short:info.team?.name||"Chưa xác định"};
    const names=[...code].map(letter=>playerName(info.players[letters.indexOf(letter)])).filter(Boolean);
    if(names.length!==code.length)return {...info,ready:false,code,names:[],label:info.team?.name||"Chưa xác định",short:info.team?.name||"Chưa xác định"};
    return {...info,code,names,label:`Cặp ${code} · ${names.join(" + ")}`,short:`Cặp ${code}: ${names.join(" + ")}`};
  }
  function match(id,division,scoreA,scoreB,state){
    const leg=window.PickleMatchFormat?.relayLeg?.(scoreA,scoreB,division);
    if(!leg)return {...roster(id,state),relay:false,label:team(id,state)?.name||"Chưa xác định",short:team(id,state)?.name||"Chưa xác định",next:null};
    const current=pairAt(id,leg.index,leg.size,state);
    const next=leg.index+1<leg.count?pairAt(id,leg.index+1,leg.size,state):null;
    return {...current,relay:true,leg,next};
  }
  function legText(teamAId,teamBId,division,scoreA,scoreB,state){
    const a=match(teamAId,division,scoreA,scoreB,state),b=match(teamBId,division,scoreA,scoreB,state);
    if(!a.relay)return "";
    const until=a.leg.until,current=a.code?`Cặp ${a.code}`:`Lượt ${a.leg.index+1}`;
    const next=a.next&&b.next?(a.next.ready&&b.next.ready?` • Tiếp theo ${a.next.code}: ${a.next.names.join(" + ")} vs ${b.next.names.join(" + ")}`:` • Tiếp theo cặp ${a.next.code}`):"";
    const warning=!a.ready||!b.ready?" • "+(a.identityWarning||b.identityWarning||"Chưa gán đủ vị trí A/B/C"):"";
    return `Đang đánh ${current} • đến ${until} điểm${next}${warning}`;
  }
  function renderRoster(element,lineup,servingServer=0){
    if(!element)return;
    element.replaceChildren();
    if(!lineup?.relay)return;
    const fragment=document.createDocumentFragment();
    if(!lineup.ready){const warning=document.createElement("span");warning.className="lineup-warning";warning.textContent=lineup.identityWarning||"Chưa gán đủ vị trí A/B/C";fragment.append(warning)}
    (lineup.ready?lineup.players.slice(0,lineup.leg.size):lineup.players).forEach((player,index)=>{
      const letter=lineup.gradeBased?skillRole(player):letters[index],playing=lineup.ready&&lineup.code.includes(letter),serving=playing&&lineup.code[servingServer-1]===letter;
      const row=document.createElement("span"),slot=document.createElement("b"),name=document.createElement("span");
      row.className="lineup-player";row.dataset.playerId=player.id;
      if(lineup.ready)row.dataset.playerSlot=letter;
      row.dataset.playing=String(playing);row.dataset.serving=String(serving);
      slot.className="lineup-slot";slot.textContent=lineup.gradeBased?"Trình "+(skill(player)||"Chưa nhập"):"Vị trí "+letter;
      name.className="lineup-name";name.textContent=playerName(player);
      row.append(slot,name);
      row.setAttribute("aria-label",`${slot.textContent}: ${name.textContent} · ${playing?"Đang đánh":"Chờ lượt"}${serving?" · Đang giao":""}`);
      if(serving){const badge=document.createElement("i");badge.className="lineup-serving";badge.textContent="GIAO";row.append(badge)}
      fragment.append(row);
    });
    element.append(fragment);
  }
  window.PickleTeamLineup={roster,pairAt,match,legText,renderRoster};
})();
