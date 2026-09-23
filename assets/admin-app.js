const API=window.PickleAPI;
const $=s=>document.querySelector(s);
const NAV=[
  ["dashboard","▦","Tổng quan"],
  ["tournaments","🏆","Giải đấu"],
  ["players","👥","VĐV & cặp đấu"],
  ["matches","🎾","Lịch & trận đấu"],
  ["scores","✎","Nhập điểm"],
  ["standings","≡","Bảng xếp hạng"],
  ["bracket","⑂","Bracket"],
  ["courts","▤","Sân thi đấu"],
  ["referees","⚑","Trọng tài"],
  ["payments","₫","Thanh toán"],
  ["audit","☷","Nhật ký"],
  ["settings","⚙","Cấu hình"]
];
let state={tournaments:[],divisions:[],courts:[],teams:[],matches:[],audit:[]};
let user=null,page="dashboard",activeMatch=null,busy=false;

const roleLabel=r=>({super_admin:"Super Admin",organizer:"BTC giải",referee:"Trọng tài",club_manager:"Quản lý CLB",player:"VĐV"}[r]||r);
const teamName=id=>state.teams.find(t=>t.id===id)?.name||(id==="TBD"||!id?"Chưa xác định":id);
const statusBadge=s=>s==="live"?'<span class="badge live">ĐANG ĐẤU</span>':s==="done"?'<span class="badge done">KẾT THÚC</span>':s==="open"?'<span class="badge blue">ĐANG MỞ</span>':'<span class="badge wait">CHỜ</span>';
const resultText=m=>!m.sets?.length?"—":m.sets.map(x=>x.join("-")).join(" / ");
const toast=msg=>{const el=document.createElement("div");el.className="toast";el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2400)};
const canManage=()=>["super_admin","organizer"].includes(user?.role);
const canReferees=()=>user?.role==="super_admin";
const visibleNav=()=>user?.role==="referee"?NAV.filter(n=>["dashboard","matches","scores","standings","bracket","courts"].includes(n[0])):NAV;

async function refresh({keepDialog=false}={}){
  state=await API.adminState();
  if(activeMatch){
    activeMatch=state.matches.find(m=>m.id===activeMatch.id)||null;
    if(keepDialog&&activeMatch&&$("#scoreDialog").open)syncScoreDialog();
  }
  render();
}
function renderNav(){
  $("#nav").innerHTML=visibleNav().map(([id,ico,label])=>`<button class="nav-btn ${page===id?"active":""}" data-page="${id}"><span class="ico">${ico}</span>${label}</button>`).join("");
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{page=b.dataset.page;$("#sidebar").classList.remove("open");render()});
}
function setHeader(title,sub){$("#pageTitle").textContent=title;$("#pageSub").textContent=sub}
function matchCard(m){
  const scoreBtn=m.a!=="TBD"&&m.b!=="TBD"?`<button class="mini" data-score-match="${m.id}">✎ Nhập điểm</button>`:"";
  return `<div class="match-card">
    <div class="match-top"><span>${m.time} • Sân ${m.court} • ${m.stage}</span>${statusBadge(m.status)}</div>
    <div class="versus">
      <div class="team"><strong>${teamName(m.a)}</strong><small>${state.teams.find(t=>t.id===m.a)?.club||""}</small></div>
      <div class="vs">${m.status==="done"?`<span class="score-final">${resultText(m)}</span>`:"VS"}</div>
      <div class="team"><strong>${teamName(m.b)}</strong><small>${state.teams.find(t=>t.id===m.b)?.club||""}</small></div>
    </div>
    <div class="actions" style="margin-top:12px">${scoreBtn}<button class="mini" data-match-detail="${m.id}">Chi tiết</button></div>
  </div>`;
}
function dashboard(){
  const live=state.matches.filter(m=>m.status==="live").length,done=state.matches.filter(m=>m.status==="done").length;
  setHeader("Tổng quan","Điều hành giải đấu theo thời gian thực");
  return `<div class="kpis">
    <div class="kpi"><span class="label">GIẢI TRONG HỆ THỐNG</span><strong>${state.tournaments.length}</strong><small>${state.tournaments.filter(t=>t.status==="live").length} đang live</small></div>
    <div class="kpi"><span class="label">TRẬN ĐANG LIVE</span><strong>${live}</strong><small>${done} trận đã hoàn tất</small></div>
    <div class="kpi"><span class="label">ĐỘI / CẶP</span><strong>${state.teams.length}</strong><small>Đang quản lý</small></div>
    <div class="kpi"><span class="label">AUDIT</span><strong>${state.audit.length}</strong><small>Sự kiện gần nhất</small></div>
  </div>
  <div class="grid-2">
    <div class="panel"><div class="panel-head"><div><h2>Live Center</h2><p>Trận đang diễn ra và sắp tới</p></div><button class="mini" data-goto="scores">Mở nhập điểm</button></div>
      ${state.matches.filter(m=>m.status!=="done").slice(0,6).map(matchCard).join("")||'<div class="empty">Chưa có trận.</div>'}
    </div>
    <div class="panel"><div class="panel-head"><div><h2>Hoạt động gần đây</h2><p>Audit log trên server</p></div></div>
      ${state.audit.slice(0,8).map(a=>`<div style="padding:11px 0;border-bottom:1px solid #edf1ef"><strong style="font-size:13px">${a.action}</strong><div style="color:#73847b;font-size:11px;margin-top:4px">${a.time} • ${a.user}</div><div style="font-size:12px;margin-top:4px">${a.detail}</div></div>`).join("")||'<div class="empty">Chưa có thao tác.</div>'}
    </div>
  </div>`;
}
function tournamentCard(t){
  return `<article class="tour-card"><div class="tour-cover"><strong>${t.format||"Tournament"}</strong>${statusBadge(t.status)}</div><div class="tour-body">
    <h3>${t.name}</h3><div class="meta"><span>📅 ${t.date}</span><span>📍 ${t.venue}</span><span>👥 ${t.teams} đội</span></div>
    <div class="actions"><button class="mini" data-goto="matches">Lịch đấu</button><button class="mini" data-goto="standings">BXH</button><button class="mini" data-goto="bracket">Bracket</button></div>
  </div></article>`;
}
function tournaments(){
  setHeader("Giải đấu","Tạo và quản lý giải pickleball");
  return `<div class="panel-head"><div><h2>Danh sách giải</h2><p>${state.tournaments.length} giải</p></div>${canManage()?'<button class="btn primary" data-action="newTournament">＋ Tạo giải mới</button>':""}</div>
  <div class="page-grid">${state.tournaments.map(tournamentCard).join("")||'<div class="empty">Chưa có giải.</div>'}</div>`;
}
function players(){
  setHeader("VĐV & cặp đấu","Quản lý cặp thi đấu, CLB, seed và bảng");
  return `<div class="panel"><div class="panel-head"><div><h2>Cặp đấu</h2><p>${state.teams.length} đội/cặp</p></div>
    ${canManage()?'<div class="actions"><button class="btn primary" data-action="newTeam">＋ Thêm cặp</button></div>':""}</div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Seed</th><th>Cặp VĐV</th><th>CLB</th><th>Bảng</th><th>W</th><th>L</th><th>+/-</th></tr></thead>
      <tbody>${state.teams.map(t=>`<tr><td>${t.seed||"—"}</td><td><b>${t.name}</b></td><td>${t.club}</td><td><span class="badge blue">${t.group||"—"}</span></td><td>${t.w}</td><td>${t.l}</td><td>${t.pf-t.pa>0?"+":""}${t.pf-t.pa}</td></tr>`).join("")}</tbody>
    </table></div>
  </div>`;
}
function matchesPage(scoreOnly=false){
  setHeader(scoreOnly?"Nhập điểm":"Lịch & trận đấu",scoreOnly?"Giao diện courtside cho BTC/trọng tài":"Điều phối sân, giờ đấu và trạng thái");
  const arr=scoreOnly?state.matches.filter(m=>m.status!=="done"):state.matches;
  return `<div class="filters"><select id="courtFilter"><option value="">Tất cả sân</option>${[1,2,3,4,5,6].map(x=>`<option>${x}</option>`).join("")}</select>
    <select id="statusFilter"><option value="">Tất cả trạng thái</option><option value="live">Đang đấu</option><option value="wait">Chờ</option><option value="done">Kết thúc</option></select>${canManage()?'<button class="btn secondary" data-action="autoSchedule">Tạo lịch tự động</button><button class="btn primary" data-action="newMatch">＋ Tạo trận</button>':""}</div>
    <div class="grid-2"><div class="panel"><div class="panel-head"><div><h2>${scoreOnly?"Các trận cần nhập":"Lịch thi đấu"}</h2><p>${arr.length} trận</p></div></div>
      <div id="matchList">${arr.map(matchCard).join("")||'<div class="empty">Không có trận.</div>'}</div>
    </div>
    <div class="panel"><div class="panel-head"><div><h2>Tình trạng sân</h2><p>Live court monitor</p></div></div>
      ${[1,2,3,4,5,6].map(c=>{const m=state.matches.find(x=>String(x.court)===String(c)&&x.status==="live");return `<div style="display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #edf1ef"><div><strong>Sân ${c}</strong><div style="font-size:12px;color:#73847b;margin-top:4px">${m?teamName(m.a)+" vs "+teamName(m.b):"Đang trống"}</div></div>${m?'<span class="badge live">LIVE</span>':'<span class="badge done">TRỐNG</span>'}</div>`}).join("")}
    </div></div>`;
}
function calcGroup(g){return state.teams.filter(t=>t.group===g).sort((a,b)=>b.w-a.w||((b.pf-b.pa)-(a.pf-a.pa))||b.pf-a.pf)}
function standings(){
  setHeader("Bảng xếp hạng","Tự tính từ kết quả trận đã chốt trên server");
  const groups=[...new Set(state.teams.map(t=>t.group).filter(Boolean))];
  return groups.map(g=>`<div class="panel" style="margin-bottom:16px"><div class="panel-head"><div><h2>Bảng ${g}</h2><p>Thắng → hiệu số → điểm ghi</p></div></div>
    <div class="standing-row head"><span>#</span><span>Đội</span><span>W</span><span>L</span><span>PF</span><span>PA</span><span>+/-</span></div>
    ${calcGroup(g).map((t,i)=>`<div class="standing-row"><span class="rank">${i+1}</span><span><b>${t.name}</b><small style="display:block;color:#73847b">${t.club}</small></span><span>${t.w}</span><span>${t.l}</span><span>${t.pf}</span><span>${t.pa}</span><span><b>${t.pf-t.pa>0?"+":""}${t.pf-t.pa}</b></span></div>`).join("")}
  </div>`).join("")||'<div class="panel empty">Chưa có bảng đấu.</div>';
}
function bracketMatch(m){if(!m)return"";return `<div class="bracket-match"><div class="bracket-team ${m.winner===m.a?"win":""}"><span>${teamName(m.a)}</span><b>${m.sets?.filter(s=>s[0]>s[1]).length||""}</b></div><div class="bracket-team ${m.winner===m.b?"win":""}"><span>${teamName(m.b)}</span><b>${m.sets?.filter(s=>s[1]>s[0]).length||""}</b></div>${m.status!=="done"&&m.a!=="TBD"&&m.b!=="TBD"?`<button class="mini" style="margin-top:7px" data-score-match="${m.id}">Nhập điểm</button>`:""}</div>`}
function bracket(){
  setHeader("Bracket","Nhánh loại trực tiếp tự đẩy đội thắng");
  const semis=state.matches.filter(m=>m.stage.toLowerCase().includes("bán kết"));
  const finals=state.matches.filter(m=>m.stage.toLowerCase().includes("chung kết"));
  const final=finals[0];
  return `<div class="panel"><div class="panel-head"><div><h2>Knock-out</h2><p>Top 2 mỗi bảng → bán kết → chung kết</p></div>${canManage()?'<button class="btn primary" data-action="autoBracket">Tạo bracket từ BXH</button>':""}</div><div class="bracket"><div class="round"><h3>BÁN KẾT</h3>${semis.map(bracketMatch).join("")||'<div class="empty">Chưa tạo bán kết</div>'}</div><div class="round"><h3>CHUNG KẾT</h3><div style="margin-top:55px">${bracketMatch(final)}</div></div><div class="round"><h3>VÔ ĐỊCH</h3><div class="bracket-match" style="margin-top:110px;text-align:center;padding:22px"><div style="font-size:34px">🏆</div><strong>${final?.winner?teamName(final.winner):"Chưa xác định"}</strong></div></div></div></div>`;
}
function courts(){
  setHeader("Sân thi đấu","Theo dõi công suất từng sân");
  return `<div class="page-grid">${[1,2,3,4,5,6].map(c=>{const live=state.matches.find(m=>String(m.court)===String(c)&&m.status==="live"),next=state.matches.find(m=>String(m.court)===String(c)&&m.status==="wait");return `<div class="panel"><div class="panel-head"><h2>Sân ${c}</h2>${live?'<span class="badge live">LIVE</span>':'<span class="badge done">TRỐNG</span>'}</div><p style="font-size:13px"><b>Hiện tại:</b> ${live?teamName(live.a)+" vs "+teamName(live.b):"Không có trận"}</p><p style="font-size:12px;color:#73847b"><b>Tiếp theo:</b> ${next?next.time+" • "+teamName(next.a)+" vs "+teamName(next.b):"Chưa xếp"}</p></div>`}).join("")}</div>`;
}
async function refereesPage(){
  setHeader("Trọng tài","Tài khoản và phân quyền nhập điểm");
  if(!canReferees())return '<div class="panel empty">Chỉ Super Admin được tạo tài khoản trọng tài.</div>';
  const refs=await API.referees().catch(()=>[]);
  return `<div class="panel"><div class="panel-head"><div><h2>Danh sách trọng tài</h2><p>${refs.length} tài khoản</p></div><button class="btn primary" data-action="newReferee">＋ Tạo trọng tài</button></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Tên</th><th>Email</th><th>Trạng thái</th></tr></thead><tbody>${refs.map(r=>`<tr><td><b>${r.display_name}</b></td><td>${r.email}</td><td>${r.active?'<span class="badge live">HOẠT ĐỘNG</span>':'<span class="badge done">KHÓA</span>'}</td></tr>`).join("")}</tbody></table></div>
  </div>`;
}
async function payments(){
  setHeader("Thanh toán","Đăng ký giải, phí tham dự và đối soát");
  if(!canManage())return '<div class="panel empty">Bạn không có quyền quản lý thanh toán.</div>';
  const rows=await API.registrations().catch(()=>[]);
  return `<div class="panel">
    <div class="panel-head"><div><h2>Đăng ký & thanh toán</h2><p>${rows.length} hồ sơ</p></div><button class="btn primary" data-action="newRegistration">＋ Tạo đăng ký</button></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Giải</th><th>Nội dung</th><th>Đội</th><th>Số tiền</th><th>Đăng ký</th><th>Thanh toán</th><th>Thao tác</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${r.tournament_name}</td><td>${r.division_name}</td><td><b>${r.team_name||"—"}</b></td><td>${r.amount?Number(r.amount).toLocaleString("vi-VN")+" đ":"—"}</td><td>${r.status}</td><td>${r.payment_status}</td><td><div class="actions">${!r.payment_id?`<button class="mini" data-add-payment="${r.id}">Ghi nhận CK</button>`:""}${r.payment_id&&r.payment_review_status==="pending"?`<button class="mini" data-review-payment="${r.payment_id}" data-status="approved">Duyệt</button><button class="mini" data-review-payment="${r.payment_id}" data-status="rejected">Từ chối</button>`:""}</div></td></tr>`).join("")}
    </tbody></table></div>
  </div>`;
}
function auditPage(){setHeader("Nhật ký hệ thống","Theo dõi mọi thay đổi điểm và quản trị");return `<div class="panel">${state.audit.map(a=>`<div style="padding:13px 0;border-bottom:1px solid #edf1ef"><b>${a.action}</b><div style="font-size:12px;color:#73847b;margin-top:4px">${a.time} • ${a.user} • ${a.detail}</div></div>`).join("")||'<div class="empty">Chưa có log.</div>'}</div>`}
function settings(){
  setHeader("Cấu hình","Rule thi đấu và bảo mật tài khoản");
  return `<div class="panel" style="margin-bottom:16px"><div class="panel-head"><div><h2>Bảo mật tài khoản</h2><p>Đổi mật khẩu đăng nhập hiện tại</p></div><button class="btn secondary" data-action="changePassword">Đổi mật khẩu</button></div></div><div class="page-grid">${state.divisions.map(d=>`<div class="panel"><div class="panel-head"><div><h2>${d.name}</h2><p>${d.eventType} • ${d.format}</p></div></div>
    <div class="form-grid">
      <label class="field">Best of<select data-rule-best="${d.id}" ${canManage()?"":"disabled"}><option value="1" ${d.bestOf===1?"selected":""}>1</option><option value="3" ${d.bestOf===3?"selected":""}>3</option><option value="5" ${d.bestOf===5?"selected":""}>5</option></select></label>
      <label class="field">Điểm thắng<select data-rule-points="${d.id}" ${canManage()?"":"disabled"}><option value="11" ${d.pointsToWin===11?"selected":""}>11</option><option value="15" ${d.pointsToWin===15?"selected":""}>15</option><option value="21" ${d.pointsToWin===21?"selected":""}>21</option></select></label>
      <label class="field">Top đi tiếp<input data-rule-advance="${d.id}" type="number" min="1" max="16" value="${d.advanceCount}" ${canManage()?"":"disabled"}></label>
      <label class="field" style="align-content:end"><span><input data-rule-win2="${d.id}" type="checkbox" ${d.winByTwo?"checked":""} ${canManage()?"":"disabled"}> Thắng cách 2</span></label>
      ${canManage()?`<div class="field full"><button class="btn primary" data-save-rules="${d.id}">Lưu cấu hình</button></div>`:""}
    </div></div>`).join("")}</div>`;
}
async function render(){
  renderNav();
  const map={dashboard,tournaments,players,matches:()=>matchesPage(false),scores:()=>matchesPage(true),standings,bracket,courts,referees:refereesPage,payments,audit:auditPage,settings};
  const fn=map[page]||dashboard;
  const html=await fn();
  $("#content").innerHTML=html;
  bindDynamic();
}
function bindDynamic(){
  document.querySelectorAll("[data-goto]").forEach(b=>b.onclick=()=>{page=b.dataset.goto;render()});
  document.querySelectorAll("[data-score-match]").forEach(b=>b.onclick=()=>openScore(b.dataset.scoreMatch));
  document.querySelectorAll('[data-action="newTournament"]').forEach(b=>b.onclick=openTournamentModal);
  document.querySelectorAll('[data-action="newTeam"]').forEach(b=>b.onclick=openTeamModal);
  document.querySelectorAll('[data-action="newReferee"]').forEach(b=>b.onclick=openRefereeModal);
  document.querySelectorAll('[data-action="newRegistration"]').forEach(b=>b.onclick=openRegistrationModal);
  document.querySelectorAll('[data-action="newMatch"]').forEach(b=>b.onclick=openMatchModal);
  document.querySelectorAll('[data-action="changePassword"]').forEach(b=>b.onclick=openPasswordModal);
  document.querySelectorAll('[data-action="autoSchedule"]').forEach(b=>b.onclick=openAutoScheduleModal);
  document.querySelectorAll('[data-action="autoBracket"]').forEach(b=>b.onclick=openAutoBracketModal);
  document.querySelectorAll("[data-match-detail]").forEach(b=>b.onclick=()=>openMatchDetail(b.dataset.matchDetail));
  document.querySelectorAll("[data-add-payment]").forEach(b=>b.onclick=()=>openPaymentModal(b.dataset.addPayment));
  document.querySelectorAll("[data-review-payment]").forEach(b=>b.onclick=async()=>{try{await API.reviewPayment(b.dataset.reviewPayment,b.dataset.status);await render();toast("Đã cập nhật thanh toán.")}catch(e){toast("Không thể xử lý: "+e.message)}});
  document.querySelectorAll("[data-save-rules]").forEach(b=>b.onclick=()=>saveRules(b.dataset.saveRules));
}
function divisionForMatch(m){return state.divisions.find(d=>d.id===m.divisionId)}
function openScore(id){
  activeMatch=state.matches.find(m=>m.id===id);if(!activeMatch)return;
  if(activeMatch.a==="TBD"||activeMatch.b==="TBD"){toast("Chưa xác định đủ hai đội.");return}
  const d=divisionForMatch(activeMatch);
  $("#scoreMeta").textContent=`${activeMatch.stage} • Sân ${activeMatch.court} • ${activeMatch.time}`;
  $("#scoreTitle").textContent=`Nhập điểm trận`;
  $("#teamAName").textContent=teamName(activeMatch.a);$("#teamBName").textContent=teamName(activeMatch.b);
  if(d){$("#targetScore").value=String(d.pointsToWin);$("#targetScore").disabled=true;$("#winByTwo").checked=d.winByTwo;$("#winByTwo").disabled=true}
  syncScoreDialog();$("#scoreDialog").showModal();
}
function syncScoreDialog(){
  if(!activeMatch)return;
  $("#scoreA").textContent=activeMatch.current?.[0]||0;$("#scoreB").textContent=activeMatch.current?.[1]||0;
  $("#scoreSets").innerHTML=activeMatch.sets?.length?activeMatch.sets.map((s,i)=>`<span class="set-chip">Set ${i+1}: ${s[0]}–${s[1]}</span>`).join(""):'<span style="font-size:12px;color:#73847b">Chưa có set hoàn tất</span>';
}
async function scorePoint(side,delta){
  if(busy||!activeMatch)return;busy=true;
  try{
    await API.point(activeMatch.id,{side:side.toUpperCase(),delta:Number(delta),expectedVersion:activeMatch.version});
    await refresh({keepDialog:true});
  }catch(e){if(e.status===409){toast("Điểm vừa được cập nhật từ máy khác. Đang đồng bộ...");await refresh({keepDialog:true})}else toast("Không thể cập nhật điểm: "+e.message)}
  finally{busy=false}
}
async function finishSet(){
  if(busy||!activeMatch)return;busy=true;
  try{await API.finishSet(activeMatch.id,{expectedVersion:activeMatch.version});await refresh({keepDialog:true});toast("Đã chốt set.")}
  catch(e){if(e.status===409){await refresh({keepDialog:true});toast("Dữ liệu đã thay đổi, vui lòng kiểm tra lại.")}else toast(e.message==="INVALID_SET_SCORE"?"Điểm chưa đủ điều kiện thắng set.":"Không thể chốt set: "+e.message)}
  finally{busy=false}
}
async function finishMatch(){
  if(busy||!activeMatch)return;busy=true;
  try{await API.finishMatch(activeMatch.id,{expectedVersion:activeMatch.version});$("#scoreDialog").close();activeMatch=null;await refresh();toast("Đã chốt trận và cập nhật bracket/BXH.")}
  catch(e){if(e.status===409){await refresh({keepDialog:true});toast("Dữ liệu đã thay đổi, kiểm tra lại.")}else toast(e.message==="NOT_ENOUGH_SET_WINS"?"Chưa đủ số set thắng để kết thúc trận.":"Không thể chốt trận: "+e.message)}
  finally{busy=false}
}
async function undoScore(){
  if(busy||!activeMatch)return;busy=true;
  try{await API.undo(activeMatch.id);await refresh({keepDialog:true});toast("Đã Undo và ghi audit log.")}
  catch(e){toast(e.message==="NOTHING_TO_UNDO"?"Không còn thao tác để Undo.":"Không thể Undo: "+e.message)}
  finally{busy=false}
}
function openPasswordModal(){
  $("#genericTitle").textContent="Đổi mật khẩu";
  $("#genericBody").innerHTML=`<div class="form-grid"><label class="field full">Mật khẩu hiện tại<input id="pwCurrent" type="password"></label><label class="field full">Mật khẩu mới<input id="pwNew" type="password" minlength="10"></label><label class="field full">Nhập lại mật khẩu mới<input id="pwConfirm" type="password" minlength="10"></label><div class="field full"><button type="button" class="btn primary" id="savePassword">Đổi mật khẩu</button></div></div>`;
  $("#genericDialog").showModal();
  $("#savePassword").onclick=async()=>{const n=$("#pwNew").value;if(n!==$("#pwConfirm").value)return toast("Mật khẩu nhập lại không khớp.");try{await API.changePassword($("#pwCurrent").value,n);toast("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");location.href="/login"}catch(e){toast(e.message==="INVALID_CURRENT_PASSWORD"?"Mật khẩu hiện tại không đúng.":e.message==="PASSWORD_TOO_SHORT"?"Mật khẩu mới phải từ 10 ký tự.":"Không thể đổi mật khẩu.")}};
}
function selectDivisionDialog(title,buttonText,onSubmit){
  if(!state.divisions.length)return toast("Chưa có nội dung thi đấu.");
  $("#genericTitle").textContent=title;
  $("#genericBody").innerHTML=`<div class="form-grid"><label class="field full">Nội dung<select id="autoDivision">${state.divisions.map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}</select></label><div class="field full"><button type="button" class="btn primary" id="autoSubmit">${buttonText}</button></div></div>`;
  $("#genericDialog").showModal();$("#autoSubmit").onclick=()=>onSubmit($("#autoDivision").value);
}
function openAutoScheduleModal(){selectDivisionDialog("Tạo lịch vòng bảng","Tạo lịch",async id=>{try{const r=await API.generateRoundRobin(id);$("#genericDialog").close();await refresh();toast(`Đã tạo ${r.created} trận vòng bảng.`)}catch(e){toast("Không thể tạo lịch: "+e.message)}})}
function openAutoBracketModal(){selectDivisionDialog("Tạo bracket","Tạo từ BXH",async id=>{try{await API.generateBracket(id);$("#genericDialog").close();await refresh();toast("Đã tạo bán kết và chung kết.")}catch(e){const m={GROUP_STAGE_NOT_COMPLETE:"Vòng bảng chưa kết thúc.",BRACKET_ALREADY_EXISTS:"Bracket đã tồn tại.",BRACKET_GENERATOR_SUPPORTS_TWO_GROUPS_TOP2:"Auto bracket hiện áp dụng cấu hình 2 bảng, Top 2."}[e.message]||e.message;toast(m)}})}
async function openMatchModal(){
  if(!state.divisions.length)return toast("Cần tạo giải/nội dung trước.");
  const refs=canManage()?await API.referees().catch(()=>[]):[];
  $("#genericTitle").textContent="Tạo trận đấu";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Nội dung<select id="mDivision">${state.divisions.map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}</select></label>
    <label class="field full">Đội A<select id="mTeamA"></select></label>
    <label class="field full">Đội B<select id="mTeamB"></select></label>
    <label class="field">Vòng / Stage<input id="mStage" value="Vòng bảng"></label>
    <label class="field">Giờ đấu<input id="mTime" type="datetime-local"></label>
    <label class="field">Sân<select id="mCourt"><option value="">Chưa gán</option>${state.courts.map(x=>`<option value="${x.id}">${x.name}</option>`).join("")}</select></label>
    <label class="field">Trọng tài<select id="mRef"><option value="">Chưa gán</option>${refs.map(r=>`<option value="${r.id}">${r.display_name}</option>`).join("")}</select></label>
    <div class="field full"><button type="button" class="btn primary" id="saveMatch">Tạo trận</button></div>
  </div>`;
  const syncTeams=()=>{const did=$("#mDivision").value,ts=state.teams.filter(t=>t.divisionId===did),opts=ts.map(t=>`<option value="${t.id}">${t.name}</option>`).join("");$("#mTeamA").innerHTML=opts;$("#mTeamB").innerHTML=opts;if(ts.length>1)$("#mTeamB").selectedIndex=1};
  $("#genericDialog").showModal();syncTeams();$("#mDivision").onchange=syncTeams;
  $("#saveMatch").onclick=async()=>{try{await API.createMatch($("#mDivision").value,{teamAId:$("#mTeamA").value,teamBId:$("#mTeamB").value,courtId:$("#mCourt").value||null,refereeUserId:$("#mRef").value||null,stage:$("#mStage").value||"Vòng bảng",scheduledAt:$("#mTime").value||null});$("#genericDialog").close();await refresh();toast("Đã tạo trận.")}catch(e){toast("Không thể tạo trận: "+e.message)}};
}
async function openMatchDetail(id){
  const m=state.matches.find(x=>x.id===id);if(!m)return;
  const refs=canManage()?await API.referees().catch(()=>[]):[];
  $("#genericTitle").textContent="Chi tiết trận";
  $("#genericBody").innerHTML=`<div class="panel" style="box-shadow:none;border:0;padding:0"><p><b>${teamName(m.a)}</b> vs <b>${teamName(m.b)}</b></p><p style="color:#708078">${m.stage} • ${m.time} • Sân ${m.court}</p>
    ${canManage()?`<div class="form-grid"><label class="field">Sân<select id="detailCourt"><option value="">Giữ nguyên</option>${state.courts.map(x=>`<option value="${x.id}" ${x.id===m.courtId?"selected":""}>${x.name}</option>`).join("")}</select></label><label class="field">Trọng tài<select id="detailRef"><option value="">Chưa gán</option>${refs.map(r=>`<option value="${r.id}" ${r.id===m.refereeId?"selected":""}>${r.display_name}</option>`).join("")}</select></label><label class="field full">Đổi giờ<input id="detailTime" type="datetime-local"></label><div class="field full"><button type="button" class="btn primary" id="saveAssignment">Lưu điều phối</button></div></div>`:""}
  </div>`;
  $("#genericDialog").showModal();
  const btn=$("#saveAssignment");if(btn)btn.onclick=async()=>{try{await API.assignMatch(m.id,{courtId:$("#detailCourt").value||null,refereeUserId:$("#detailRef").value||null,scheduledAt:$("#detailTime").value||null});$("#genericDialog").close();await refresh();toast("Đã cập nhật điều phối.")}catch(e){toast("Không thể cập nhật: "+e.message)}};
}
function openTournamentModal(){
  $("#genericTitle").textContent="Tạo giải mới";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Tên giải<input id="fName" placeholder="VD: Bình Lợi Open 2026"></label>
    <label class="field">Ngày giờ<input id="fDate" type="datetime-local"></label>
    <label class="field">Nội dung<select id="fType"><option value="doubles">Đôi nam/nữ</option><option value="mixed_doubles">Đôi nam nữ</option><option value="singles">Đơn</option><option value="team">Đồng đội</option></select></label>
    <label class="field full">Địa điểm<input id="fVenue" placeholder="Tên sân / CLB"></label>
    <div class="field full"><button type="button" class="btn primary" id="saveTournament">Tạo giải</button></div>
  </div>`;
  $("#genericDialog").showModal();
  $("#saveTournament").onclick=async()=>{const name=$("#fName").value.trim();if(!name)return toast("Nhập tên giải.");try{await API.createTournament({name,venue:$("#fVenue").value,startAt:$("#fDate").value||null,eventType:$("#fType").value});$("#genericDialog").close();await refresh();toast("Đã tạo giải.")}catch(e){toast("Không thể tạo giải: "+e.message)}};
}
function openTeamModal(){
  if(!state.divisions.length)return toast("Cần tạo giải/nội dung trước.");
  $("#genericTitle").textContent="Thêm cặp VĐV";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Nội dung<select id="teamDivision">${state.divisions.map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}</select></label>
    <label class="field full">Tên cặp<input id="teamName" placeholder="VĐV 1 / VĐV 2"></label>
    <label class="field">CLB<input id="teamClub"></label>
    <label class="field">Bảng<input id="teamGroup" value="A" maxlength="3"></label>
    <label class="field">Seed<input id="teamSeed" type="number" min="1"></label>
    <div class="field full"><button type="button" class="btn primary" id="saveTeam">Thêm cặp</button></div>
  </div>`;
  $("#genericDialog").showModal();
  $("#saveTeam").onclick=async()=>{const name=$("#teamName").value.trim();if(!name)return toast("Nhập tên cặp.");try{await API.createTeam($("#teamDivision").value,{name,club:$("#teamClub").value,group:$("#teamGroup").value||"A",seed:Number($("#teamSeed").value)||null});$("#genericDialog").close();await refresh();toast("Đã thêm cặp.")}catch(e){toast("Không thể thêm cặp: "+e.message)}};
}
async function saveRules(id){
  try{
    await API.updateDivision(id,{
      bestOf:Number(document.querySelector(`[data-rule-best="${id}"]`).value),
      pointsToWin:Number(document.querySelector(`[data-rule-points="${id}"]`).value),
      advanceCount:Number(document.querySelector(`[data-rule-advance="${id}"]`).value),
      winByTwo:document.querySelector(`[data-rule-win2="${id}"]`).checked
    });
    await refresh();toast("Đã lưu rule thi đấu.");
  }catch(e){toast("Không thể lưu: "+e.message)}
}
function openRegistrationModal(){
  if(!state.divisions.length||!state.teams.length)return toast("Chưa có nội dung hoặc đội.");
  $("#genericTitle").textContent="Tạo đăng ký";
  $("#genericBody").innerHTML=`<div class="form-grid"><label class="field full">Nội dung<select id="regDivision">${state.divisions.map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}</select></label><label class="field full">Đội<select id="regTeam">${state.teams.map(t=>`<option value="${t.id}" data-div="${t.divisionId}">${t.name}</option>`).join("")}</select></label><label class="field full">Lệ phí<input id="regAmount" type="number" min="0" placeholder="VD: 500000"></label><div class="field full"><button type="button" class="btn primary" id="saveRegistration">Tạo đăng ký</button></div></div>`;
  $("#genericDialog").showModal();
  $("#saveRegistration").onclick=async()=>{try{await API.createRegistration($("#regDivision").value,{teamId:$("#regTeam").value,amount:Number($("#regAmount").value)||null});$("#genericDialog").close();await render();toast("Đã tạo đăng ký.")}catch(e){toast("Không thể tạo: "+e.message)}};
}
function openPaymentModal(registrationId){
  $("#genericTitle").textContent="Ghi nhận chuyển khoản";
  $("#genericBody").innerHTML=`<div class="form-grid"><label class="field full">Mã giao dịch / nội dung CK<input id="payRef"></label><label class="field full">Link biên lai (nếu có)<input id="payReceipt" type="url"></label><div class="field full"><button type="button" class="btn primary" id="savePayment">Ghi nhận</button></div></div>`;
  $("#genericDialog").showModal();
  $("#savePayment").onclick=async()=>{try{await API.addPayment(registrationId,{method:"bank_transfer",referenceCode:$("#payRef").value,receiptUrl:$("#payReceipt").value});$("#genericDialog").close();await render();toast("Đã ghi nhận, chờ duyệt.")}catch(e){toast("Không thể ghi nhận: "+e.message)}};
}
function openRefereeModal(){
  $("#genericTitle").textContent="Tạo tài khoản trọng tài";
  $("#genericBody").innerHTML=`<div class="form-grid"><label class="field full">Tên<input id="rName"></label><label class="field full">Email<input id="rEmail" type="email"></label><label class="field full">Mật khẩu tạm<input id="rPassword" type="password" minlength="8"></label><div class="field full"><button type="button" class="btn primary" id="saveReferee">Tạo tài khoản</button></div></div>`;
  $("#genericDialog").showModal();$("#saveReferee").onclick=async()=>{try{await API.createReferee({name:$("#rName").value,email:$("#rEmail").value,password:$("#rPassword").value});$("#genericDialog").close();await render();toast("Đã tạo trọng tài.")}catch(e){toast("Không thể tạo: "+e.message)}};
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-score]");if(b&&activeMatch)scorePoint(b.dataset.score,Number(b.dataset.delta))});
$("#finishSet").onclick=finishSet;$("#finishMatch").onclick=finishMatch;$("#undoScore").onclick=undoScore;
$("#mobileMenu").onclick=()=>$("#sidebar").classList.toggle("open");
$("#quickTournament").onclick=()=>canManage()?openTournamentModal():toast("Bạn không có quyền tạo giải.");
$("#logoutBtn").onclick=async()=>{await API.logout().catch(()=>{});location.href="/login"};

(async function boot(){
  try{
    const me=await API.me();user=me.user;$("#userName").textContent=user.name;$("#userRole").textContent=roleLabel(user.role);
    if(user.role==="referee")page="scores";
    state=await API.adminState();await render();
    const socket=window.io?io():null;
    if(socket){
      socket.on("public:state",async()=>{if(!busy)await refresh({keepDialog:true})});
      socket.on("match:update",async()=>{if(!busy)await refresh({keepDialog:true})});
    }
  }catch(e){console.error(e)}
})();