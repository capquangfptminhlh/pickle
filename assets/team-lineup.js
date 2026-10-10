// Shared MLP lineup labels. A/B/C order comes from persisted team-player slots;
// legacy rows are used only when the API marks an exact name-based inference.
(()=>{
  const letters="ABCD";
  const team=(id,state)=>state?.teams?.find(item=>item.id===id)||null;
  const players=(id,state)=>(state?.teamPlayers?.[id]||[]).map(playerId=>state?.players?.find(player=>player.id===playerId)).filter(Boolean);
  const source=(id,state)=>state?.teamLineupSources?.[id]||"unassigned";
  const playerName=player=>player?.full_name||player?.nickname||"VĐV";
  function roster(id,state){
    const rows=players(id,state);
    return {team:team(id,state),players:rows,source:source(id,state),ready:rows.length>0&&source(id,state)!=="unassigned",text:rows.map(playerName).join(" / ")};
  }
  function pairAt(id,index,size,state){
    const info=roster(id,state),pairs=window.PickleMatchFormat?.relayPairs?.(size)||[];
    const code=pairs[index]||"";
    if(!code||!info.ready)return {...info,code,names:[],label:info.team?.name||"Chưa xác định",short:info.team?.name||"Chưa xác định"};
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
    const next=a.next&&b.next?` • Tiếp theo ${a.next.code}: ${a.next.names.join(" + ")} vs ${b.next.names.join(" + ")}`:"";
    const warning=!a.ready||!b.ready?" • Chưa gán đủ vị trí A/B/C":"";
    return `Đang đánh ${current} • đến ${until} điểm${next}${warning}`;
  }
  window.PickleTeamLineup={roster,pairAt,match,legText};
})();
