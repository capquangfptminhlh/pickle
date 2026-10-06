(()=>{
  const API=window.PickleAPI,$=s=>document.querySelector(s);
  const id=new URLSearchParams(location.search).get("id")||"";
  let state=null,refreshTimer=null;
  const team=x=>state?.teams?.find(t=>t.id===x)?.name||(x==="TBD"||!x?"Chưa xác định":x);
  const qMeta=s=>({live:["ĐANG ĐẤU","live"],warming_up:["KHỞI ĐỘNG","warming_up"],on_deck:["ON DECK","on_deck"],called:["ĐANG GỌI","called"],scheduled:["CHỜ","scheduled"],done:["HOÀN TẤT","done"]}[s]||["CHỜ","scheduled"]);

  function render(){
    const m=state?.matches?.find(x=>x.id===id);
    $("#matchLoading").hidden=true;
    if(!m){$("#matchNotFound").hidden=false;$("#matchCard").hidden=true;return}
    $("#matchNotFound").hidden=true;$("#matchCard").hidden=false;
    const d=state.divisions.find(x=>x.id===m.divisionId),t=state.tournaments.find(x=>x.id===d?.tournamentId),c=state.courts.find(x=>x.id===m.courtId);
    const q=m.status==="live"?"live":m.status==="done"?"done":m.courtState||"scheduled",meta=qMeta(q);
    $("#matchTournament").textContent=t?.name||"Giải đấu";
    $("#matchStage").textContent=m.stage||d?.name||"Trận đấu";
    $("#matchState").textContent=meta[0];$("#matchState").className="state-pill "+meta[1];
    $("#matchCourt").textContent=c?.name||(m.court&&m.court!=="—"?"Sân "+m.court:"Chưa gán sân");
    $("#matchTime").textContent=m.time||"Chưa chốt giờ";
    $("#matchTeamA").textContent=team(m.a);$("#matchTeamB").textContent=team(m.b);
    $("#matchScoreA").textContent=Number(m.current?.[0]||0);$("#matchScoreB").textContent=Number(m.current?.[1]||0);
    $("#setList").innerHTML=(m.sets||[]).length?(m.sets||[]).map((s,i)=>'<span>Set '+(i+1)+': '+s[0]+'–'+s[1]+'</span>').join(""):'<span>Chưa có set hoàn tất</span>';
    const serve=$("#serveInfo");
    if(m.status==="live"&&m.servingSide){
      serve.hidden=false;serve.textContent="🏓 Đang giao: "+(m.servingSide==="A"?team(m.a):team(m.b))+(d?.scoringMode==="side_out"?" · Server "+Number(m.serverNumber||2):"");
    }else serve.hidden=true;
    $("#matchUpdated").textContent="Cập nhật "+new Date().toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    $("#tournamentLink").href=t?"tournament.html?id="+encodeURIComponent(t.id):"index.html";
    document.title=(team(m.a)+" vs "+team(m.b))+" | Pickleup.vn";
  }
  async function refresh(){
    try{state=await API.publicState();render();$("#matchConnection").textContent="● LIVE";$("#matchConnection").className="live-pill"}
    catch{$("#matchConnection").textContent="● OFFLINE";$("#matchConnection").className="live-pill offline"}
  }
  function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,180)}
  if(!id){$("#matchLoading").hidden=true;$("#matchNotFound").hidden=false}else refresh().then(()=>{
    const socket=window.io?.();socket?.on("public:state",schedule);socket?.on("match:update",e=>{if(!e?.id||e.id===id)schedule()});
    socket?.on("disconnect",()=>{$("#matchConnection").textContent="● OFFLINE";$("#matchConnection").className="live-pill offline"});
  });
})();