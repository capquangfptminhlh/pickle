(()=>{
"use strict";
const API=window.PickleAPI,$=id=>document.getElementById(id);
let currentId=null,currentSession=null,roster=[],account=null,allSessions=[];
const labels={open:"Đang mở",closed:"Đã đóng",cancelled:"Đã hủy",registered:"Đã đăng ký"};
const errorText=e=>({
 OPEN_PLAY_ALREADY_REGISTERED:"VĐV đã có trong danh sách.",
 OPEN_PLAY_FULL_OR_CLOSED:"Buổi chơi đã đủ người hoặc ngừng đăng ký.",
 OPEN_PLAY_PLAYER_NOT_FOUND:"Không tìm thấy hồ sơ VĐV hoạt động.",
 OPEN_PLAY_FORBIDDEN:"Tài khoản không có quyền quản lý buổi này.",
 AUTH_REQUIRED:"Phiên đăng nhập đã hết hạn."
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
 const editable=currentSession.status==="open";
 $("openSignup").disabled=!editable||currentSession.selfSignupEnabled;
 $("closeSignup").disabled=!editable||!currentSession.selfSignupEnabled;
 $("closeSession").disabled=currentSession.status!=="open";
 $("addPlayer").querySelector("button[type=submit]").disabled=!editable||count>=currentSession.maxPlayers;
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
   if(row.status==="registered"){
    const cancel=button("Hủy",async()=>{
     await API.request("/api/open-play/sessions/"+encodeURIComponent(id)+"/registrations/"+encodeURIComponent(row.id)+"/cancel",{method:"POST",body:"{}"});
     await loadSession(id);notice("Đã hủy đăng ký "+(row.name||"VĐV")+".");
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
init();
})();