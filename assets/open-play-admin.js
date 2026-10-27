(()=>{
"use strict";
const API=window.PickleAPI,$=id=>document.getElementById(id);
let currentId=null,currentSession=null,roster=[],account=null;
const notice=(message,isError=false)=>{const el=$("notice");el.textContent=message;el.className="status"+(isError?" error":"")};
const detail=(message)=>{$("details").textContent=message};
const fmtDate=value=>{try{return new Date(value).toLocaleString("vi-VN",{dateStyle:"medium",timeStyle:"short"})}catch{return String(value||"")}};
function item(tag,content,cls){
  const el=document.createElement(tag);el.textContent=String(content??"");if(cls)el.className=cls;return el;
}
function button(label,action,cls){
  const btn=item("button",label,cls);btn.type="button";btn.addEventListener("click",()=>{
    btn.disabled=true;Promise.resolve().then(action).catch(e=>notice("Không thể thực hiện: "+(e?.message||"Lỗi kết nối"),true)).finally(()=>{btn.disabled=false});
  });return btn;
}
async function refresh(){
  const sessions=await API.request("/api/open-play/sessions");
  const host=$("sessions");host.replaceChildren();
  if(!sessions.length){host.append(item("p","Chưa có buổi chơi. Hãy tạo một buổi mới."));return}
  for(const session of sessions){
    const row=item("div","","session"),meta=document.createElement("div");
    meta.append(item("strong",session.title),item("div",fmtDate(session.startsAt)+" · "+session.status+" · "+session.maxPlayers+" người","small"));
    row.append(meta,button("Quản lý",()=>loadSession(session.id),"secondary"));host.append(row);
  }
}
async function loadSession(id){
  const data=await API.request("/api/open-play/sessions/"+encodeURIComponent(id));
  currentId=id;currentSession=data.session;roster=data.registrations||[];
  $("selectedTitle").textContent=data.session.title;
  detail(fmtDate(data.session.startsAt)+" · "+(data.session.courtLabel||"Chưa chọn sân")+
    " · "+data.session.status+" · Đăng ký công khai: "+(data.session.selfSignupEnabled?"ĐANG BẬT":"TẮT"));
  $("sessionControls").classList.remove("hidden");
  $("pairResults").textContent="Chưa ghép đôi.";
  const editable=data.session.status==="open";
  $("openSignup").disabled=!editable||data.session.selfSignupEnabled;
  $("closeSignup").disabled=!editable||!data.session.selfSignupEnabled;
  $("closeSession").disabled=data.session.status!=="open";
  $("addPlayer").querySelector("button[type=submit]").disabled=!editable;
  const list=$("roster");list.replaceChildren();
  if(!roster.length){list.append(item("li","Chưa có VĐV đăng ký."));return}
  for(const row of roster){
    const li=document.createElement("li");li.append(item("span",(row.name||row.id)+" · "+row.rating+" điểm · "+row.status+" "));
    if(row.status==="registered"){
      li.append(button("Hủy",async()=>{
        await API.request("/api/open-play/sessions/"+encodeURIComponent(id)+"/registrations/"+encodeURIComponent(row.id)+"/cancel",{method:"POST",body:"{}"});
        notice("Đã hủy đăng ký.");await loadSession(id);
      },"secondary"));
    }
    list.append(li);
  }
}
async function changeSession(payload){
  if(!currentId)return;
  const updated=await API.request("/api/open-play/sessions/"+encodeURIComponent(currentId),{method:"PATCH",body:JSON.stringify(payload)});
  notice("Đã cập nhật "+updated.title+".");await loadSession(currentId);await refresh();
}
async function init(){
  try{
    const session=await API.session();
    account=session?.user||null;
    if(!account||!["super_admin","organizer","club_manager"].includes(account.role)){
      notice("Cần đăng nhập bằng tài khoản chủ giải hoặc quản lý CLB.",true);
      $("loginLink").classList.remove("hidden");return;
    }
    $("workspace").classList.remove("hidden");
    $("loginLink").classList.add("hidden");
    if(account.role==="club_manager"&&account.clubId){$("clubId").value=account.clubId;$("clubId").readOnly=true}
    notice("Đã đăng nhập: "+(account.name||account.email||account.role));
    await refresh();
  }catch(e){notice("Không thể tải Open Play: "+(e?.message||"Lỗi mạng"),true)}
}
$("createSession").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=event.currentTarget,submit=form.querySelector("button[type=submit]");
  submit.disabled=true;
  try{
    const when=$("startsAt").value;
    if(!when||!Number.isFinite(new Date(when).getTime()))throw new Error("Ngày giờ không hợp lệ.");
    const payload={title:$("title").value,startsAt:new Date(when).toISOString(),
      clubId:$("clubId").value||undefined,courtLabel:$("courtLabel").value,
      maxPlayers:Number($("maxPlayers").value),maxCombinedRating:Number($("maxCombinedRating").value),
      tolerance:Number($("tolerance").value)};
    const created=await API.request("/api/open-play/sessions",{method:"POST",body:JSON.stringify(payload)});
    notice("Đã tạo buổi chơi. Mặc định chưa mở đăng ký công khai.");
    await refresh();await loadSession(created.id);
  }catch(e){notice("Tạo buổi thất bại: "+(e?.message||"Lỗi mạng"),true)}
  finally{submit.disabled=false}
});
$("refresh").addEventListener("click",()=>refresh().catch(e=>notice(e.message,true)));
$("openSignup").addEventListener("click",()=>changeSession({selfSignupEnabled:true}).catch(e=>notice(e.message,true)));
$("closeSignup").addEventListener("click",()=>changeSession({selfSignupEnabled:false}).catch(e=>notice(e.message,true)));
$("closeSession").addEventListener("click",()=>changeSession({status:"closed"}).catch(e=>notice(e.message,true)));
$("addPlayer").addEventListener("submit",async e=>{
  e.preventDefault();if(!currentId)return;
  const btn=e.currentTarget.querySelector("button[type=submit]");btn.disabled=true;
  try{
    await API.request("/api/open-play/sessions/"+encodeURIComponent(currentId)+"/registrations",{method:"POST",body:JSON.stringify({playerId:$("playerId").value.trim()})});
    notice("Đã đăng ký vận động viên.");$("playerId").value="";await loadSession(currentId);await refresh();
  }catch(error){notice("Không thể đăng ký: "+(error?.message||"Lỗi"),true)}finally{btn.disabled=false}
});
$("previewPairs").addEventListener("click",async()=>{
  if(!currentId)return;
  try{
    const data=await API.request("/api/open-play/sessions/"+encodeURIComponent(currentId)+"/pairs");
    const names=new Map(roster.map(p=>[p.id,p.name||p.id]));
    $("pairResults").textContent=[data.pairs.length+" cặp hợp lệ",...data.pairs.map((p,i)=>"Cặp "+(i+1)+": "+p.playerIds.map(id=>names.get(id)||id).join(" + ")+" · "+p.combinedRating+" điểm"),
     "Chưa ghép: "+(data.unpairedIds.map(id=>names.get(id)||id).join(", ")||"không có")].join("\n");
  }catch(e){notice("Ghép đôi thất bại: "+(e?.message||"Lỗi"),true)}
});
init();
})();