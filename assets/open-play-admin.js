(()=>{
"use strict";
const API=window.PickleAPI,$=id=>document.getElementById(id);
let currentId=null,currentSession=null,roster=[],account=null,allSessions=[];
let checkedInIds=new Set(),confirmedPlan=null;
const labels={open:"Đang mở",closed:"Đã đóng",cancelled:"Đã hủy",registered:"Đã đăng ký"};
const errorText=e=>({
 OPEN_PLAY_ALREADY_REGISTERED:"VĐV đã có trong danh sách.",
 OPEN_PLAY_FULL_OR_CLOSED:"Buổi chơi đã đủ người hoặc ngừng đăng ký.",
 OPEN_PLAY_PLAYER_NOT_FOUND:"Không tìm thấy hồ sơ VĐV hoạt động.",
 OPEN_PLAY_FORBIDDEN:"Tài khoản không có quyền quản lý buổi này.",
 AUTH_REQUIRED:"Phiên đăng nhập đã hết hạn.",
 OPEN_PLAY_NEEDS_FOUR_CHECKINS:"Cần ít nhất 4 VĐV check-in trước khi xác nhận.",
 OPEN_PLAY_NO_VALID_COURT:"Chưa có đủ cặp hợp lệ để tạo sân thi đấu.",
 OPEN_PLAY_PLAN_EXISTS:"Buổi chơi đã có lịch chính thức. Vui lòng tải lại.",
 OPEN_PLAY_ROSTER_LOCKED:"Đã chốt lịch thi đấu nên không thể sửa danh sách VĐV.",
 OPEN_PLAY_UNFINISHED_MATCHES:"Còn trận chưa kết thúc. Hãy hoàn tất trước khi đóng buổi.",
 OPEN_PLAY_SCORE_VERSION_CONFLICT:"Điểm đã được thay đổi trên thiết bị khác. Bấm Cập nhật lịch & điểm rồi thử lại.",
 OPEN_PLAY_INVALID_FINAL_SCORE:"Điểm chưa đủ điều kiện kết thúc theo luật buổi chơi.",
 OPEN_PLAY_FINAL_SCORE_REQUIRES_FINISH:"Điểm đã đủ thắng. Hãy chọn Kết thúc trận để xác nhận.",
 OPEN_PLAY_MATCH_COMPLETED:"Trận đã chốt. Chỉ BTC có thể sửa bằng chức năng sửa kết quả có lý do.",
 OPEN_PLAY_REFEREE_NOT_FOUND:"Không tìm thấy tài khoản trọng tài đang hoạt động.",
 INVALID_OPEN_PLAY_REFEREE_ID:"Mã tài khoản trọng tài không hợp lệ.",
 OPEN_PLAY_SCORE_VERSION_OR_REFEREE_CONFLICT:"Điểm hoặc phân công đã thay đổi. Hãy cập nhật lịch & điểm.",
 OPEN_PLAY_CORRECTION_REQUIRES_COMPLETED_MATCH:"Chỉ sửa điểm bằng quy trình này sau khi kết thúc trận.",
 OPEN_PLAY_CORRECTION_REASON_REQUIRED:"Vui lòng ghi lý do điều chỉnh điểm từ 12–500 ký tự.",
 OPEN_PLAY_CORRECTION_NO_CHANGE:"Điểm mới phải khác điểm cũ.",
 OPEN_PLAY_CORRECTION_AUDIT_FAILED:"Không thể xác nhận nhật ký sửa điểm. Vui lòng thử lại.",
 OPEN_PLAY_ALREADY_WAITLISTED:"VĐV này đã nằm trong hàng chờ.",
 OPEN_PLAY_WAITLIST_REQUIRES_FULL_SESSION:"Chưa đủ người. Vui lòng đăng ký VĐV trực tiếp trước.",
 OPEN_PLAY_WAITLIST_UNAVAILABLE:"Buổi chơi đã đóng hoặc đã chốt lịch.",
 OPEN_PLAY_WAITLIST_ALREADY_PROMOTED:"VĐV đã được chuyển vào danh sách tham gia."
}[e?.message]||e?.message||"Lỗi kết nối");
const notice=(message,isError=false)=>{const node=$("notice");node.textContent=message;node.className="op-status"+(isError?" error":"")};
const detail=message=>{$("details").textContent=message};
const fmtDate=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?"Chưa rõ thời gian":d.toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})};
function item(tag,content,cls){
 const el=document.createElement(tag);el.textContent=String(content??"");if(cls)el.className=cls;return el;
}
function labelBadge(value){
 const chip=item("span",labels[value]||value,"op-chip is-"+(value==="open"?"open":value==="cancelled"?"cancelled":"closed"));
 return chip;
}
function button(label,action,cls="secondary"){
 const btn=item("button",label,cls);btn.type="button";
 btn.addEventListener("click",()=>{
  btn.disabled=true;
  Promise.resolve().then(action).catch(e=>notice("Không thể thực hiện: "+errorText(e),true)).finally(()=>{btn.disabled=false});
 });
 return btn;
}
function initials(name){
 const parts=String(name||"VĐV").trim().split(/\s+/).filter(Boolean);
 return parts.length?(parts.length>1?parts[0][0]+parts.at(-1)[0]:parts[0].slice(0,2)).toUpperCase():"VD";
}
function renderSessionList(){
 const host=$("sessions");host.replaceChildren();
 if(!allSessions.length){
  const empty=item("div","","op-empty");empty.append(item("strong","Chưa có buổi chơi"),item("span","Tạo buổi mới bên dưới để bắt đầu quản lý Open Play."));host.append(empty);return;
 }
 for(const session of allSessions){
  const row=item("article","","op-session"+(session.id===currentId?" is-active":""));
  const meta=item("div","");
  meta.append(item("strong",session.title),item("span",fmtDate(session.startsAt)+" · "+(session.courtLabel||"Chưa chọn sân"),"op-session-meta"));
  const flags=item("div","","op-session-info");
  flags.append(labelBadge(session.status),item("span",session.maxPlayers+" chỗ · "+session.maxCombinedRating+" điểm","op-small"));
  meta.append(flags);
  const select=button(session.id===currentId?"Đang chọn":"Quản lý",()=>loadSession(session.id),"secondary");
  select.setAttribute("aria-label","Quản lý "+session.title);
  row.append(meta,select);host.append(row);
 }
}
async function refresh(){
 allSessions=await API.request("/api/open-play/sessions");
 $("statSessions").textContent=String(allSessions.length);
 $("statOpen").textContent=String(allSessions.filter(x=>x.status==="open").length);
 renderSessionList();
}
async function loadSession(id){
 const data=await API.request("/api/open-play/sessions/"+encodeURIComponent(id));
 currentId=id;currentSession=data.session;roster=data.registrations||[];
 $("selectedTitle").textContent=currentSession.title;
 const flag=labelBadge(currentSession.status);
 flag.id="sessionBadge";
 $("sessionBadge").replaceWith(flag);
 const count=roster.filter(p=>p.status==="registered").length;
 detail(fmtDate(currentSession.startsAt)+" · "+(currentSession.courtLabel||"Chưa chọn sân")+
   " · "+labels[currentSession.status]+" · Đăng ký công khai: "+(currentSession.selfSignupEnabled?"ĐANG BẬT":"TẮT"));
 $("sessionControls").classList.remove("hidden");
 $("registeredCount").textContent=String(count);
 $("freeSlots").textContent=String(Math.max(0,currentSession.maxPlayers-count));
 $("ratingLimit").textContent=String(currentSession.maxCombinedRating);
 $("rosterCount").textContent=count+" / "+currentSession.maxPlayers+" VĐV";
 $("statPlayers").textContent=String(count);
 $("pairResults").textContent="Chưa ghép đôi. Bấm xem trước để tính các cặp hợp lệ.";
 $("roundResults").textContent="Chưa có vòng đấu mô phỏng.";
 const editable=currentSession.status==="open";
 $("openSignup").disabled=!editable||currentSession.selfSignupEnabled;
 $("closeSignup").disabled=!editable||!currentSession.selfSignupEnabled;
 $("closeSession").disabled=currentSession.status!=="open";
 $("addPlayer").querySelector("button[type=submit]").disabled=!editable||count>=currentSession.maxPlayers;
 await loadGameDay(id);
 await loadWaitlist(id);
 const list=$("roster");list.replaceChildren();
 if(!roster.length){
  list.append(item("li","Chưa có VĐV đăng ký.","op-empty"));
 }else{
  for(const row of roster){
   const li=document.createElement("li");
   const person=item("div","","op-roster-person"),info=item("div","");
   info.append(item("strong",row.name||row.id),item("small",row.rating+" điểm · "+(labels[row.status]||row.status)));
   person.append(item("span",initials(row.name||row.id),"op-avatar"),info);
   li.append(person);
   if(row.status==="registered"&&!confirmedPlan){
    const attending=checkedInIds.has(row.id);
    const check=button(attending?"Đã đến ✓":"Check-in",async()=>{
     await API.request("/api/open-play/sessions/"+encodeURIComponent(id)+"/check-in/"+encodeURIComponent(row.id),{method:"POST",body:JSON.stringify({checkedIn:!attending})});
     await loadSession(id);notice((attending?"Đã rút check-in: ":"Đã check-in: ")+(row.name||row.id));
    },attending?"secondary":"op-btn");
    check.setAttribute("aria-label",(attending?"Rút check-in ":"Check-in ")+(row.name||row.id));li.append(check);
   }
   if(row.status==="registered"&&!confirmedPlan){
    const cancel=button("Hủy",async()=>{
     await API.request("/api/open-play/sessions/"+encodeURIComponent(id)+"/registrations/"+encodeURIComponent(row.id)+"/cancel",{method:"POST",body:"{}"});
     const result=await loadSession(id);notice("Đã hủy đăng ký "+(row.name||"VĐV")+". Hàng chờ đã được cập nhật.");
    },"danger");
    cancel.setAttribute("aria-label","Hủy đăng ký của "+(row.name||row.id));li.append(cancel);
   }else li.append(labelBadge("cancelled"));
   list.append(li);
  }
 }
 renderSessionList();
}
async function changeSession(payload){
 if(!currentId)return;
 const updated=await API.request("/api/open-play/sessions/"+encodeURIComponent(currentId),{method:"PATCH",body:JSON.stringify(payload)});
 await loadSession(currentId);await refresh();notice("Đã cập nhật "+updated.title+".");
}
async function loadSuggestions(){
 const [players,clubs]=await Promise.allSettled([
  API.request("/api/public/players"),
  API.request("/api/public/clubs")
 ]);
 if(players.status==="fulfilled"&&Array.isArray(players.value)){
  const list=$("playerSuggestions");list.replaceChildren();
  for(const player of players.value.slice(0,500)){
   const option=document.createElement("option");
   option.value=String(player.id);
   option.label=String(player.full_name||player.name||player.id)+" · "+Number(player.rating||0)+" điểm";
   list.append(option);
  }
 }
 if(clubs.status==="fulfilled"&&Array.isArray(clubs.value)){
  const list=$("clubSuggestions");list.replaceChildren();
  for(const club of clubs.value.slice(0,200)){
   const option=document.createElement("option");
   option.value=String(club.id);option.label=String(club.name||club.id);
   list.append(option);
  }
 }
}
async function loadWaitlist(id){
 const queue=await API.request("/api/open-play/sessions/"+encodeURIComponent(id)+"/waitlist");
 if(currentId!==id)return;
 const waiting=Array.isArray(queue)?queue:[];
 $("waitingCount").textContent=waiting.length+" đang chờ";
 const box=$("waitingRoster");box.replaceChildren();
 const form=$("addWaitlist");
 form.querySelector("button[type=submit]").disabled=Boolean(confirmedPlan)||currentSession?.status!=="open";
 if(!waiting.length){box.append(item("li","Chưa có người đang chờ.","op-empty"));return}
 for(const w of waiting){
  const li=document.createElement("li"),wrap=item("div","","op-roster-person");
  wrap.append(item("span",String(w.position),"op-avatar"));
  const desc=document.createElement("div");
  desc.append(item("strong",w.name||w.playerId),item("small",w.rating+" điểm · Thứ tự "+w.position));
  wrap.append(desc);li.append(wrap);
  if(!confirmedPlan){
   const cancel=button("Rời hàng",async()=>{
    await API.request("/api/open-play/sessions/"+encodeURIComponent(id)+"/waitlist/"+encodeURIComponent(w.playerId)+"/cancel",{method:"POST",body:"{}"});
    await loadSession(id);notice("Đã rời hàng chờ: "+(w.name||w.playerId)+".");
   },"secondary");
   cancel.setAttribute("aria-label","Rời hàng chờ "+(w.name||w.playerId));
   li.append(cancel);
  }
  box.append(li);
 }
}
async function loadGameDay(id){
 const data=await API.request("/api/open-play/sessions/"+encodeURIComponent(id)+"/plan");
 if(currentId!==id)return;
 checkedInIds=new Set((data.checkins||[]).map(x=>x.playerId));
 confirmedPlan=data.plan||null;
 $("checkedInCount").textContent=checkedInIds.size+" VĐV đến sân";
 $("confirmationOptions").classList.toggle("hidden",Boolean(confirmedPlan));
 $("confirmRounds").disabled=Boolean(confirmedPlan)||checkedInIds.size<4||currentSession?.status!=="open";
 $("confirmRounds").textContent=confirmedPlan?"Lịch đã xác nhận":"Xác nhận vòng & phân sân";
 const root=$("matches");root.replaceChildren();
 if(!confirmedPlan){
  $("gameDayStatus").textContent="Chưa chốt vòng đấu. Hãy check-in ít nhất 4 VĐV rồi xác nhận.";
  return;
 }
 const plan=confirmedPlan;
 const finished=plan.matches.filter(m=>m.status==="completed").length;
 $("gameDayStatus").textContent="Đã xác nhận "+plan.roundCount+" vòng / "+plan.courtCount+" sân • "+finished+"/"+plan.matches.length+
  " trận hoàn thành • Chạm "+plan.pointTarget+(plan.winBy===2?" (thắng cách biệt 2)":" (chạm điểm)")+
  ". Mỗi trận chỉ nhập điểm trên thẻ của chính trận đó.";
 const names=new Map(roster.map(p=>[p.id,p.name||p.id]));
 for(const m of plan.matches){
  const card=item("article","","op-card");
  const title=item("h3","Vòng "+m.round+" · Sân "+m.court);
  const teams=item("p",m.teamA.map(x=>names.get(x)||x).join(" + ")+"  VS  "+m.teamB.map(x=>names.get(x)||x).join(" + "),"op-small");
  const state=item("span",m.status==="completed"?"Đã kết thúc":m.status==="live"?"Đang đánh":"Chờ thi đấu","op-chip "+(m.status==="completed"?"is-registered":"is-open"));
  const score=item("div","","op-form-grid"),fields=[];
  for(const [label,id,value] of [["Đội A","a",m.scoreA],["Đội B","b",m.scoreB]]){
   const wrap=document.createElement("div"),lab=item("label",label),input=document.createElement("input");
   input.type="number";input.min="0";input.max="99";input.step="1";input.value=String(value);
   input.id="op-score-"+m.id+"-"+id;lab.htmlFor=input.id;
   wrap.append(lab,input);score.append(wrap);fields.push(input);
  }
  card.append(title,teams,state,score);
  const assigned=item("p",m.refereeUserId?"Trọng tài: "+m.refereeUserId:"Chưa phân công trọng tài","op-small");
  card.append(assigned);
  if(m.status!=="completed"&&currentSession?.status==="open"){
   const assignment=item("div","","op-actions");
   const refereeInput=document.createElement("input");refereeInput.type="text";
   refereeInput.maxLength=128;refereeInput.value=m.refereeUserId||"";
   refereeInput.placeholder="Mã tài khoản trọng tài";
   refereeInput.setAttribute("aria-label","Mã trọng tài vòng "+m.round+" sân "+m.court);
   assignment.append(refereeInput);
   assignment.append(button("Phân công trọng tài",async()=>{
    const updated=await API.request("/api/open-play/sessions/"+encodeURIComponent(id)+"/matches/"+encodeURIComponent(m.id)+"/referee",{
     method:"PATCH",body:JSON.stringify({refereeUserId:refereeInput.value.trim()||null})
    });
    await loadGameDay(id);
    notice(updated.refereeUserId?"Đã phân công trọng tài cho vòng "+m.round+", sân "+m.court+".":"Đã thu hồi phân công trọng tài.");
   },"secondary"));
   card.append(assignment);
  }
  if(m.status!=="completed"){
   const action=item("div","","op-actions");
   action.append(button("Cập nhật điểm",async()=>{
    const data=await API.request("/api/open-play/sessions/"+encodeURIComponent(id)+"/matches/"+encodeURIComponent(m.id)+"/score",{
     method:"PATCH",body:JSON.stringify({version:m.version,scoreA:Number(fields[0].value),scoreB:Number(fields[1].value),finish:false})
    });
    await loadGameDay(id);notice("Đã lưu điểm trận sân "+m.court+" · phiên bản "+data.version+".");
   }));
   action.append(button("Kết thúc trận",async()=>{
    if(!window.confirm("Xác nhận kết thúc trận? Mọi thay đổi sau đó đều yêu cầu BTC ghi rõ lý do và được lưu nhật ký."))return;
    const data=await API.request("/api/open-play/sessions/"+encodeURIComponent(id)+"/matches/"+encodeURIComponent(m.id)+"/score",{
     method:"PATCH",body:JSON.stringify({version:m.version,scoreA:Number(fields[0].value),scoreB:Number(fields[1].value),finish:true})
    });
    await loadGameDay(id);notice("Đã kết thúc trận sân "+m.court+" · "+data.scoreA+"-"+data.scoreB+".");
   },"secondary"));
   card.append(action);
  }else{
   const correction=item("div","","op-actions");
   correction.append(button("Sửa điểm đã chốt",async()=>{
    const reason=window.prompt("Nhập lý do sửa điểm (ít nhất 12 ký tự). Thay đổi sẽ được lưu vào nhật ký:");
    if(reason===null)return;
    if(!window.confirm("Xác nhận sửa điểm trận đã kết thúc? Lịch sử kết quả cũ vẫn được lưu."))return;
    const updated=await API.request("/api/open-play/sessions/"+encodeURIComponent(id)+"/matches/"+encodeURIComponent(m.id)+"/correction",{
     method:"PATCH",body:JSON.stringify({version:m.version,scoreA:Number(fields[0].value),
      scoreB:Number(fields[1].value),reason})
    });
    await loadGameDay(id);
    notice("Đã sửa điểm trận sân "+m.court+" thành "+updated.scoreA+"-"+updated.scoreB+" và lưu nhật ký.");
   },"secondary"));
   card.append(correction);
  }
  const history=document.createElement("details"),summary=item("summary","Xem lịch sử điểm");
  const historyText=item("div","Đang đọc nhật ký...","op-results");
  history.append(summary,historyText);
  history.addEventListener("toggle",async()=>{
   if(!history.open)return;
   try{
    const events=await API.request("/api/open-play/sessions/"+encodeURIComponent(id)+"/matches/"+encodeURIComponent(m.id)+"/history");
    historyText.textContent=events.length?events.map(e=>
     (e.createdAt||"")+" · "+e.action+" · "+(e.actorId||"BTC")+
     (e.reason?" · Lý do: "+e.reason:"")+
     (e.after?.scoreA===undefined?"":" · "+e.after.scoreA+"-"+e.after.scoreB)
    ).join("\\n"):"Chưa có thay đổi được ghi nhận.";
   }catch(e){historyText.textContent="Không tải được nhật ký: "+errorText(e)}
  });
  card.append(history);
  root.append(card);
 }
}
async function init(){
 try{
  const session=await API.session();
  account=session?.user||null;
  if(!account||!["super_admin","organizer","club_manager"].includes(account.role)){
   notice("Đăng nhập bằng tài khoản BTC hoặc quản lý CLB để điều hành Open Play.",true);
   $("loginLink").classList.remove("hidden");return;
  }
  $("workspace").classList.remove("hidden");$("loginLink").classList.add("hidden");
  if(account.role==="club_manager"&&account.clubId){$("clubId").value=account.clubId;$("clubId").readOnly=true}
  notice("Xin chào "+(account.name||account.email||"BTC")+" · Trạng thái đã đồng bộ.");
  await refresh();
  loadSuggestions().catch(()=>{});
 }catch(e){notice("Không thể tải Open Play: "+errorText(e),true)}
}
$("createSession").addEventListener("submit",async event=>{
 event.preventDefault();
 const submit=event.currentTarget.querySelector("button[type=submit]");submit.disabled=true;
 try{
  const when=$("startsAt").value;
  if(!when||!Number.isFinite(new Date(when).getTime()))throw Error("Ngày giờ không hợp lệ.");
  const payload={title:$("title").value.trim(),startsAt:new Date(when).toISOString(),
   clubId:$("clubId").value||undefined,courtLabel:$("courtLabel").value,
   maxPlayers:Number($("maxPlayers").value),maxCombinedRating:Number($("maxCombinedRating").value),
   tolerance:Number($("tolerance").value)};
  const created=await API.request("/api/open-play/sessions",{method:"POST",body:JSON.stringify(payload)});
  await refresh();await loadSession(created.id);
  notice("Đã tạo "+created.title+". Buổi này đang ở chế độ đăng ký riêng tư.");
  $("selectedTitle").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
 }catch(e){notice("Tạo buổi thất bại: "+errorText(e),true)}
 finally{submit.disabled=false}
});
$("refresh").addEventListener("click",()=>refresh().catch(e=>notice(errorText(e),true)));
$("openSignup").addEventListener("click",()=>changeSession({selfSignupEnabled:true}).catch(e=>notice(errorText(e),true)));
$("closeSignup").addEventListener("click",()=>changeSession({selfSignupEnabled:false}).catch(e=>notice(errorText(e),true)));
$("closeSession").addEventListener("click",()=>changeSession({status:"closed"}).catch(e=>notice(errorText(e),true)));
$("addWaitlist").addEventListener("submit",async e=>{
 e.preventDefault();if(!currentId)return;
 const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
 try{
  await API.request("/api/open-play/sessions/"+encodeURIComponent(currentId)+"/waitlist",{
   method:"POST",body:JSON.stringify({playerId:$("waitlistPlayerId").value.trim()})
  });
  $("waitlistPlayerId").value="";await loadSession(currentId);
  notice("Đã đưa VĐV vào hàng chờ theo thứ tự.");
 }catch(err){notice("Không thể thêm hàng chờ: "+errorText(err),true)}
 finally{btn.disabled=Boolean(confirmedPlan)||currentSession?.status!=="open"}
});
$("addPlayer").addEventListener("submit",async e=>{
 e.preventDefault();if(!currentId)return;
 const btn=e.currentTarget.querySelector("button[type=submit]");btn.disabled=true;
 try{
  await API.request("/api/open-play/sessions/"+encodeURIComponent(currentId)+"/registrations",{method:"POST",body:JSON.stringify({playerId:$("playerId").value.trim()})});
  $("playerId").value="";await loadSession(currentId);notice("Đã đăng ký vận động viên.");
 }catch(error){notice("Không thể đăng ký: "+errorText(error),true)}finally{btn.disabled=false}
});
$("previewPairs").addEventListener("click",async()=>{
 if(!currentId)return;
 const btn=$("previewPairs");btn.disabled=true;
 try{
  const data=await API.request("/api/open-play/sessions/"+encodeURIComponent(currentId)+"/pairs");
  const names=new Map(roster.map(p=>[p.id,p.name||p.id]));
  $("pairResults").textContent=[data.pairs.length+" cặp hợp lệ",...data.pairs.map((p,i)=>"Cặp "+(i+1)+": "+p.playerIds.map(id=>names.get(id)||id).join(" + ")+" · "+p.combinedRating+" điểm"),
   "Chưa ghép: "+(data.unpairedIds.map(id=>names.get(id)||id).join(", ")||"không có")].join("\n");
 }catch(e){notice("Ghép đôi thất bại: "+errorText(e),true)}finally{btn.disabled=false}
});
$("reloadGameDay").addEventListener("click",()=>{if(currentId)loadSession(currentId).catch(e=>notice(errorText(e),true))});
$("confirmRounds").addEventListener("click",async()=>{
 if(!currentId||confirmedPlan)return;
 const rounds=Number($("roundCount").value),courts=Number($("courtCount").value);
 if(!Number.isInteger(rounds)||rounds<1||rounds>12||!Number.isInteger(courts)||courts<1||courts>32){
  notice("Số vòng phải 1–12 và số sân phải 1–32.",true);return;
 }
 if(!window.confirm("Xác nhận lịch thi đấu chính thức? Sau khi xác nhận, danh sách VĐV sẽ khóa và không thể sửa kế hoạch này."))return;
 const btn=$("confirmRounds");btn.disabled=true;
 try{
  const created=await API.request("/api/open-play/sessions/"+encodeURIComponent(currentId)+"/plan",{
   method:"POST",body:JSON.stringify({rounds,courts,pointTarget:Number($("pointTarget").value),winBy:Number($("winBy").value)})
  });
  await loadSession(currentId);notice("Đã chốt "+created.plan.matches.length+" trận Open Play. Có thể nhập điểm ngay.");
 }catch(e){notice("Không thể xác nhận lịch: "+errorText(e),true);btn.disabled=false}
});
$("previewRounds").addEventListener("click",async()=>{
 if(!currentId)return;
 const count=Number($("roundCount").value),courts=Number($("courtCount").value);
 if(!Number.isInteger(count)||count<1||count>12||!Number.isInteger(courts)||courts<1||courts>32){
  notice("Số vòng phải từ 1–12 và số sân mô phỏng từ 1–32.",true);
  return;
 }
 const button=$("previewRounds");button.disabled=true;
 try{
  const path="/api/open-play/sessions/"+encodeURIComponent(currentId)+
   "/rounds/preview?rounds="+encodeURIComponent(count)+"&courts="+encodeURIComponent(courts);
  const data=await API.request(path);
  const names=new Map(roster.map(p=>[p.id,p.name||p.id]));
  const name=id=>names.get(id)||id;
  const lines=["BẢN XEM TRƯỚC – CHƯA XẾP SÂN THẬT"];
  for(const round of data.rounds){
   lines.push("Vòng "+round.round+" • "+round.courts.length+" sân mô phỏng");
   if(!round.courts.length)lines.push("  Chưa đủ cặp hợp lệ để tạo trận đôi.");
   for(const court of round.courts){
    lines.push("  Sân "+court.court+": "+court.teamA.playerIds.map(name).join(" + ")+
      "  VS  "+court.teamB.playerIds.map(name).join(" + "));
   }
   lines.push("  Chờ lượt: "+(round.waitingIds.map(name).join(", ")||"không có"));
  }
  lines.push("Chênh lệch số lượt chơi: "+data.fairGamesSpread);
  $("roundResults").textContent=lines.join("\n");
 }catch(e){notice("Không thể mô phỏng vòng đấu: "+errorText(e),true)}
 finally{button.disabled=false}
});
init();
})();