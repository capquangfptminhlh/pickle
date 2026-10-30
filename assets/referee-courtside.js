(()=>{
  const API=window.PickleAPI;
  const $=s=>document.querySelector(s);
  let state={tournaments:[],divisions:[],courts:[],teams:[],players:[],teamPlayers:{},teamLineupSources:{},matches:[]},user=null,activeId=null,busy=false,refreshTimer=null,refreshVersion=0;
  let socketConnected=false,lastRefreshOk=false;
  const REFEREE_SYNC_INTERVAL_MS=15000;
  function updateConnectionStatus(){
    const label=$("#connectionState");
    if(!lastRefreshOk){label.textContent="Mất kết nối";label.className="connection-pill offline"}
    else if(socketConnected){label.textContent="Realtime";label.className="connection-pill live"}
    else {label.textContent="Tự đồng bộ 15 giây";label.className="connection-pill"}
  }
  let lastScore=null;
  const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const team=id=>state.teams.find(t=>t.id===id)?.name||(id==="TBD"||!id?"Chưa xác định":id);
  const stage=m=>(m?.bracketSlot?"Serie "+(m.bracketSeries==="B"||String(m.bracketSlot).startsWith("B-")?"B":"A")+" · ":"")+(m?.stage||"Trận đấu");
  const division=m=>state.divisions.find(d=>d.id===m?.divisionId);
  const court=m=>state.courts.find(c=>c.id===m?.courtId)?.name||(m?.court&&m.court!=="—"?"Sân "+m.court:"Chưa gán sân");
  const queueMeta=s=>({scheduled:["CHỜ","scheduled"],called:["ĐANG GỌI","called"],on_deck:["ON DECK","on_deck"],warming_up:["KHỞI ĐỘNG","warming_up"],live:["ĐANG ĐẤU","live"],done:["HOÀN TẤT","done"]}[s]||["CHỜ","scheduled"]);
  const queueRank=m=>m.status==="live"?0:m.courtState==="warming_up"?1:m.courtState==="on_deck"?2:m.courtState==="called"?3:m.status==="wait"?4:5;
  const toast=msg=>{const el=$("#refToast");el.textContent=msg;el.hidden=false;window.PickleMotion?.entrance(el,{key:"referee-toast",y:8,duration:.18,stagger:0});clearTimeout(el._timer);el._timer=setTimeout(()=>el.hidden=true,2600)};
  const roleLabel=r=>({super_admin:"Super Admin",organizer:"Chủ giải",referee:"Trọng tài"}[r]||r);
  const playerName=player=>player?.full_name||player?.nickname||"VĐV";
  const initials=player=>playerName(player).trim().split(/\s+/).slice(-2).map(part=>part[0]||"").join("").toUpperCase()||"VĐV";
  const teamPlayers=id=>(state.teamPlayers?.[id]||[]).map(playerId=>state.players?.find(player=>player.id===playerId)).filter(Boolean);
  const athleteAvatar=player=>player.avatar_url
    ?'<img src="'+esc(player.avatar_url)+'" alt="" loading="lazy" decoding="async">'
    :'<span class="picker-athlete-fallback" aria-hidden="true">'+esc(initials(player))+'</span>';
  const pickerSide=id=>'<div class="picker-side"><strong>'+esc(team(id))+'</strong>'+(teamPlayers(id).length?'<span class="picker-athletes">'+teamPlayers(id).map(player=>'<span class="picker-athlete">'+athleteAvatar(player)+'<span>'+esc(playerName(player))+'</span></span>').join("")+'</span>':'')+'</div>';

  function orderedMatches(){
    return [...state.matches].filter(m=>m.status!=="cancelled").sort((a,b)=>queueRank(a)-queueRank(b)||String(a.scheduledAt||"").localeCompare(String(b.scheduledAt||"")));
  }

  function renderSummary(){
    const rows=orderedMatches(),live=rows.filter(m=>m.status==="live").length,pending=rows.filter(m=>m.status==="wait").length;
    $("#refSummary").innerHTML=
      '<article><small>TÀI KHOẢN</small><strong>'+esc(user?.name||roleLabel(user?.role)||"—")+'</strong></article>'+
      '<article><small>ĐANG LIVE</small><strong>'+live+'</strong></article>'+
      '<article><small>CHỜ XỬ LÝ</small><strong>'+pending+'</strong></article>';
  }

  function card(m){
    const q=m.status==="live"?"live":m.status==="done"?"done":m.courtState||"scheduled",meta=queueMeta(q);
    const d=division(m),sets=(m.sets||[]).map(s=>s.join("-")).join(" · ");
    const next={scheduled:["called","📣 Gọi VĐV"],called:["on_deck","⏭ On deck"],on_deck:["warming_up","🔥 Khởi động"]}[q];
    return '<article class="picker-card '+(m.status==="live"?"live":"")+'" data-open="'+esc(m.id)+'">'+
      '<div class="picker-top"><span>'+esc(court(m))+' · '+esc(stage(m))+'</span><b class="queue-badge '+meta[1]+'">'+meta[0]+'</b></div>'+
      '<div class="picker-vs">'+pickerSide(m.a)+'<i>VS</i>'+pickerSide(m.b)+'</div>'+
      '<div class="picker-actions">'+(sets?'<span>Kết quả: '+esc(sets)+'</span>':'<span>'+esc(m.time||"Chưa chốt giờ")+'</span>')+
      (next&&m.status==="wait"?'<button type="button" class="queue-advance" data-queue-match="'+esc(m.id)+'" data-queue-state="'+next[0]+'">'+next[1]+'</button>':'')+
      '</div></article>';
  }

  function renderPicker(){
    const rows=orderedMatches();
    $("#matchPicker").innerHTML=rows.length?rows.map(card).join(""):'<div class="empty-ref"><b>Chưa có trận được phân công.</b><br>Danh sách sẽ tự xuất hiện khi BTC gán trận cho tài khoản này.</div>';
  }

  function setDisabled(selector,disabled){document.querySelectorAll(selector).forEach(x=>x.disabled=disabled)}
  function activeMatch(){return state.matches.find(m=>m.id===activeId)||null}
  function enableDirectServerPicker(element,side,serve,server,disabled){
    element?.querySelectorAll(".lineup-player").forEach((row,index)=>{
      const number=index+1,name=row.querySelector(".lineup-name")?.textContent||"VĐV";
      row.dataset.servicePlayer=side;row.dataset.serverNumber=String(number);row.setAttribute("role","button");
      row.setAttribute("aria-disabled",String(disabled));row.setAttribute("aria-pressed",String(!disabled&&side===serve&&number===server));
      row.tabIndex=disabled?-1:0;row.title=disabled?"Không thể đổi người giao lúc này":`Chọn ${name} giao bóng · Bên ${side} · Ô ${number}`;
    });
  }

  function renderScore(){
    const m=activeMatch();
    if(!m){showPicker();return}
    const d=division(m),rule={...d,...m.matchRules},a=Number(m.current?.[0]||0),b=Number(m.current?.[1]||0),locked=["done","completed","walkover","cancelled"].includes(m.status)||Boolean(m.winner);
    const awaitingDraw=window.PickleTeamLineup?.awaitingDraw(d,m);
    window.PickleTeamLineup?.renderDrawPanel($("#refRelayDrawPanel"),$("#refRelayDrawButton"),m,d,state);
    const target=Number(rule.pointsToWin||11),winByTwo=rule.winByTwo!==false,hi=Math.max(a,b),lo=Math.min(a,b),setWon=window.PickleMatchFormat?window.PickleMatchFormat.gameWon(a,b,target,winByTwo):(a!==b&&hi>=target&&(!winByTwo||hi-lo>=2));
    const winsA=(m.sets||[]).filter(s=>Number(s[0])>Number(s[1])).length,winsB=(m.sets||[]).filter(s=>Number(s[1])>Number(s[0])).length,need=Math.ceil(Number(rule.bestOf||1)/2);
    const matchWon=setWon&&(a>b?winsA+1:winsB+1)>=need;
    const isDoubles=["doubles","mixed_doubles","team"].includes(d?.eventType),mode=d?.scoringMode||"side_out",serve=m.servingSide||"A",server=Number(m.serverNumber||(isDoubles?2:1));
    const q=m.status==="live"?"live":m.status==="done"?"done":m.courtState||"scheduled",qm=queueMeta(q);

    $("#courtLabel").textContent=court(m);
    $("#stageLabel").textContent=stage(m);
    $("#queueLabel").textContent=qm[0];$("#queueLabel").className="queue-pill "+qm[1];
    const lineupA=window.PickleTeamLineup?.match(m.a,d,a,b,state,m),lineupB=window.PickleTeamLineup?.match(m.b,d,a,b,state,m);
    $("#refTeamA").textContent=locked?team(m.a):(lineupA?.label||team(m.a));$("#refTeamB").textContent=locked?team(m.b):(lineupB?.label||team(m.b));
    window.PickleTeamLineup?.renderRoster($("#refRosterA"),lineupA,!locked&&serve==="A"?server:0,locked);
    window.PickleTeamLineup?.renderRoster($("#refRosterB"),lineupB,!locked&&serve==="B"?server:0,locked);
    enableDirectServerPicker($("#refRosterA"),"A",serve,server,locked||awaitingDraw);
    enableDirectServerPicker($("#refRosterB"),"B",serve,server,locked||awaitingDraw);
    const specialResult=Boolean(m.winner&&m.resultReason);
    const finalScore=m.winner&&!specialResult&&(m.sets||[]).length?m.sets[m.sets.length-1]:null;
    $("#refScoreA").textContent=specialResult?"—":finalScore?finalScore[0]:a;$("#refScoreB").textContent=specialResult?"—":finalScore?finalScore[1]:b;
    for(const side of ["A","B"]){const score=$("#refScore"+side);score.dataset.digits=Math.min(5,score.textContent.length)}
    $("#refRules").innerHTML=d?[
      ["Điểm thắng","Chạm "+target],["Số set",rule.bestOf===1?"1 set":`Best of ${rule.bestOf}`],
      ["Cách biệt",winByTwo?"Cách 2":"Không cách 2"],
      ["Thể thức",Number(rule.bestOf||1)===1?"1 game":"Thắng "+need+"/"+Number(rule.bestOf||1)]
    ].map(([label,value])=>'<div class="ref-rule"><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div>').join(""):'<span>Luật đang cập nhật</span>';
    $("#refGameLabel").textContent=locked?"KẾT QUẢ TRẬN":"GAME "+((m.sets||[]).length+1);
    $("#refGameWins").textContent="GAME THẮNG · A "+winsA+" : "+winsB+" B";
    document.querySelectorAll(".ref-team-card").forEach(card=>{
      const side=card.classList.contains("team-a")?"A":"B";
      card.querySelector(".ref-serving").hidden=locked||awaitingDraw||side!==serve;
    });
    $("#modeBanner").textContent=(mode==="rally"?"Rally":"Side-out")+(d?.finalPointOnServe?" · điểm "+target+" phải cầm giao":"");
    const leg=window.PickleTeamLineup?.legText(m.a,m.b,d,a,b,state,m)||window.PickleMatchFormat?.legText(a,b,d)||"";$("#legBanner").hidden=locked||!leg;$("#legBanner").textContent=leg;
    $(".serve-banner>span").textContent=locked?"ĐÃ CHỐT":"ĐANG GIAO";
    const servingLineup=serve==="A"?lineupA:lineupB,servingPlayer=servingLineup?.players?.[server-1];
    const servingName=servingLineup?.ready&&!awaitingDraw?(servingLineup.names?.[server-1]||servingPlayer?.full_name||servingPlayer?.nickname||""):"";
    $("#serveBanner").textContent=awaitingDraw?"Bốc thăm cặp trước khi bắt đầu":m.winner?team(m.winner)+" · thắng trận":(servingLineup?.label||team(serve==="A"?m.a:m.b))+" · Người giao "+server+(servingName?" · "+servingName:"");
    window.PickleTimeoutClock?.attach($("#refTimeoutClock"),m);
    const timeoutMax=window.PickleMatchFormat?.timeoutLimit(d)||2;$("#refTimeoutA").textContent=Number(m.timeouts?.A||0)+"/"+timeoutMax;$("#refTimeoutB").textContent=Number(m.timeouts?.B||0)+"/"+timeoutMax;
    $("#refMedicalA").textContent=Number(m.medicalTimeouts?.A||0)+"/1";$("#refMedicalB").textContent=Number(m.medicalTimeouts?.B||0)+"/1";
    $("#setHistory").innerHTML=(m.sets||[]).length?(m.sets||[]).map((s,i)=>'<span>Set '+(i+1)+': '+s[0]+'–'+s[1]+'</span>').join(""):'<span>Chưa có set hoàn tất</span>';

    document.querySelectorAll("[data-service]").forEach(btn=>{
      const side=btn.dataset.service,no=Number(btn.dataset.server);
      const selected=side===serve&&server===no;
      btn.classList.toggle("active",selected);btn.setAttribute("aria-pressed",String(selected));
      btn.disabled=locked||awaitingDraw||(!isDoubles&&no===2);
    });
    document.querySelectorAll("[data-timeout]").forEach(btn=>{
      const side=btn.dataset.timeout,kind=btn.dataset.kind,used=Number((kind==="medical"?m.medicalTimeouts:m.timeouts)?.[side]||0),limit=kind==="medical"?1:timeoutMax;
      btn.disabled=locked||awaitingDraw||used>=limit;
    });
    setDisabled("[data-rally]",locked||awaitingDraw||setWon);
    document.querySelectorAll("[data-correct]").forEach(btn=>{const side=btn.dataset.correct,val=side==="A"?a:b;btn.disabled=locked||awaitingDraw||setWon||(Number(btn.dataset.delta)<0&&val<=0)});
    $("#resetMatchBtn").disabled=m.status==="cancelled";
    $("#undoBtn").disabled=m.status==="cancelled";
    $("#finishSetBtn").disabled=locked||!setWon||matchWon;
    $("#finishMatchBtn").disabled=locked||!matchWon;
    $("#serverHelp").textContent=mode==="rally"?"Đội thắng rally nhận quyền giao":isDoubles?"Người giao 1 → người giao 2 → đổi bên giao":"Chỉ bên giao bóng được ghi điểm";

    const hint=$("#scoreHint");
    if(m.winner){
      const reason={walkover:"Thắng không thi đấu",no_show:"Đối thủ vắng mặt",retired:"Đối thủ bỏ cuộc",injury:"Đối thủ chấn thương",disqualified:"Đối thủ bị loại"}[m.resultReason]||"Kết quả đặc biệt";
      hint.hidden=false;hint.textContent="Thắng trận · "+team(m.winner)+" · "+(specialResult?reason:(m.sets||[]).map(s=>s.join("–")).join(" / "));
    }else if(setWon){
      hint.hidden=false;
      hint.textContent=(a>b?team(m.a):team(m.b))+" đã đủ điều kiện thắng "+(matchWon?"trận":"set")+" "+hi+"–"+lo+".";
    }else{hint.hidden=true;hint.textContent=""}

    const next={id:m.id,version:m.version,a,b,sets:(m.sets||[]).length,winner:m.winner||null,serve,server,hint:hint.textContent};
    const previous=lastScore;lastScore=next;
    if(previous?.id===next.id&&previous.version!==next.version){
      // Animate confirmed state only. A new game resets scores without a point flash.
      if(previous.sets===next.sets&&!m.winner){
        for(const side of ["A","B"]){
          const key=side.toLowerCase(),delta=next[key]-previous[key];
          if(!delta)continue;
          const score=$("#refScore"+side),feedback=score.parentElement.querySelector(".ref-point-feedback");
          window.PickleMotion?.scoreChange(score,delta);
          feedback.textContent=(delta>0?"+":"")+delta;
        }
      }
      const reversing=$("#scoreSurface").dataset.motionDirection==="reverse";
      if(next.sets>previous.sets&&!reversing&&!next.winner){
        const last=m.sets[m.sets.length-1];
        window.PickleMotion?.setWin($("#setHistory"),Number(last[0])>Number(last[1])?"#bcff37":"#4dd0ff");
      }
      if(previous.serve!==serve||previous.server!==server){
        window.PickleMotion?.serviceChange(document.querySelector(`[data-service-player="${serve}"][data-server-number="${server}"]`),$("#serveBanner"),serve==="A"?"#bcff37":"#4dd0ff");
      }
      if(!previous.winner&&next.winner&&!reversing)window.PickleMotion?.matchWin(hint,next.winner===m.a?"#bcff37":"#4dd0ff");
      if(previous.a!==a||previous.b!==b||previous.sets!==next.sets||previous.winner!==next.winner||previous.serve!==serve||previous.server!==server){
        $("#refAnnouncement").textContent=m.winner?hint.textContent:"Điểm đội A "+a+", đội B "+b+". "+$("#serveBanner").textContent;
      }
    }
  }

  function showScore(id){
    lastScore=null;
    activeId=id;
    const url=new URL(location.href);url.searchParams.set("match",id);history.replaceState(null,"",url);
    $("#refSummary").hidden=true;$("#matchPicker").hidden=true;$("#scoreSurface").hidden=false;
    renderScore();scrollTo({top:0,behavior:"instant"});
    window.PickleMotion?.entrance($(".ref-score-grid"),{duration:.26});
  }
  function showPicker(){
    window.PickleTimeoutClock?.detach($("#refTimeoutClock"));
    lastScore=null;
    activeId=null;
    const url=new URL(location.href);url.searchParams.delete("match");history.replaceState(null,"",url);
    $("#scoreSurface").hidden=true;$("#refSummary").hidden=false;$("#matchPicker").hidden=false;
    renderSummary();renderPicker();scrollTo({top:0,behavior:"instant"});
  }

  async function refresh({quiet=false}={}){
    if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=null}
    const version=++refreshVersion;
    try{
      const next=await API.adminState();
      if(version!==refreshVersion)return;
      state=next;lastRefreshOk=true;
      renderSummary();renderPicker();
      if(activeId){
        if(activeMatch())renderScore();else showPicker();
      }
      updateConnectionStatus();
    }catch(e){
      if(version===refreshVersion&&e.message!=="AUTH_REQUIRED"){
        lastRefreshOk=false;updateConnectionStatus();
        if(!quiet)toast("Không thể tải dữ liệu. Giữ điểm xác nhận gần nhất.");
      }
    }
  }
  function scheduleRefresh(delay=180){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh({quiet:true}),delay)}

  function applyMatchUpdate(updated){
    const index=state.matches.findIndex(match=>match.id===updated?.id);
    if(index<0)return false;
    state.matches[index]={...state.matches[index],...updated};
    renderSummary();renderPicker();
    if(activeId===updated.id)renderScore();
    return true;
  }

  async function action(fn,success,reverse=false){
    if(busy)return;busy=true;
    if(reverse)$("#scoreSurface").dataset.motionDirection="reverse";
    if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=null}
    refreshVersion++;
    try{
      const updated=await fn();
      if(applyMatchUpdate(updated))scheduleRefresh(650);else await refresh({quiet:true});
      lastRefreshOk=true;updateConnectionStatus();
      if(success)toast(success);
    }
    catch(e){
      if(e.message==="VERSION_CONFLICT"){await refresh({quiet:true});toast("Điểm đã đổi từ thiết bị khác. Đã đồng bộ lại.");}
      else toast({RELAY_LINEUP_REQUIRED:"Chưa xác định vị trí A/B/C. BTC cần xác nhận thứ tự thành viên hoặc nhập đúng Trình trước khi bốc thăm.",RELAY_PARTICIPANTS_REQUIRED:"Mỗi đội cần đúng 3 VĐV đang hoạt động trước khi bốc thăm.",RELAY_DRAW_REQUIRED:"Bốc thăm cặp của hai đội trước khi nhập điểm.",RELAY_DRAW_LOCKED:"Trận đã có lịch sử thi đấu, không thể bốc thăm lại.",RELAY_DRAW_UNSUPPORTED:"Chỉ bốc thăm cặp cho MLP 3 người chạy điểm.",COURT_BUSY:"Sân đang có trận thi đấu hoặc khởi động. Chờ sân trống hoặc báo BTC đổi sân.",PLAYER_BUSY:"Có VĐV đang thi đấu ở trận khác. Báo BTC kiểm tra lịch.",SET_ALREADY_WON:"Set đã đủ điểm thắng. Hãy chốt set.",TIMEOUT_LIMIT:"Đội đã dùng đủ timeout.",MEDICAL_TIMEOUT_LIMIT:"Đội đã dùng medical timeout.",NOTHING_TO_UNDO:"Không còn thao tác để Undo.",NOTHING_TO_RESET:"Trận chưa có dữ liệu để đặt lại.",RESET_HISTORY_UNAVAILABLE:"Lịch sử trận không đủ để đặt lại an toàn.",DOWNSTREAM_MATCH_LOCKED:"Trận nhánh sau đã bắt đầu nên không thể đặt lại kết quả."}[e.message]||"Không thể thực hiện: "+e.message);
    }finally{busy=false;delete $("#scoreSurface").dataset.motionDirection}
  }

  document.addEventListener("click",e=>{
    const player=e.target.closest("[data-service-player]");
    if(player&&player.getAttribute("aria-disabled")!=="true"){
      const m=activeMatch(),name=player.querySelector(".lineup-name")?.textContent||"VĐV";
      if(m)return action(()=>API.service(m.id,{side:player.dataset.servicePlayer,serverNumber:Number(player.dataset.serverNumber),expectedVersion:m.version}),`Đã chọn ${name} giao bóng.`);
    }
    const queue=e.target.closest("[data-queue-match]");
    if(queue){e.preventDefault();e.stopPropagation();const m=state.matches.find(x=>x.id===queue.dataset.queueMatch);if(m)return action(()=>API.setCourtState(m.id,{courtState:queue.dataset.queueState,expectedVersion:m.version}),"Đã cập nhật điều phối sân.");}
    const open=e.target.closest("[data-open]");if(open)return showScore(open.dataset.open);
    const rally=e.target.closest("[data-rally]");if(rally){const m=activeMatch();if(m)return action(()=>API.rally(m.id,{side:rally.dataset.rally,expectedVersion:m.version}));}
    const correct=e.target.closest("[data-correct]");if(correct){const m=activeMatch();if(m)return action(()=>API.point(m.id,{side:correct.dataset.correct,delta:Number(correct.dataset.delta),expectedVersion:m.version}));}
    const service=e.target.closest("[data-service]");if(service){const m=activeMatch();if(m)return action(()=>API.service(m.id,{side:service.dataset.service,serverNumber:Number(service.dataset.server),expectedVersion:m.version}));}
    const timeout=e.target.closest("[data-timeout]");if(timeout){const m=activeMatch();if(m)return action(()=>API.timeout(m.id,{side:timeout.dataset.timeout,kind:timeout.dataset.kind,expectedVersion:m.version}),timeout.dataset.kind==="medical"?"Đã ghi medical timeout.":"Đã ghi timeout.");}
  });
  document.addEventListener("keydown",e=>{
    const player=e.target.closest?.("[data-service-player]");
    if(player&&player.getAttribute("aria-disabled")!=="true"&&(e.key==="Enter"||e.key===" ")){e.preventDefault();player.click()}
  });

  $("#refRelayDrawButton").onclick=()=>{const m=activeMatch();if(m)action(()=>API.relayDraw(m.id,{expectedVersion:m.version}),"Đã bốc thăm và áp dụng cùng thứ tự cặp cho hai đội.")};
  $("#backToMatches").onclick=showPicker;
  $("#refreshBtn").onclick=()=>refresh();
  $("#resetMatchBtn").onclick=()=>{
    const m=activeMatch();
    if(m&&confirm("Đặt lại toàn bộ điểm, set và kết quả của trận này? Bạn vẫn có thể bấm Undo ngay sau đó để khôi phục."))action(()=>API.resetMatch(m.id,{expectedVersion:m.version}),"Đã đặt lại trận về ban đầu.",true);
  };
  $("#undoBtn").onclick=()=>{const m=activeMatch();if(m)action(()=>API.undo(m.id,{expectedVersion:m.version}),"Đã Undo.",true)};
  $("#finishSetBtn").onclick=()=>{const m=activeMatch();if(m)action(()=>API.finishSet(m.id,{expectedVersion:m.version}),"Đã chốt set.")};
  $("#finishMatchBtn").onclick=()=>{const m=activeMatch();if(m&&confirm("Kết thúc và chốt kết quả trận này?"))action(()=>API.finishMatch(m.id,{expectedVersion:m.version}),"Đã chốt trận.")};

  async function init(){
    try{
      const me=await API.me();user=me.user;
      if(!["super_admin","organizer","referee"].includes(user?.role)){location.href="admin.html";return}
      await refresh({quiet:true});
      const requested=new URLSearchParams(location.search).get("match");
      if(requested&&state.matches.some(m=>m.id===requested))showScore(requested);else showPicker();
      const socket=window.io?.();
      socket?.on("connect",()=>{socketConnected=true;updateConnectionStatus();scheduleRefresh()});
      socket?.on("disconnect",()=>{socketConnected=false;updateConnectionStatus()});
      socket?.on("public:state",scheduleRefresh);socket?.on("match:update",scheduleRefresh);
      // The referee screen can stay open for an entire tournament. Socket
      // disconnects and mobile sleep must not leave a stale scoring version.
      // Never fetch while a point/service/Undo mutation is in flight.
      const syncIfIdle=()=>{if(!busy&&document.visibilityState==="visible")refresh({quiet:true})};
      setInterval(syncIfIdle,REFEREE_SYNC_INTERVAL_MS);
      document.addEventListener("visibilitychange",syncIfIdle);
    }catch(e){
      if(e.message!=="AUTH_REQUIRED")location.href="login.html?next=referee.html";
    }
  }
  init();
})();
