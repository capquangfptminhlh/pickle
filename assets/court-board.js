(()=>{
  const API=window.PickleAPI,$=s=>document.querySelector(s);
  let state={tournaments:[],divisions:[],courts:[],teams:[],matches:[]},tournamentId="",refreshTimer=null;

  const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const team=id=>state.teams.find(t=>t.id===id)?.name||(id==="TBD"||!id?"Chưa xác định":id);
  const division=m=>state.divisions.find(d=>d.id===m.divisionId);
  const queueRank=m=>m.status==="live"?0:m.courtState==="warming_up"?1:m.courtState==="on_deck"?2:m.courtState==="called"?3:m.status==="wait"?4:5;
  const qMeta=s=>({live:["ĐANG ĐẤU","live"],warming_up:["KHỞI ĐỘNG","warming_up"],on_deck:["ON DECK","on_deck"],called:["ĐANG GỌI VĐV","called"],scheduled:["CHỜ","scheduled"],done:["HOÀN TẤT","done"]}[s]||["CHỜ","scheduled"]);

  function divisionIds(){return new Set(state.divisions.filter(d=>d.tournamentId===tournamentId).map(d=>d.id))}
  function matches(){const ids=divisionIds();return state.matches.filter(m=>ids.has(m.divisionId)&&m.status!=="cancelled")}
  function courts(){return state.courts.filter(c=>c.tournamentId===tournamentId&&c.active!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)||String(a.name).localeCompare(String(b.name),"vi"))}

  function chooseTournament(){
    const query=new URLSearchParams(location.search).get("tournament");
    const available=state.tournaments.filter(t=>t.publicVisible!==false);
    if(query&&available.some(t=>t.id===query))return query;
    const live=available.find(t=>["live","ongoing","in_progress"].includes(String(t.status||"").toLowerCase()));
    return live?.id||available[0]?.id||"";
  }

  function renderSelect(){
    const select=$("#tournamentSelect");
    select.innerHTML=state.tournaments.filter(t=>t.publicVisible!==false).map(t=>'<option value="'+esc(t.id)+'" '+(t.id===tournamentId?"selected":"")+'>'+esc(t.name)+'</option>').join("");
    select.hidden=select.options.length<=1;
  }

  function activeForCourt(courtId){
    return matches().filter(m=>m.courtId===courtId).sort((a,b)=>queueRank(a)-queueRank(b)||String(a.scheduledAt||"").localeCompare(String(b.scheduledAt||"")))[0]||null;
  }
  function nextForCourt(courtId,current){
    return matches().filter(m=>m.courtId===courtId&&m.id!==current?.id&&["wait","scheduled","ready"].includes(m.status)).sort((a,b)=>queueRank(a)-queueRank(b)||String(a.scheduledAt||"").localeCompare(String(b.scheduledAt||"")))[0]||null;
  }

  function card(c){
    const m=activeForCourt(c.id),next=nextForCourt(c.id,m);
    if(!m)return '<article class="tv-court"><header class="tv-court-head"><div><span>SÂN</span><h2>'+esc(c.name)+'</h2></div><b class="tv-state">TRỐNG</b></header><div class="tv-match"><div class="tv-team"><small>TRẠNG THÁI</small><strong>Sẵn sàng nhận trận</strong></div><div class="tv-vs">🏟</div><div class="tv-team right"><small>TIẾP THEO</small><strong>'+esc(next?team(next.a)+" vs "+team(next.b):"Chưa xếp")+'</strong></div></div><footer class="tv-court-foot"><span>Pickleup.vn</span><b>COURT READY</b><span></span></footer></article>';
    const q=m.status==="live"?"live":m.status==="done"?"done":m.courtState||"scheduled",meta=qMeta(q),isLive=m.status==="live";
    const d=division(m),serve=m.servingSide||"A",server=Number(m.serverNumber||2),mode=d?.scoringMode||"side_out";
    const score=isLive?'<div class="tv-score"><b>'+Number(m.current?.[0]||0)+'</b><i>:</i><b>'+Number(m.current?.[1]||0)+'</b></div>':'<div class="tv-vs">VS</div>';
    const serveText=isLive?'<span class="serve-dot"></span>'+(serve==="A"?team(m.a):team(m.b))+(mode==="side_out"?" · S"+server:""):'';
    return '<article class="tv-court '+(isLive?"live":"")+'">'+
      '<header class="tv-court-head"><div><span>SÂN</span><h2>'+esc(c.name)+'</h2></div><b class="tv-state '+meta[1]+'">'+meta[0]+'</b></header>'+
      '<div class="tv-match"><div class="tv-team"><small>ĐỘI A</small><strong>'+esc(team(m.a))+'</strong></div>'+score+'<div class="tv-team right"><small>ĐỘI B</small><strong>'+esc(team(m.b))+'</strong></div></div>'+
      '<footer class="tv-court-foot"><span>'+esc(m.stage||d?.name||"Trận đấu")+'</span><b>'+serveText+'</b><span class="tv-next">'+(next?"Tiếp: "+esc(team(next.a))+" vs "+esc(team(next.b)):"")+'</span></footer></article>';
  }

  function render(){
    renderSelect();
    const t=state.tournaments.find(x=>x.id===tournamentId);
    $("#boardTournament").textContent=t?.name||"LIVE COURT BOARD";
    $("#boardMeta").textContent=t?(t.venue||"")+" · "+(t.date||""):"Chưa có giải công khai";
    const cs=courts(),grid=$("#courtGrid"),empty=$("#boardEmpty");
    grid.innerHTML=cs.map(card).join("");empty.hidden=cs.length>0;

    const called=matches().filter(m=>["called","on_deck","warming_up"].includes(m.courtState)&&m.status!=="live").sort((a,b)=>queueRank(a)-queueRank(b));
    const ticker=$("#callTicker");
    if(called.length){
      ticker.hidden=false;
      ticker.textContent=called.map(m=>{const c=state.courts.find(x=>x.id===m.courtId),q=qMeta(m.courtState)[0];return q+": "+team(m.a)+" vs "+team(m.b)+" → "+(c?.name||"sân")}).join("   •   ");
    }else{ticker.hidden=true;ticker.textContent=""}
  }

  async function refresh(){
    try{
      state=await API.publicState();
      if(!tournamentId||!state.tournaments.some(t=>t.id===tournamentId))tournamentId=chooseTournament();
      render();
    }catch(e){$("#boardConnection").textContent="● OFFLINE";$("#boardConnection").classList.add("offline")}
  }
  function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,180)}

  $("#tournamentSelect").onchange=e=>{
    tournamentId=e.target.value;
    const url=new URL(location.href);url.searchParams.set("tournament",tournamentId);history.replaceState(null,"",url);
    render();
  };
  $("#fullscreenBtn").onclick=async()=>{try{document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen()}catch{}};
  setInterval(()=>{$("#boardClock").textContent=new Date().toLocaleTimeString("vi-VN",{hour12:false})},1000);

  refresh().then(()=>{
    const socket=window.io?.();
    socket?.on("connect",()=>{$("#boardConnection").textContent="● LIVE";$("#boardConnection").classList.remove("offline")});
    socket?.on("disconnect",()=>{$("#boardConnection").textContent="● OFFLINE";$("#boardConnection").classList.add("offline")});
    socket?.on("public:state",schedule);socket?.on("match:update",schedule);
  });
})();