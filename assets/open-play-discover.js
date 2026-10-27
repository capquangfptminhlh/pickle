(()=>{
"use strict";
const api=window.PickleAPI,$=id=>document.getElementById(id);
let member=null,profiles=[],registrations=[];
const status=(msg,error=false)=>{const el=$("notice");el.textContent=msg;el.className="state"+(error?" error":"")};
const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=String(text??"");return node};
const when=value=>{try{return new Date(value).toLocaleString("vi-VN",{dateStyle:"medium",timeStyle:"short"})}catch{return String(value||"")}};
const endpoint=id=>"/api/open-play/sessions/"+encodeURIComponent(id);
async function reload(){
  status("Đang tải buổi Open Play…");
  const session=await api.session();
  member=session?.user||null;profiles=[];registrations=[];
  $("loginLink").classList.toggle("hidden",Boolean(member));
  if(member){
    const mine=await api.request("/api/open-play/me");
    profiles=Array.isArray(mine?.players)?mine.players:[];
    registrations=Array.isArray(mine?.registrations)?mine.registrations:[];
    $("accountInfo").textContent="Đã đăng nhập: "+(member.name||member.email||"VĐV")+
      (profiles.length?" · "+profiles.length+" hồ sơ VĐV liên kết":" · Chưa liên kết hồ sơ VĐV");
  }else $("accountInfo").textContent="Chưa đăng nhập. Anh/chị vẫn xem được lịch mở công khai.";
  const sessions=await api.request("/api/open-play/public/sessions");
  renderSessions(Array.isArray(sessions)?sessions:[]);
  renderMine();
  status("Đã cập nhật lịch Open Play.");
}
function makeButton(label,action){
  const button=el("button",label);button.type="button";
  button.addEventListener("click",async()=>{
    button.disabled=true;
    try{await action()}catch(error){status("Không thể thực hiện: "+(error?.message||"Lỗi mạng"),true)}
    finally{button.disabled=false}
  });return button;
}
function renderSessions(sessions){
  const box=$("sessions");box.replaceChildren();
  if(!sessions.length){box.append(el("p","Chưa có buổi chơi nào đang mở đăng ký."));return}
  for(const session of sessions){
    const card=document.createElement("article");
    card.append(el("strong",session.title),el("div",when(session.startsAt)+" · "+(session.courtLabel||"Địa điểm sẽ thông báo"),"session-meta"));
    const details=el("div",session.maxPlayers+" chỗ · Tổng trình tối đa "+session.maxCombinedRating+
      (session.tolerance?" (dung sai "+session.tolerance+")":""),"session-meta");
    details.className="session-meta";card.append(details);
    if(member&&profiles.length){
      const label=el("label","Chọn hồ sơ VĐV để đăng ký");
      const select=document.createElement("select");
      select.setAttribute("aria-label","Hồ sơ VĐV cho "+session.title);
      profiles.forEach(profile=>{
        const option=document.createElement("option");option.value=profile.id;
        option.textContent=profile.name+" · "+profile.rating+" điểm";select.append(option);
      });
      const join=makeButton("Đăng ký tham gia",async()=>{
        const id=select.value;
        if(!id)throw Error("Chưa chọn hồ sơ VĐV.");
        const current=registrations.find(r=>r.sessionId===session.id&&r.playerId===id&&r.status==="registered");
        if(current)throw Error("VĐV này đã đăng ký.");
        await api.request(endpoint(session.id)+"/join",{method:"POST",body:JSON.stringify({playerId:id})});
        await reload();status("Đã đăng ký Open Play thành công.");
      });
      card.append(label,select,join);
    }else if(member)card.append(el("p","Tài khoản này chưa được liên kết với hồ sơ VĐV đang hoạt động."));
    else card.append(el("p","Đăng nhập để đăng ký bằng hồ sơ của anh/chị."));
    box.append(card);
  }
}
function renderMine(){
  const box=$("registrations");box.replaceChildren();
  if(!member){box.append(el("p","Đăng nhập để xem đăng ký của mình."));return}
  if(!registrations.length){box.append(el("p","Chưa có buổi chơi đã đăng ký."));return}
  const ul=document.createElement("ul");
  for(const r of registrations){
    const li=document.createElement("li");
    li.append(el("strong",r.title),el("div",when(r.startsAt)+" · "+r.status,"session-meta"));
    if(r.status==="registered"){
      const btn=makeButton("Hủy đăng ký",async()=>{
        await api.request(endpoint(r.sessionId)+"/self-cancel",{method:"POST",body:JSON.stringify({playerId:r.playerId})});
        await reload();status("Đã hủy đăng ký.");
      });btn.className="secondary";li.append(btn);
    }
    ul.append(li);
  }
  box.append(ul);
}
$("refresh").addEventListener("click",()=>reload().catch(e=>status(e?.message||"Không tải được lịch.",true)));
reload().catch(e=>status("Không tải được Open Play: "+(e?.message||"Lỗi kết nối"),true));
})();