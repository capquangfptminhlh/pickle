(()=>{
"use strict";
const api=window.PickleAPI,$=id=>document.getElementById(id);
let member=null,profiles=[],registrations=[],waitlist=[],sessionsCache=[],myMatches=[];
const errors={
 OPEN_PLAY_PLAYER_OWNERSHIP_REQUIRED:"Hồ sơ VĐV này chưa liên kết với tài khoản của bạn.",
 OPEN_PLAY_ALREADY_REGISTERED:"Bạn đã đăng ký buổi chơi này.",
 OPEN_PLAY_FULL_OR_CLOSED:"Buổi chơi đã đủ chỗ hoặc ngừng nhận đăng ký.",
 OPEN_PLAY_NOT_OPEN:"BTC chưa mở hoặc đã đóng đăng ký.",
 OPEN_PLAY_WAITLIST_REQUIRES_FULL_SESSION:"Buổi chơi còn chỗ. Hãy đăng ký trực tiếp.",
 OPEN_PLAY_WAITLIST_UNAVAILABLE:"Buổi chơi chưa mở hàng chờ hoặc đã xác nhận lịch.",
 OPEN_PLAY_ALREADY_WAITLISTED:"Anh/chị đang có trong danh sách chờ của buổi này."
};
const msg=e=>errors[e?.message]||e?.message||"Lỗi mạng";
const status=(text,error=false)=>{const node=$("notice");node.textContent=text;node.className="op-status"+(error?" error":"")};
const el=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=String(text??"");if(cls)node.className=cls;return node};
const when=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?"Chưa rõ giờ":d.toLocaleString("vi-VN",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})};
const endpoint=id=>"/api/open-play/sessions/"+encodeURIComponent(id);
function makeButton(label,action,cls){
 const button=el("button",label,cls);button.type="button";
 button.addEventListener("click",async()=>{
  button.disabled=true;
  try{await action()}catch(error){status("Không thể thực hiện: "+msg(error),true)}
  finally{button.disabled=false}
 });
 return button;
}
function emptyState(title,description){
 const box=el("div","","op-empty");
 box.append(el("strong",title),el("span",description));
 return box;
}
async function reload(){
 status("Đang đồng bộ lịch Open Play…");
 const auth=await api.session();
 member=auth?.user||null;profiles=[];registrations=[];waitlist=[];myMatches=[];
 $("loginLink").classList.toggle("hidden",Boolean(member));
 if(member){
  const mine=await api.request("/api/open-play/me");
  profiles=Array.isArray(mine?.players)?mine.players:[];
  registrations=Array.isArray(mine?.registrations)?mine.registrations:[];
  waitlist=Array.isArray(mine?.waitlist)?mine.waitlist:[];
  const games=await api.request("/api/open-play/me/matches");
  myMatches=Array.isArray(games)?games:[];
  $("accountInfo").textContent="Xin chào "+(member.name||member.email||"VĐV")+
    (profiles.length?" · Có "+profiles.length+" hồ sơ VĐV liên kết":" · Chưa có hồ sơ VĐV liên kết");
 }else $("accountInfo").textContent="Bạn có thể xem lịch công khai. Đăng nhập để tham gia buổi chơi.";
 const sessions=await api.request("/api/open-play/public/sessions");
 sessionsCache=Array.isArray(sessions)?sessions:[];
 $("publicCount").textContent=String(sessionsCache.length);
 $("myCount").textContent=String(registrations.filter(r=>r.status==="registered").length);
 renderSessions();
 renderMine();
 renderWaitlist();
 renderMyMatches();
 status("Đã cập nhật. Chúc bạn tìm được buổi chơi phù hợp!");
}
function renderSessions(){
 const box=$("sessions");box.replaceChildren();
 const keyword=$("sessionSearch").value.trim().toLocaleLowerCase("vi");
 const shown=sessionsCache.filter(s=>[s.title,s.courtLabel].some(v=>String(v||"").toLocaleLowerCase("vi").includes(keyword)));
 if(!shown.length){
  box.append(emptyState(keyword?"Không tìm thấy lịch phù hợp":"Chưa có buổi đang mở",
   keyword?"Thử từ khóa khác hoặc xóa bộ lọc.":"Các buổi chơi được BTC bật đăng ký sẽ xuất hiện tại đây."));return;
 }
 for(const session of shown){
  const card=document.createElement("article");card.className="op-card";
  const top=el("div","","op-card-header"),identity=el("div","");
  identity.append(el("span",when(session.startsAt),"op-card-date"),el("h3",session.title));
  const active=el("span","Nhận đăng ký","op-chip is-open");
  top.append(identity,active);card.append(top);
  const facts=el("div","","op-card-info");
  facts.append(el("span",session.courtLabel||"Địa điểm sẽ thông báo"),
   el("span",session.registeredCount+"/"+session.maxPlayers+" VĐV"),
   el("span",session.waitingCount+" đang chờ"),
   el("span","Tổng trình ≤ "+session.maxCombinedRating+(session.tolerance?" + "+session.tolerance:"")));
  card.append(facts);
  if(member&&profiles.length){
   const label=el("label","Chọn hồ sơ để tham gia");
   const select=document.createElement("select");
   const selectId="profile-"+session.id;select.id=selectId;label.htmlFor=selectId;
   select.setAttribute("aria-label","Hồ sơ VĐV cho "+session.title);
   profiles.forEach(profile=>{
    const option=document.createElement("option");option.value=profile.id;
    option.textContent=profile.name+" · "+profile.rating+" điểm";select.append(option);
   });
   const updateJoinState=()=>{
    const hasRegistration=registrations.some(r=>r.sessionId===session.id&&r.playerId===select.value&&r.status==="registered");
    const hasQueue=waitlist.some(r=>r.sessionId===session.id&&r.playerId===select.value);
    const isFull=Number(session.registeredCount)>=Number(session.maxPlayers);
    join.disabled=hasRegistration||hasQueue;
    join.textContent=hasRegistration?"✓ Đã tham gia":hasQueue?"✓ Đang chờ lượt":isFull?"Vào danh sách chờ":"Đăng ký buổi chơi";
   };
   const join=makeButton("Đăng ký buổi chơi",async()=>{
    const id=select.value;
    if(!id)throw Error("Chưa chọn hồ sơ VĐV.");
    const current=registrations.find(r=>r.sessionId===session.id&&r.playerId===id&&r.status==="registered");
    if(current)throw Error("VĐV này đã đăng ký.");
    const isFull=Number(session.registeredCount)>=Number(session.maxPlayers);
    await api.request(endpoint(session.id)+(isFull?"/waitlist/join":"/join"),{method:"POST",body:JSON.stringify({playerId:id})});
    await reload();status(isFull?"Đã vào hàng chờ. Khi có chỗ trống, hệ thống sẽ tự chuyển đăng ký.":"Đã đăng ký Open Play thành công.");
   },"op-btn");
   select.addEventListener("change",updateJoinState);
   updateJoinState();card.append(label,select,join);
  }else if(member)card.append(el("p","Bạn chưa có hồ sơ VĐV được liên kết với tài khoản. Liên hệ BTC để được hỗ trợ.","op-small"));
  else card.append(el("p","Đăng nhập để chọn hồ sơ VĐV và giữ chỗ.","op-small"));
  box.append(card);
 }
}
function renderMine(){
 const box=$("registrations");box.replaceChildren();
 if(!member){box.append(emptyState("Chưa đăng nhập","Đăng nhập để theo dõi lịch và hủy đăng ký nếu cần."));return}
 if(!registrations.length){box.append(emptyState("Chưa có lịch chơi","Chọn một buổi Open Play bên cạnh để tham gia."));return}
 const ul=document.createElement("ul");ul.className="op-my-registration";
 for(const r of registrations){
  const li=document.createElement("li"),info=el("div","");
  info.append(el("strong",r.title),el("small",when(r.startsAt),"op-session-meta"));
  li.append(info);
  if(r.status==="registered"){
   const btn=makeButton("Hủy đăng ký",async()=>{
    await api.request(endpoint(r.sessionId)+"/self-cancel",{method:"POST",body:JSON.stringify({playerId:r.playerId})});
    await reload();status("Đã hủy đăng ký.");
   },"danger");btn.setAttribute("aria-label","Hủy đăng ký "+r.title);li.append(btn);
  }else li.append(el("span","Đã hủy","op-chip is-cancelled"));
  ul.append(li);
 }
 box.append(ul);
}
function renderWaitlist(){
 const box=$("myWaitlist");box.replaceChildren();
 if(!member){box.append(emptyState("Chưa đăng nhập","Đăng nhập để xem thứ tự hàng chờ."));return}
 if(!waitlist.length){box.append(emptyState("Không có lượt chờ","Khi buổi chơi đủ người, bạn có thể xếp hàng và được xét theo thứ tự."));return}
 for(const w of waitlist){
  const card=el("article","","op-card");
  card.append(el("strong",w.title),el("p",when(w.startsAt)+" · Thứ tự chờ: "+w.position,"op-small"));
  card.append(makeButton("Rời danh sách chờ",async()=>{
   await api.request(endpoint(w.sessionId)+"/waitlist/self-cancel",{method:"POST",body:JSON.stringify({playerId:w.playerId})});
   await reload();status("Đã rời danh sách chờ.");
  },"secondary"));
  box.append(card);
 }
}
function renderMyMatches(){
 const box=$("myMatches");box.replaceChildren();
 if(!member){box.append(emptyState("Chưa đăng nhập","Đăng nhập để xem trận đấu của anh/chị."));return}
 if(!myMatches.length){box.append(emptyState("Chưa có trận được phân","Khi BTC xác nhận các vòng, trận của anh/chị sẽ hiển thị tại đây."));return}
 for(const m of myMatches){
  const card=el("article","","op-card");
  card.append(el("strong",m.title),el("p",when(m.startsAt)+" · Vòng "+m.round+" · Sân "+m.court,"op-small"));
  const result=el("div","Đội "+m.myTeam+" của bạn: "+m.scoreA+" – "+m.scoreB,"op-card-date");
  const state=el("span",m.status==="completed"?"Đã kết thúc":m.status==="live"?"Đang chơi":"Chưa bắt đầu",
    "op-chip "+(m.status==="completed"?"is-registered":"is-open"));
  card.append(result,state);
  box.append(card);
 }
}
$("sessionSearch").addEventListener("input",renderSessions);
$("refresh").addEventListener("click",()=>reload().catch(e=>status(msg(e),true)));
reload().catch(e=>status("Không tải được Open Play: "+msg(e),true));
})();