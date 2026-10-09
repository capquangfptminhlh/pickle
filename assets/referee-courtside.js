(()=>{
  const API=window.PickleAPI;
  const $=s=>document.querySelector(s);
  let state={tournaments:[],divisions:[],courts:[],teams:[],matches:[]},user=null,activeId=null,busy=false,refreshTimer=null,refreshVersion=0;

  const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const team=id=>state.teams.find(t=>t.id===id)?.name||(id==="TBD"||!id?"Chưa xác định":id);
  const division=m=>state.divisions.find(d=>d.id===m?.divisionId);
  const court=m=>state.courts.find(c=>c.id===m?.courtId)?.name||(m?.court&&m.court!=="—"?"Sân "+m.court:"Chưa gán sân");
  const queueMeta=s=>({scheduled:["CHỜ","scheduled"],called:["ĐANG GỌI","called"],on_deck:["ON DECK","on_deck"],warming_up:["KHỞI ĐỘNG","warming_up"],live:["ĐANG ĐẤU","live"],done:["HOÀN TẤT","done"]}[s]||["CHỜ","scheduled"]);
  const queueRank=m=>m.status==="live"?0:m.courtState==="warming_up"?1:m.courtState==="on_deck"?2:m.courtState==="called"?3:m.status==="wait"?4:5;
  const toast=msg=>{const el=$("#refToast");el.textContent=msg;el.hidden=false;clearTimeout(el._timer);el._timer=setTimeout(()=>el.hidden=true,2600)};
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
    const target=Number(d?.pointsToWin||11),winByTwo=d?.winByTwo!==false,hi=Math.max(a,b),lo=Math.min(a,b),setWon=a!==b&&hi>=target&&(!winByTwo||hi-lo>=2);
    const winsA=(m.sets||[]).filter(s=>Number(s[0])>Number(s[1])).length,winsB=(m.sets||[]).filter(s=>Number(s[1])>Number(s[0])).length,need=Math.ceil(Number(d?.bestOf||3)/2);
    const matchWon=setWon&&(a>b?winsA+1:winsB+1)>=need;
    const isDoubles=["doubles","mixed_doubles","team"].includes(d?.eventType),mode=d?.scoringMode||"side_out",serve=m.servingSide||"A",server=Number(m.serverNumber||(isDoubles?2:1));
    const q=m.status==="live"?"live":m.status==="done"?"done":m.courtState||"scheduled",qm=queueMeta(q);

    $("#courtLabel").textContent=court(m);
    $("#stageLabel").textContent=m.stage||d?.name||"Trận đấu";
    $("#queueLabel").textContent=qm[0];$("#queueLabel").className="queue-pill "+qm[1];
    $("#refTeamA").textContent=team(m.a);$("#refTeamB").textContent=team(m.b);
    $("#refScoreA").textContent=a;$("#refScoreB").textContent=b;
    $("#modeBanner").textContent=(mode==="rally"?"Rally":"Side-out")+(d?.finalPointOnServe?" · điểm "+target+" phải cầm giao":"");
    const leg=window.PickleMatchFormat?.legText(a,b,d)||"";$("#legBanner").hidden=!leg;$("#legBanner").textContent=leg;
    $("#serveBanner").textContent=(serve==="A"?team(m.a):team(m.b))+(mode==="rally"?" · quyền giao":" · Server "+server);
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
    $("#undoBtn").disabled=m.status==="cancelled";
    $("#finishSetBtn").disabled=locked||!setWon||matchWon;
    $("#finishMatchBtn").disabled=locked||!matchWon;
    $("#serverHelp").textContent=mode==="rally"?"Rally winner nhận quyền giao":"Đánh đôi: Server 1 → Server 2 → side-out";

    const hint=$("#scoreHint");
    if(setWon){
      hint.hidden=false;
      hint.textContent=(a>b?team(m.a):team(m.b))+" đã đủ điều kiện thắng "+(matchWon?"trận":"set")+" "+hi+"–"+lo+".";
    }else{hint.hidden=true;hint.textContent=""}
  }

  function showScore(id){
    activeId=id;
    const url=new URL(location.href);url.searchParams.set("match",id);history.replaceState(null,"",url);
    $("#refSummary").hidden=true;$("#matchPicker").hidden=true;$("#scoreSurface").hidden=false;
    renderScore();scrollTo({top:0,behavior:"instant"});
  }
  function showPicker(){
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
  function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh({quiet:true}),180)}

  async function action(fn,success){
    if(busy)return;busy=true;
    try{await fn();await refresh({quiet:true});if(success)toast(success)}
    catch(e){
      if(e.message==="VERSION_CONFLICT"){await refresh({quiet:true});toast("Điểm đã đổi từ thiết bị khác. Đã đồng bộ lại.");}
      else toast({SET_ALREADY_WON:"Set đã đủ điểm thắng. Hãy chốt set.",TIMEOUT_LIMIT:"Đội đã dùng đủ timeout.",MEDICAL_TIMEOUT_LIMIT:"Đội đã dùng medical timeout.",NOTHING_TO_UNDO:"Không còn thao tác để Undo.",DOWNSTREAM_MATCH_LOCKED:"Nhánh sau đã bắt đầu, không thể Undo."}[e.message]||"Không thể thực hiện: "+e.message);
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
