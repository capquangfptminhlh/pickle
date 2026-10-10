(()=>{
  const API=window.PickleAPI;
  const $=s=>document.querySelector(s);
  let state={tournaments:[],divisions:[],courts:[],teams:[],matches:[]},user=null,activeId=null,busy=false,refreshTimer=null,refreshVersion=0;
  let lastScore=null;
  const motionPreference=matchMedia("(prefers-reduced-motion: reduce)"),motions=new Map();
  function motion(el,frames,duration=240){
    if(!el)return;
    motions.get(el)?.cancel();motions.delete(el);
    if(motionPreference.matches||!el.animate)return;
    const animation=el.animate(frames,{duration,easing:"cubic-bezier(.2,.8,.2,1)"});
    motions.set(el,animation);
    animation.finished.then(()=>{if(motions.get(el)===animation)motions.delete(el)},()=>{});
  }
  motionPreference.addEventListener("change",()=>{if(motionPreference.matches){motions.forEach(a=>a.cancel());motions.clear()}});

  const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const team=id=>state.teams.find(t=>t.id===id)?.name||(id==="TBD"||!id?"Chưa xác định":id);
  const division=m=>state.divisions.find(d=>d.id===m?.divisionId);
  const court=m=>state.courts.find(c=>c.id===m?.courtId)?.name||(m?.court&&m.court!=="—"?"Sân "+m.court:"Chưa gán sân");
  const queueMeta=s=>({scheduled:["CHỜ","scheduled"],called:["ĐANG GỌI","called"],on_deck:["ON DECK","on_deck"],warming_up:["KHỞI ĐỘNG","warming_up"],live:["ĐANG ĐẤU","live"],done:["HOÀN TẤT","done"]}[s]||["CHỜ","scheduled"]);
  const queueRank=m=>m.status==="live"?0:m.courtState==="warming_up"?1:m.courtState==="on_deck"?2:m.courtState==="called"?3:m.status==="wait"?4:5;
  const toast=msg=>{const el=$("#refToast");el.textContent=msg;el.hidden=false;motion(el,[{opacity:0,transform:"translate(-50%, 8px)"},{opacity:1,transform:"translate(-50%, 0)"}],180);clearTimeout(el._timer);el._timer=setTimeout(()=>el.hidden=true,2600)};
  const roleLabel=r=>({super_admin:"Super Admin",organizer:"Chủ giải",referee:"Trọng tài"}[r]||r);

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
      '<div class="picker-top"><span>'+esc(court(m))+' · '+esc(m.stage||d?.name||"Trận đấu")+'</span><b class="queue-badge '+meta[1]+'">'+meta[0]+'</b></div>'+
      '<div class="picker-vs"><strong>'+esc(team(m.a))+'</strong><i>VS</i><strong>'+esc(team(m.b))+'</strong></div>'+
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

  function renderScore(){
    const m=activeMatch();
    if(!m){showPicker();return}
    const d=division(m),a=Number(m.current?.[0]||0),b=Number(m.current?.[1]||0),locked=["done","completed","walkover","cancelled"].includes(m.status)||Boolean(m.winner);
    const target=Number(d?.pointsToWin||11),winByTwo=d?.winByTwo!==false,hi=Math.max(a,b),lo=Math.min(a,b),setWon=window.PickleMatchFormat?window.PickleMatchFormat.gameWon(a,b,target,winByTwo):(a!==b&&hi>=target&&(!winByTwo||hi-lo>=2));
    const winsA=(m.sets||[]).filter(s=>Number(s[0])>Number(s[1])).length,winsB=(m.sets||[]).filter(s=>Number(s[1])>Number(s[0])).length,need=Math.ceil(Number(d?.bestOf||3)/2);
    const matchWon=setWon&&(a>b?winsA+1:winsB+1)>=need;
    const isDoubles=["doubles","mixed_doubles","team"].includes(d?.eventType),mode=d?.scoringMode||"side_out",serve=m.servingSide||"A",server=Number(m.serverNumber||(isDoubles?2:1));
    const q=m.status==="live"?"live":m.status==="done"?"done":m.courtState||"scheduled",qm=queueMeta(q);

    $("#courtLabel").textContent=court(m);
    $("#stageLabel").textContent=m.stage||d?.name||"Trận đấu";
    $("#queueLabel").textContent=qm[0];$("#queueLabel").className="queue-pill "+qm[1];
    const lineupA=window.PickleTeamLineup?.match(m.a,d,a,b,state),lineupB=window.PickleTeamLineup?.match(m.b,d,a,b,state);
    $("#refTeamA").textContent=lineupA?.label||team(m.a);$("#refTeamB").textContent=lineupB?.label||team(m.b);
    if($("#refRosterA"))$("#refRosterA").textContent=lineupA?.relay?`Đội: ${team(m.a)}`:"";
    if($("#refRosterB"))$("#refRosterB").textContent=lineupB?.relay?`Đội: ${team(m.b)}`:"";
    const specialResult=Boolean(m.winner&&m.resultReason);
    const finalScore=m.winner&&!specialResult&&(m.sets||[]).length?m.sets[m.sets.length-1]:null;
    $("#refScoreA").textContent=specialResult?"—":finalScore?finalScore[0]:a;$("#refScoreB").textContent=specialResult?"—":finalScore?finalScore[1]:b;
    for(const side of ["A","B"]){const score=$("#refScore"+side);score.dataset.digits=Math.min(5,score.textContent.length)}
    $("#refRules").innerHTML=d?[
      ["Điểm thắng","Chạm "+target],
      ["Cách biệt",winByTwo?"Cách 2":"Không cách 2"],
      ["Thể thức",Number(d.bestOf||3)===1?"1 game":"Thắng "+need+"/"+Number(d.bestOf||3)]
    ].map(([label,value])=>'<div class="ref-rule"><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div>').join(""):'<span>Luật đang cập nhật</span>';
    $("#refGameLabel").textContent=locked?"KẾT QUẢ TRẬN":"GAME "+((m.sets||[]).length+1);
    $("#refGameWins").textContent="GAME THẮNG · A "+winsA+" : "+winsB+" B";
    document.querySelectorAll(".ref-team-card").forEach(card=>{
      const side=card.classList.contains("team-a")?"A":"B";
      card.querySelector(".ref-serving").hidden=locked||side!==serve;
    });
    $("#modeBanner").textContent=(mode==="rally"?"Rally":"Side-out")+(d?.finalPointOnServe?" · điểm "+target+" phải cầm giao":"");
    const leg=window.PickleTeamLineup?.legText(m.a,m.b,d,a,b,state)||window.PickleMatchFormat?.legText(a,b,d)||"";$("#legBanner").hidden=!leg;$("#legBanner").textContent=leg;
    $(".serve-banner>span").textContent=locked?"ĐÃ CHỐT":"ĐANG GIAO";
    $("#serveBanner").textContent=m.winner?team(m.winner)+" · thắng trận":(serve==="A"?(lineupA?.label||team(m.a)):(lineupB?.label||team(m.b)))+(mode==="rally"?" · quyền giao":" · Người giao "+server);
    const timeoutMax=window.PickleMatchFormat?.timeoutLimit(d)||2;$("#refTimeoutA").textContent=Number(m.timeouts?.A||0)+"/"+timeoutMax;$("#refTimeoutB").textContent=Number(m.timeouts?.B||0)+"/"+timeoutMax;
    $("#refMedicalA").textContent=Number(m.medicalTimeouts?.A||0)+"/1";$("#refMedicalB").textContent=Number(m.medicalTimeouts?.B||0)+"/1";
    $("#setHistory").innerHTML=(m.sets||[]).length?(m.sets||[]).map((s,i)=>'<span>Set '+(i+1)+': '+s[0]+'–'+s[1]+'</span>').join(""):'<span>Chưa có set hoàn tất</span>';

    document.querySelectorAll("[data-service]").forEach(btn=>{
      const side=btn.dataset.service,no=Number(btn.dataset.server);
      btn.classList.toggle("active",side===serve&&(mode==="rally"||server===no));
      btn.disabled=locked||(!isDoubles&&no===2)||(mode==="rally"&&no===2);
    });
    document.querySelectorAll("[data-timeout]").forEach(btn=>{
      const side=btn.dataset.timeout,kind=btn.dataset.kind,used=Number((kind==="medical"?m.medicalTimeouts:m.timeouts)?.[side]||0),limit=kind==="medical"?1:timeoutMax;
      btn.disabled=locked||used>=limit;
    });
    setDisabled("[data-rally]",locked||setWon);
    document.querySelectorAll("[data-correct]").forEach(btn=>{const side=btn.dataset.correct,val=side==="A"?a:b;btn.disabled=locked||setWon||(Number(btn.dataset.delta)<0&&val<=0)});
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

    const next={id:m.id,a,b,sets:(m.sets||[]).length,winner:m.winner||null,serve,server,hint:hint.textContent};
    const previous=lastScore;lastScore=next;
    if(previous?.id===next.id){
      // Animate confirmed state only. A new game resets scores without a point flash.
      if(previous.sets===next.sets&&!m.winner){
        for(const side of ["A","B"]){
          const key=side.toLowerCase(),delta=next[key]-previous[key];
          if(!delta)continue;
          const score=$("#refScore"+side),feedback=score.parentElement.querySelector(".ref-point-feedback");
          motion(score,[{transform:"translateY("+(delta>0?"8":"-8")+"px) scale(.94)",opacity:.7},{transform:"translateY(0) scale(1.08)",opacity:1,offset:.55},{transform:"translateY(0) scale(1)",opacity:1}],280);
          feedback.textContent=(delta>0?"+":"")+delta;
          motion(feedback,[{opacity:0,transform:"translateY(4px)"},{opacity:1,transform:"translateY(-4px)",offset:.3},{opacity:0,transform:"translateY(-20px)"}],480);
        }
      }else if(previous.sets!==next.sets)motion($("#setHistory"),[{opacity:.3,transform:"translateY(6px)"},{opacity:1,transform:"translateY(0)"}]);
      if(previous.serve!==serve||previous.server!==server)motion($("#serveBanner"),[{opacity:.4,transform:"translateX(-6px)"},{opacity:1,transform:"translateX(0)"}]);
      if(next.hint&&previous.hint!==next.hint)motion(hint,[{opacity:0,transform:"translateY(8px)"},{opacity:1,transform:"translateY(0)"}]);
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
    motion($(".ref-score-grid"),[{opacity:0,transform:"translateY(12px)"},{opacity:1,transform:"translateY(0)"}],260);
  }
  function showPicker(){
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
      state=next;
      renderSummary();renderPicker();
      if(activeId){
        if(activeMatch())renderScore();else showPicker();
      }
      if(!quiet)$("#connectionState").textContent="Đã cập nhật";
    }catch(e){
      if(version===refreshVersion&&e.message!=="AUTH_REQUIRED")toast("Không thể tải dữ liệu.");
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

  async function action(fn,success){
    if(busy)return;busy=true;
    if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=null}
    refreshVersion++;
    try{
      const updated=await fn();
      if(applyMatchUpdate(updated))scheduleRefresh(650);else await refresh({quiet:true});
      if(success)toast(success);
    }
    catch(e){
      if(e.message==="VERSION_CONFLICT"){await refresh({quiet:true});toast("Điểm đã đổi từ thiết bị khác. Đã đồng bộ lại.");}
      else toast({SET_ALREADY_WON:"Set đã đủ điểm thắng. Hãy chốt set.",TIMEOUT_LIMIT:"Đội đã dùng đủ timeout.",MEDICAL_TIMEOUT_LIMIT:"Đội đã dùng medical timeout.",NOTHING_TO_UNDO:"Không còn thao tác để Undo.",NOTHING_TO_RESET:"Trận chưa có dữ liệu để đặt lại.",RESET_HISTORY_UNAVAILABLE:"Lịch sử trận không đủ để đặt lại an toàn.",DOWNSTREAM_MATCH_LOCKED:"Trận nhánh sau đã bắt đầu nên không thể đặt lại kết quả."}[e.message]||"Không thể thực hiện: "+e.message);
    }finally{busy=false}
  }

  document.addEventListener("click",e=>{
    const queue=e.target.closest("[data-queue-match]");
    if(queue){e.preventDefault();e.stopPropagation();const m=state.matches.find(x=>x.id===queue.dataset.queueMatch);if(m)return action(()=>API.setCourtState(m.id,{courtState:queue.dataset.queueState,expectedVersion:m.version}),"Đã cập nhật điều phối sân.");}
    const open=e.target.closest("[data-open]");if(open)return showScore(open.dataset.open);
    const rally=e.target.closest("[data-rally]");if(rally){const m=activeMatch();if(m)return action(()=>API.rally(m.id,{side:rally.dataset.rally,expectedVersion:m.version}));}
    const correct=e.target.closest("[data-correct]");if(correct){const m=activeMatch();if(m)return action(()=>API.point(m.id,{side:correct.dataset.correct,delta:Number(correct.dataset.delta),expectedVersion:m.version}));}
    const service=e.target.closest("[data-service]");if(service){const m=activeMatch();if(m)return action(()=>API.service(m.id,{side:service.dataset.service,serverNumber:Number(service.dataset.server),expectedVersion:m.version}));}
    const timeout=e.target.closest("[data-timeout]");if(timeout){const m=activeMatch();if(m)return action(()=>API.timeout(m.id,{side:timeout.dataset.timeout,kind:timeout.dataset.kind,expectedVersion:m.version}),timeout.dataset.kind==="medical"?"Đã ghi medical timeout.":"Đã ghi timeout.");}
  });

  $("#backToMatches").onclick=showPicker;
  $("#refreshBtn").onclick=()=>refresh();
  $("#resetMatchBtn").onclick=()=>{
    const m=activeMatch();
    if(m&&confirm("Đặt lại toàn bộ điểm, set và kết quả của trận này? Bạn vẫn có thể bấm Undo ngay sau đó để khôi phục."))action(()=>API.resetMatch(m.id,{expectedVersion:m.version}),"Đã đặt lại trận về ban đầu.");
  };
  $("#undoBtn").onclick=()=>{const m=activeMatch();if(m)action(()=>API.undo(m.id,{expectedVersion:m.version}),"Đã Undo.")};
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
      socket?.on("connect",()=>{$("#connectionState").textContent="Realtime";$("#connectionState").className="connection-pill live"});
      socket?.on("disconnect",()=>{$("#connectionState").textContent="Mất kết nối";$("#connectionState").className="connection-pill offline"});
      socket?.on("public:state",scheduleRefresh);socket?.on("match:update",scheduleRefresh);
    }catch(e){
      if(e.message!=="AUTH_REQUIRED")location.href="login.html?next=referee.html";
    }
  }
  init();
})();
