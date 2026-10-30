(()=>{
  const API=window.PickleAPI,$=s=>document.querySelector(s);
  let state={tournaments:[],divisions:[],courts:[],teams:[],matches:[]},tournamentId="",refreshTimer=null,internalMode=false,initializedCalls=false,refreshVersion=0,socketConnected=false,hasFreshState=false;
  const POLL_INTERVAL_MS=15000;
  function connectionStatus(ok){
    const el=$("#boardConnection");
    el.textContent=!ok?"● Mất kết nối":socketConnected?"● Trực tiếp":"● Tự cập nhật 15 giây";
    el.classList.toggle("offline",!ok);
  }
  const announced=new Set();
  const renderedPlacements=new Map();
  let voiceEnabled=localStorage.getItem("pickle-board-voice")==="1";

  const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const team=id=>state.teams.find(t=>t.id===id)?.name||(id==="TBD"||!id?"Chưa xác định":id);
  const stage=m=>(m?.bracketSlot?"Serie "+(m.bracketSeries==="B"||String(m.bracketSlot).startsWith("B-")?"B":"A")+" · ":"")+(m?.stage||"Trận đấu");
  const division=m=>state.divisions.find(d=>d.id===m.divisionId);
  const queueRank=m=>m.status==="live"?0:m.courtState==="warming_up"?1:m.courtState==="on_deck"?2:m.courtState==="called"?3:m.status==="wait"?4:5;
  const qMeta=s=>({live:["ĐANG ĐẤU","live"],warming_up:["KHỞI ĐỘNG","warming_up"],on_deck:["ON DECK","on_deck"],called:["ĐANG GỌI VĐV","called"],scheduled:["CHỜ","scheduled"],done:["HOÀN TẤT","done"]}[s]||["CHỜ","scheduled"]);
  const matchLineup=(m,id)=>window.PickleTeamLineup?.match(id,division(m),Number(m.current?.[0]||0),Number(m.current?.[1]||0),state,m);
  const matchTeam=(m,id)=>m.winner||["done","completed","walkover","cancelled"].includes(m.status)?team(id):(matchLineup(m,id)?.label||team(id));
  const matchRoster=(m,id)=>{const lineup=matchLineup(m,id);return lineup?.relay&&lineup.text?'<small class="tv-team-roster">Đội: '+esc(lineup.text)+'</small>':''};

  function divisionIds(){return new Set(state.divisions.filter(d=>d.tournamentId===tournamentId).map(d=>d.id))}
  function matches(){const ids=divisionIds();return state.matches.filter(m=>ids.has(m.divisionId)&&m.status!=="cancelled")}
  function courts(){return state.courts.filter(c=>c.tournamentId===tournamentId&&c.active!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)||String(a.name).localeCompare(String(b.name),"vi"))}
  function tournament(){return state.tournaments.find(t=>t.id===tournamentId)}
  function isTournamentPublic(){return tournament()?.publicVisible!==false}

  function chooseTournament(){
    const query=new URLSearchParams(location.search).get("tournament");
    const available=state.tournaments;
    if(query&&available.some(t=>t.id===query))return query;
    const activeStates=new Set(["live","called","on_deck","warming_up"]);
    const ranked=available.map((t,index)=>{
      const ids=new Set(state.divisions.filter(d=>d.tournamentId===t.id).map(d=>d.id));
      const terminalStates=new Set(["done","completed","walkover","cancelled"]);
      const tournamentMatches=state.matches.filter(m=>ids.has(m.divisionId)&&!terminalStates.has(m.status)&&!m.winner);
      const running=tournamentMatches.filter(m=>m.status==="live"||m.courtState==="live").length;
      const queued=tournamentMatches.filter(m=>activeStates.has(m.courtState)&&m.status!=="live").length;
      const statusLive=["live","ongoing","in_progress"].includes(String(t.status||"").toLowerCase())?1:0;
      const assigned=tournamentMatches.filter(m=>m.courtId).length;
      const activeCourts=state.courts.filter(c=>c.tournamentId===t.id&&c.active!==false).length;
      return {id:t.id,index,priority:[running,queued,statusLive,assigned,activeCourts]};
    }).sort((a,b)=>{
      for(let i=0;i<a.priority.length;i++)if(a.priority[i]!==b.priority[i])return b.priority[i]-a.priority[i];
      return a.index-b.index;
    });
    return ranked[0]?.id||"";
  }

  function renderSelect(){
    const select=$("#tournamentSelect");
    select.innerHTML=state.tournaments.map(t=>'<option value="'+esc(t.id)+'" '+(t.id===tournamentId?"selected":"")+'>'+esc(t.name)+'</option>').join("");
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
    if(!m)return '<article data-motion-key="court:'+esc(c.id)+'" class="tv-court"><header class="tv-court-head"><div><span>SÂN</span><h2>'+esc(c.name)+'</h2></div><b class="tv-state">TRỐNG</b></header><div class="tv-match"><div class="tv-team"><small>TRẠNG THÁI</small><strong>Sẵn sàng nhận trận</strong></div><div class="tv-vs">🏟</div><div class="tv-team right"><small>TIẾP THEO</small><strong>'+esc(next?team(next.a)+" vs "+team(next.b):"Chưa xếp")+'</strong></div></div><footer class="tv-court-foot"><span>Pickleup.vn</span><b>COURT READY</b><span></span></footer></article>';
    const q=m.status==="live"?"live":m.status==="done"?"done":m.courtState||"scheduled",meta=qMeta(q),isLive=m.status==="live";
    const d=division(m),serve=m.servingSide||"A",server=Number(m.serverNumber||2),mode=d?.scoringMode||"side_out";
    const score=isLive?'<div class="tv-score"><b>'+Number(m.current?.[0]||0)+'</b><i>:</i><b>'+Number(m.current?.[1]||0)+'</b></div>':'<div class="tv-vs">VS</div>';
    const serveText=isLive?'<span class="serve-dot"></span>'+(serve==="A"?matchTeam(m,m.a):matchTeam(m,m.b))+(mode==="side_out"?" · S"+server:""):'';
    const qr=isTournamentPublic()?'<button class="tv-qr" type="button" data-match-qr="'+esc(m.id)+'">▦ QR</button>':'';
    return '<article data-motion-key="match:'+esc(m.id)+'" class="tv-court '+(isLive?"live":"")+'">'+
      '<header class="tv-court-head"><div><span>SÂN</span><h2>'+esc(c.name)+'</h2></div><div class="tv-head-actions"><b class="tv-state '+meta[1]+'">'+meta[0]+'</b>'+qr+'</div></header>'+
      '<div class="tv-match"><div class="tv-team"><small>ĐỘI A</small><strong>'+esc(matchTeam(m,m.a))+'</strong>'+matchRoster(m,m.a)+'</div>'+score+'<div class="tv-team right"><small>ĐỘI B</small><strong>'+esc(matchTeam(m,m.b))+'</strong>'+matchRoster(m,m.b)+'</div></div>'+
      '<footer class="tv-court-foot"><span>'+esc(stage(m))+'</span><b>'+serveText+'</b><span class="tv-next">'+(next?"Tiếp: "+esc(matchTeam(next,next.a))+" vs "+esc(matchTeam(next,next.b)):"")+'</span></footer></article>';
  }

  function calledMatches(){return matches().filter(m=>m.courtState==="called"&&m.status!=="live").sort((a,b)=>String(a.calledAt||"").localeCompare(String(b.calledAt||"")))}

  function speechText(m){
    const c=state.courts.find(x=>x.id===m.courtId);
    return "Mời "+team(m.a)+" và "+team(m.b)+" di chuyển đến "+(c?.name||"sân thi đấu")+". Xin nhắc lại, "+team(m.a)+" gặp "+team(m.b)+", tại "+(c?.name||"sân thi đấu")+".";
  }
  function speak(m){
    if(!voiceEnabled||!window.speechSynthesis)return;
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(speechText(m));u.lang="vi-VN";u.rate=.9;u.pitch=1;u.volume=1;
    const voices=speechSynthesis.getVoices(),vi=voices.find(v=>/^vi(-|_)/i.test(v.lang));if(vi)u.voice=vi;
    speechSynthesis.speak(u);
  }
  function updateAnnouncements(){
    const called=calledMatches();
    $("#announceNowBtn").hidden=!called.length;
    if(!initializedCalls){called.forEach(m=>announced.add(m.id+":"+(m.calledAt||"called")));initializedCalls=true;return}
    for(const m of called){
      const key=m.id+":"+(m.calledAt||"called");
      if(!announced.has(key)){announced.add(key);speak(m)}
    }
  }

  function render(){
    renderSelect();
    const t=tournament();
    $("#boardTournament").textContent=t?.name||"Bảng gọi sân";
    $("#boardMeta").textContent=t?[(t.venue||""),(t.date||"")].filter(Boolean).join(" · "):(internalMode?"Không có giải trong tài khoản này":"Chưa có giải công khai");
    $("#dataMode").textContent=internalMode?"NỘI BỘ":"CÔNG KHAI";$("#dataMode").classList.toggle("internal",internalMode);
    const cs=courts(),grid=$("#courtGrid"),empty=$("#boardEmpty");
    const oldPositions=new Map([...grid.querySelectorAll("[data-motion-key]")].map(el=>[el.dataset.motionKey,el.getBoundingClientRect()]));
    grid.innerHTML=cs.map(card).join("");empty.hidden=cs.length>0;
    const targets=[],changedIds=[];
    for(const m of matches()){
      const signature=JSON.stringify([m.courtId||null,m.scheduledAt||m.scheduled_at||m.time||""]),previous=renderedPlacements.get(m.id);
      if(previous&&previous.signature!==signature){
        const key="match:"+m.id,element=[...grid.querySelectorAll("[data-motion-key]")].find(el=>el.dataset.motionKey===key),position=oldPositions.get(key);
        if(element&&position){targets.push({element,position});changedIds.push(m.id)}
      }
      renderedPlacements.set(m.id,{signature});
    }
    if(targets.length){
      const before=new Map(targets.map(({element,position})=>[element,position])),elements=targets.map(item=>item.element);
      elements.forEach(el=>el.dataset.motionState="travel");
      window.PickleMotion?.flip?.(before,elements,"court-reassignment-"+changedIds.join("|"));
      setTimeout(()=>elements.forEach(el=>{if(el.dataset.motionState==="travel")delete el.dataset.motionState}),560);
    }
    $("#boardLoginLink").hidden=internalMode||Boolean(state.tournaments.length);
    $("#boardEmptyTitle").textContent=state.tournaments.length?"Chưa có lịch sân":(internalMode?"Chưa có giải trong tài khoản":"Chưa có giải công khai");
    $("#boardEmptyText").textContent=state.tournaments.length?"Hãy xếp sân cho các trận; màn hình sẽ tự cập nhật realtime.":(internalMode?"Tạo giải hoặc kiểm tra quyền tài khoản BTC.":"Đăng nhập BTC để xem trước giải nội bộ, hoặc bật Công khai cho giải.");

    const called=matches().filter(m=>["called","on_deck","warming_up"].includes(m.courtState)&&m.status!=="live").sort((a,b)=>queueRank(a)-queueRank(b));
    const ticker=$("#callTicker");
    if(called.length){
      ticker.hidden=false;
      ticker.textContent=called.map(m=>{const c=state.courts.find(x=>x.id===m.courtId),q=qMeta(m.courtState)[0];return q+": "+team(m.a)+" vs "+team(m.b)+" → "+(c?.name||"sân")}).join("   •   ");
    }else{ticker.hidden=true;ticker.textContent=""}
    updateAnnouncements();
  }

  async function loadState(){
    const internal=await API.optionalAdminState().catch(()=>null);
    if(internal?.tournaments?.length)return {state:internal,internal:true};
    return {state:await API.publicState(),internal:false};
  }
  async function refresh(){
    const version=++refreshVersion;
    try{
      const next=await loadState();
      if(version!==refreshVersion)return;
      state=next.state;internalMode=next.internal;hasFreshState=true;
      if(!tournamentId||!state.tournaments.some(t=>t.id===tournamentId))tournamentId=chooseTournament();
      render();
      connectionStatus(true);
    }catch(e){if(version===refreshVersion)connectionStatus(false)}
  }
  function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,180)}

  async function openQr(matchId){
    const m=state.matches.find(x=>x.id===matchId);if(!m)return;
    try{
      const data=await API.publicMatchQr(matchId);
      $("#qrMatchTitle").textContent=matchTeam(m,m.a)+" vs "+matchTeam(m,m.b);
      $("#qrImage").innerHTML=data.dataUrl?'<img src="'+data.dataUrl+'" alt="QR trận đấu">':'';
      $("#qrOpenLink").href=data.url||("match.html?id="+encodeURIComponent(matchId));
      $("#qrDialog").showModal();
    }catch(e){alert("QR chỉ hoạt động khi giải đã bật Công khai. Anh có thể xem nội bộ trên TV Board sau khi đăng nhập BTC.")}
  }

  $("#tournamentSelect").onchange=e=>{
    tournamentId=e.target.value;
    const url=new URL(location.href);url.searchParams.set("tournament",tournamentId);history.replaceState(null,"",url);render();
  };
  $("#voiceBtn").onclick=()=>{
    voiceEnabled=!voiceEnabled;localStorage.setItem("pickle-board-voice",voiceEnabled?"1":"0");
    $("#voiceBtn").textContent=voiceEnabled?"🔊 Loa đang bật":"🔇 Bật loa";
    if(voiceEnabled){const probe=new SpeechSynthesisUtterance("Đã bật loa gọi sân.");probe.lang="vi-VN";probe.rate=.95;speechSynthesis.speak(probe)}
    else speechSynthesis?.cancel();
  };
  $("#announceNowBtn").onclick=()=>{const m=calledMatches()[0];if(m){if(!voiceEnabled){voiceEnabled=true;localStorage.setItem("pickle-board-voice","1");$("#voiceBtn").textContent="🔊 Loa đang bật"}speak(m)}};
  $("#fullscreenBtn").onclick=async()=>{try{document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen()}catch{}};
  $("#qrCloseBtn").onclick=()=>$("#qrDialog").close();
  document.addEventListener("click",e=>{const b=e.target.closest("[data-match-qr]");if(b)openQr(b.dataset.matchQr)});
  setInterval(()=>{$("#boardClock").textContent=new Date().toLocaleTimeString("vi-VN",{hour12:false})},1000);
  $("#voiceBtn").textContent=voiceEnabled?"🔊 Loa đang bật":"🔇 Bật loa";

  refresh().then(()=>{
    const socket=window.io?.();
    socket?.on("connect",()=>{socketConnected=true;connectionStatus(hasFreshState);schedule()});
    socket?.on("disconnect",()=>{socketConnected=false;connectionStatus(hasFreshState)});
    socket?.on("public:state",schedule);socket?.on("match:update",schedule);
  });
  // Court screens can run for hours without a page reload. A socket may be
  // blocked or silently stall; recheck the authoritative state periodically.
  // Pausing on hidden tabs avoids unnecessary reads, while returning to the
  // display fetches changes missed during sleep.
  setInterval(()=>{if(document.visibilityState==="visible")refresh()},POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refresh()});
})();
