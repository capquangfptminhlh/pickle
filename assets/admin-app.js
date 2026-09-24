const API=window.PickleAPI;
const $=s=>document.querySelector(s);
const NAV=[
  ["dashboard","dashboard","Tổng quan"],
  ["tournaments","trophy","Giải đấu"],
  ["registrations","checkin","Đăng ký & Check-in"],
  ["players","users","VĐV & cặp đấu"],
  ["clubs","club","CLB"],
  ["matches","calendar","Lịch & trận đấu"],
  ["scores","score","Nhập điểm"],
  ["standings","standings","Bảng xếp hạng"],
  ["bracket","bracket","Bracket"],
  ["courts","court","Sân thi đấu"],
  ["bookings","booking","Booking sân"],
  ["referees","whistle","Trọng tài"],
  ["payments","payment","Thanh toán"],
  ["sponsors","sponsor","Sponsor"],
  ["content","content","Tin tức & Media"],
  ["reports","report","Báo cáo"],
  ["audit","audit","Nhật ký"],
  ["settings","settings","Cấu hình & Branding"]
];
const ICONS={
  dashboard:'<path d="M4 4h6v6H4zM14 4h6v4h-6zM14 12h6v8h-6zM4 14h6v6H4z"/>',
  trophy:'<path d="M8 3h8v3h3v2c0 3-2 5-5 5a6 6 0 0 1-2 2v3h4v2H8v-2h4v-3a6 6 0 0 1-2-2c-3 0-5-2-5-5V6h3V3Zm0 5V6H7v2c0 1 .4 2 1.2 2.6A8 8 0 0 1 8 8Zm8 0c0 .9-.1 1.8-.2 2.6C16.6 10 17 9 17 8V6h-1Z"/>',
  checkin:'<path d="M4 5h16v14H4zM8 3v4M16 3v4M8 12l2.5 2.5L16 9"/>',
  users:'<path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-4 2.7-6 6-6s6 2 6 6H2Zm12-6c3.4 0 6 1.7 6 5h-4c-.2-2-1-3.6-2.4-4.7Z"/>',
  club:'<path d="M3 20h18M5 20V8l7-4 7 4v12M9 12h2M13 12h2M9 16h6"/>',
  calendar:'<path d="M4 5h16v15H4zM8 3v4M16 3v4M4 9h16M8 13h3M13 13h3"/>',
  score:'<path d="M4 5h16v14H4zM8 9h3v6H8zm5 0h3v6h-3z"/>',
  standings:'<path d="M5 6h14M5 12h14M5 18h14M8 4v4M12 10v4M16 16v4"/>',
  bracket:'<path d="M5 4v4h4v4h6v4h4M5 20v-4h4v-4"/>',
  court:'<path d="M3 5h18v14H3zM12 5v14M3 12h18"/>',
  booking:'<path d="M5 4h14v16H5zM8 2v4M16 2v4M8 11h8M8 15h5"/>',
  whistle:'<path d="M5 13a5 5 0 1 0 9.5-2H20V7h-7v3a5 5 0 0 0-8 3Zm5 2a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/>',
  payment:'<path d="M3 6h18v12H3zM3 9h18M7 14h4"/>',
  sponsor:'<path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7l-8-4Zm-3 9 2 2 4-4"/>',
  content:'<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>',
  report:'<path d="M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z"/>',
  audit:'<path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/>',
  settings:'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5 2 2 3-.5.5 3 2 2-2 2 .5 3-3 .5-2 2-2-2-3 .5-.5-3-2-2 2-2-.5-3 3-.5 2-2Z"/>'
};
const iconSvg=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||ICONS.dashboard}</svg>`;
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
  $("#nav").innerHTML=visibleNav().map(([id,ico,label])=>`<button class="nav-btn ${page===id?"active":""}" data-page="${id}"><span class="ico">${iconSvg(ico)}</span><span>${label}</span></button>`).join("");
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{page=b.dataset.page;$("#sidebar").classList.remove("open");render()});
}
function setHeader(title,sub){$("#pageTitle").textContent=title;$("#pageSub").textContent=sub}
function matchCard(m){
  const scoreBtn=m.a!=="TBD"&&m.b!=="TBD"?`<button class="mini" data-score-match="${m.id}">Nhập điểm</button>`:"";
  return `<div class="match-card" data-match-card="${m.id}">
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
  return `<article class="tour-card" data-tournament-card="${t.id}"><div class="tour-cover"><strong>${t.format||"Tournament"}</strong>${statusBadge(t.status)}</div><div class="tour-body">
    <h3>${t.name}</h3><div class="tour-meta-grid"><span><small>Ngày</small><b>${t.date}</b></span><span><small>Địa điểm</small><b>${t.venue}</b></span><span><small>Đội</small><b>${t.teams}</b></span></div>
    <div class="actions"><button class="mini" data-goto="matches">Lịch đấu</button><button class="mini" data-goto="standings">BXH</button><button class="mini" data-goto="bracket">Bracket</button></div>
  </div></article>`;
}
function tournaments(){
  setHeader("Giải đấu","Tạo và quản lý giải pickleball");
  return `<div class="panel-head"><div><h2>Danh sách giải</h2><p>${state.tournaments.length} giải</p></div>${canManage()?'<div class="actions"><button class="btn secondary" data-action="newDivision">Nội dung</button><button class="btn primary" data-action="newTournament">Tạo giải mới</button></div>':""}</div>
  <div class="page-grid">${state.tournaments.map(tournamentCard).join("")||'<div class="empty">Chưa có giải.</div>'}</div>`;
}
async function players(){
  setHeader("VĐV & cặp đấu","Hồ sơ VĐV, CLB, rating và đội tham dự");
  const roster=canManage()?await API.players().catch(()=>[]):[];
  return `<div class="panel" style="margin-bottom:16px">
    <div class="panel-head"><div><h2>Hồ sơ VĐV</h2><p>${roster.length} VĐV</p></div>${canManage()?'<div class="actions"><button class="btn secondary" data-action="importCsv">Import CSV</button><button class="btn secondary" data-action="newClub">Thêm CLB</button><button class="btn primary" data-action="newPlayer">Thêm VĐV</button></div>':""}</div>
    <div class="table-wrap"><table class="table"><thead><tr><th>VĐV</th><th>CLB</th><th>Giới tính</th><th>Rating</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${roster.map(p=>`<tr data-player-row="${p.id}"><td><div style="display:flex;align-items:center;gap:10px">${p.avatar_url?`<img src="${p.avatar_url}" alt="" style="width:42px;height:42px;border-radius:12px;object-fit:cover">`:`<span style="width:42px;height:42px;border-radius:12px;background:#eaf1ed;display:grid;place-items:center;font-weight:900">${(p.full_name||"P").split(/\\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase()}</span>`}<span><b>${p.full_name}</b>${p.nickname?`<small style="display:block;color:#73847b">${p.nickname}</small>`:""}</span></div></td><td>${p.club_name||"Tự do"}</td><td>${p.gender||"—"}</td><td><b>${Number(p.rating||0).toFixed(3)}</b></td><td>${p.active?'<span class="badge live">HOẠT ĐỘNG</span>':'<span class="badge done">KHÓA</span>'}</td><td>${canManage()?`<a class="mini" href="player.html?id=${encodeURIComponent(p.id)}" target="_blank" style="text-decoration:none">Hồ sơ</a><button class="mini" data-avatar-player="${p.id}" data-avatar-name="${p.full_name}">Avatar</button><button class="mini" data-rating-player="${p.id}" data-rating-name="${p.full_name}" data-rating-current="${p.rating||0}">Rating</button>`:""}</td></tr>`).join("")}
    </tbody></table></div>
  </div>
  <div class="panel"><div class="panel-head"><div><h2>Cặp / đội thi đấu</h2><p>${state.teams.length} đội/cặp</p></div>${canManage()?'<div class="actions"><button class="btn secondary" data-action="autoSeed">Chia bảng tự động</button><button class="btn primary" data-action="newTeam">Thêm cặp / đội</button></div>':""}</div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Seed</th><th>Cặp VĐV</th><th>CLB</th><th>Bảng</th><th>W</th><th>L</th><th>+/-</th></tr></thead>
      <tbody>${state.teams.map(t=>`<tr data-team-row="${t.id}"><td>${t.seed||"—"}</td><td><b>${t.name}</b></td><td>${t.club}</td><td><span class="badge blue">${t.group||"—"}</span></td><td>${t.w}</td><td>${t.l}</td><td>${t.pf-t.pa>0?"+":""}${t.pf-t.pa}</td></tr>`).join("")}</tbody>
    </table></div>
  </div>`;
}
function matchesPage(scoreOnly=false){
  setHeader(scoreOnly?"Nhập điểm":"Lịch & trận đấu",scoreOnly?"Giao diện courtside cho BTC/trọng tài":"Điều phối sân, giờ đấu và trạng thái");
  const arr=scoreOnly?state.matches.filter(m=>m.status!=="done"):state.matches;
  return `<div class="filters"><select id="courtFilter"><option value="">Tất cả sân</option>${[1,2,3,4,5,6].map(x=>`<option>${x}</option>`).join("")}</select>
    <select id="statusFilter"><option value="">Tất cả trạng thái</option><option value="live">Đang đấu</option><option value="wait">Chờ</option><option value="done">Kết thúc</option></select>${canManage()?'<button class="btn secondary" data-action="autoSchedule">Tạo lịch tự động</button><button class="btn primary" data-action="newMatch">Tạo trận</button>':""}</div>
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
  setHeader("Bracket","Single elimination, double elimination và tự routing nhánh");
  const html=window.PickleBracket?.render(state.matches,teamName,{admin:true})||'<div class="empty">Bracket renderer chưa tải.</div>';
  const champ=window.PickleBracket?.champion(state.matches,teamName)||"Chưa xác định";
  return `<div class="panel"><div class="panel-head"><div><h2>Bracket thi đấu</h2><p>Tự tạo từ BXH hoặc seed, hỗ trợ BYE và nhánh thua</p></div>${canManage()?'<button class="btn primary" data-action="autoBracket">Tạo / sinh bracket</button>':""}</div>${html}<div class="admin-champion"><span>CHAMPION</span><strong>${champ}</strong></div></div>`;
}
function courts(){
  setHeader("Sân thi đấu","Theo dõi và cấu hình sân theo giải");
  const cards=state.courts.map(c=>{const live=state.matches.find(m=>m.courtId===c.id&&m.status==="live"),next=state.matches.find(m=>m.courtId===c.id&&m.status==="wait");return `<div class="panel" data-court-card="${c.id}"><div class="panel-head"><h2>${c.name}</h2>${live?'<span class="badge live">LIVE</span>':'<span class="badge done">TRỐNG</span>'}</div><p style="font-size:13px"><b>Hiện tại:</b> ${live?teamName(live.a)+" vs "+teamName(live.b):"Không có trận"}</p><p style="font-size:12px;color:#73847b"><b>Tiếp theo:</b> ${next?next.time+" • "+teamName(next.a)+" vs "+teamName(next.b):"Chưa xếp"}</p></div>`});
  return `<div class="panel-head"><div><h2>Danh sách sân</h2><p>${state.courts.length} sân</p></div>${canManage()?'<button class="btn primary" data-action="newCourt">Thêm sân</button>':""}</div><div class="page-grid">${cards.join("")||'<div class="panel empty">Chưa khai báo sân.</div>'}</div>`;
}
async function refereesPage(){
  setHeader("Trọng tài","Tài khoản và phân quyền nhập điểm");
  if(!canReferees())return '<div class="panel empty">Chỉ Super Admin được tạo tài khoản trọng tài.</div>';
  const refs=await API.referees().catch(()=>[]);
  return `<div class="panel"><div class="panel-head"><div><h2>Danh sách trọng tài</h2><p>${refs.length} tài khoản</p></div><button class="btn primary" data-action="newReferee">Tạo trọng tài</button></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Tên</th><th>Email</th><th>Trạng thái</th></tr></thead><tbody>${refs.map(r=>`<tr><td><b>${r.display_name}</b></td><td>${r.email}</td><td>${r.active?'<span class="badge live">HOẠT ĐỘNG</span>':'<span class="badge done">KHÓA</span>'}</td></tr>`).join("")}</tbody></table></div>
  </div>`;
}
async function payments(){
  setHeader("Thanh toán","Đăng ký giải, phí tham dự và đối soát");
  if(!canManage())return '<div class="panel empty">Bạn không có quyền quản lý thanh toán.</div>';
  const rows=await API.registrations().catch(()=>[]);
  return `<div class="panel">
    <div class="panel-head"><div><h2>Đăng ký & thanh toán</h2><p>${rows.length} hồ sơ</p></div><button class="btn primary" data-action="newRegistration">Tạo đăng ký</button></div>
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
  const ctx={API,state,user,setHeader,toast,refresh,canManage};
  const map={
    dashboard,tournaments,
    registrations:()=>window.AdminModules.registrations(ctx),
    players,
    clubs:()=>window.AdminModules.clubs(ctx),
    matches:()=>matchesPage(false),scores:()=>matchesPage(true),standings,bracket,courts,
    bookings:()=>window.AdminModules.bookings(ctx),
    referees:refereesPage,payments,
    sponsors:()=>window.AdminModules.sponsors(ctx),
    content:()=>window.AdminModules.content(ctx),
    reports:()=>window.AdminModules.reports(ctx),
    audit:auditPage,
    settings:()=>window.AdminModules.settings(ctx)
  };
  const fn=map[page]||dashboard;
  const result=await fn();
  const html=typeof result==="string"?result:result.html;
  $("#content").innerHTML=html;
  bindDynamic();
  if(result&&typeof result==="object"&&typeof result.bind==="function")result.bind();
  await window.AdminCrud?.decorate({page,state,user,refresh,toast});
}
function bindDynamic(){
  document.querySelectorAll("[data-goto]").forEach(b=>b.onclick=()=>{page=b.dataset.goto;render()});
  document.querySelectorAll("[data-score-match]").forEach(b=>b.onclick=()=>openScore(b.dataset.scoreMatch));
  document.querySelectorAll('[data-action="newTournament"]').forEach(b=>b.onclick=openTournamentModal);
  document.querySelectorAll('[data-action="newDivision"]').forEach(b=>b.onclick=openDivisionModal);
  document.querySelectorAll('[data-action="newCourt"]').forEach(b=>b.onclick=openCourtModal);
  document.querySelectorAll('[data-action="newTeam"]').forEach(b=>b.onclick=openTeamModal);
  document.querySelectorAll('[data-action="autoSeed"]').forEach(b=>b.onclick=openAutoSeedModal);
  document.querySelectorAll('[data-action="newPlayer"]').forEach(b=>b.onclick=openPlayerModal);
  document.querySelectorAll('[data-action="importCsv"]').forEach(b=>b.onclick=openCsvImportModal);
  document.querySelectorAll('[data-action="newClub"]').forEach(b=>b.onclick=openClubModal);
  document.querySelectorAll("[data-rating-player]").forEach(b=>b.onclick=()=>openRatingModal(b.dataset.ratingPlayer,b.dataset.ratingName,b.dataset.ratingCurrent));
  document.querySelectorAll("[data-avatar-player]").forEach(b=>b.onclick=()=>openAvatarModal(b.dataset.avatarPlayer,b.dataset.avatarName));
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
  $("#savePassword").onclick=async()=>{const n=$("#pwNew").value;if(n!==$("#pwConfirm").value)return toast("Mật khẩu nhập lại không khớp.");try{await API.changePassword($("#pwCurrent").value,n);toast("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");location.href=location.pathname.includes("/preview/")?"admin.html":"/login"}catch(e){toast(e.message==="INVALID_CURRENT_PASSWORD"?"Mật khẩu hiện tại không đúng.":e.message==="PASSWORD_TOO_SHORT"?"Mật khẩu mới phải từ 10 ký tự.":"Không thể đổi mật khẩu.")}};
}
function selectDivisionDialog(title,buttonText,onSubmit){
  if(!state.divisions.length)return toast("Chưa có nội dung thi đấu.");
  $("#genericTitle").textContent=title;
  $("#genericBody").innerHTML=`<div class="form-grid"><label class="field full">Nội dung<select id="autoDivision">${state.divisions.map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}</select></label><div class="field full"><button type="button" class="btn primary" id="autoSubmit">${buttonText}</button></div></div>`;
  $("#genericDialog").showModal();$("#autoSubmit").onclick=()=>onSubmit($("#autoDivision").value);
}
function openAutoScheduleModal(){selectDivisionDialog("Tạo lịch vòng bảng","Tạo lịch",async id=>{try{const r=await API.generateRoundRobin(id);$("#genericDialog").close();await refresh();toast(`Đã tạo ${r.created} trận vòng bảng.`)}catch(e){toast("Không thể tạo lịch: "+e.message)}})}
function openAutoBracketModal(){selectDivisionDialog("Tạo bracket","Tạo từ BXH",async id=>{try{await API.generateBracket(id);$("#genericDialog").close();await refresh();toast("Đã tạo bán kết và chung kết.")}catch(e){const m={GROUP_STAGE_NOT_COMPLETE:"Vòng bảng chưa kết thúc.",BRACKET_ALREADY_EXISTS:"Bracket đã tồn tại.",DOUBLE_ELIM_SUPPORTS_4_OR_8_TEAMS:"Double elimination hiện hỗ trợ 4 hoặc 8 đội.",ROUND_ROBIN_HAS_NO_KNOCKOUT:"Nội dung Round Robin không cần bracket.",NOT_ENOUGH_QUALIFIERS:"Không đủ đội vào vòng loại trực tiếp.",NO_ACTIVE_COURTS:"Chưa có sân hoạt động."}[e.message]||e.message;toast(m)}})}
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
  const assignment=canManage()?`<div class="form-grid">
    <label class="field">Sân<select id="detailCourt"><option value="">Giữ nguyên</option>${state.courts.map(x=>`<option value="${x.id}" ${x.id===m.courtId?"selected":""}>${x.name}</option>`).join("")}</select></label>
    <label class="field">Trọng tài<select id="detailRef"><option value="">Chưa gán</option>${refs.map(r=>`<option value="${r.id}" ${r.id===m.refereeId?"selected":""}>${r.display_name}</option>`).join("")}</select></label>
    <label class="field full">Đổi giờ<input id="detailTime" type="datetime-local"></label>
    <div class="field full"><button type="button" class="btn primary" id="saveAssignment">Lưu điều phối</button></div>
  </div>`:"";
  const special=m.status!=="done"&&m.a!=="TBD"&&m.b!=="TBD"?`<div class="special-result-box">
    <div class="panel-head"><div><h2>Kết quả đặc biệt</h2><p>Walkover / No-show / Retired / DQ, không cần nhập điểm giả</p></div></div>
    <div class="form-grid">
      <label class="field full">Đội thắng<select id="specialWinner"><option value="${m.a}">${teamName(m.a)}</option><option value="${m.b}">${teamName(m.b)}</option></select></label>
      <label class="field">Lý do<select id="specialReason"><option value="walkover">Walkover</option><option value="no_show">No-show</option><option value="retired">Retired</option><option value="injury">Chấn thương</option><option value="disqualified">Disqualified</option></select></label>
      <label class="field full">Ghi chú<textarea id="specialNote" rows="2"></textarea></label>
      <div class="field full"><button type="button" class="btn danger" id="saveSpecialResult">Chốt kết quả đặc biệt</button></div>
    </div>
  </div>`:"";
  $("#genericBody").innerHTML=`<div class="panel" style="box-shadow:none;border:0;padding:0">
    <div class="match-detail-summary"><div><small>${m.stage}</small><h3>${teamName(m.a)} <span>vs</span> ${teamName(m.b)}</h3><p>${m.time} • Sân ${m.court}</p></div>${statusBadge(m.status)}</div>
    ${m.resultReason?`<div class="result-reason"><b>${m.resultReason}</b><span>${m.resultNote||""}</span></div>`:""}
    ${assignment}
    ${special}
  </div>`;
  $("#genericDialog").showModal();

  const btn=$("#saveAssignment");
  if(btn)btn.onclick=async()=>{try{
    await API.assignMatch(m.id,{courtId:$("#detailCourt").value||null,refereeUserId:$("#detailRef").value||null,scheduledAt:$("#detailTime").value||null});
    $("#genericDialog").close();await refresh();toast("Đã cập nhật điều phối.");
  }catch(e){toast("Không thể cập nhật: "+e.message)}};

  const specialBtn=$("#saveSpecialResult");
  if(specialBtn)specialBtn.onclick=async()=>{
    if(!confirm("Chốt kết quả đặc biệt cho trận này?"))return;
    try{
      await API.specialResult(m.id,{winnerTeamId:$("#specialWinner").value,reason:$("#specialReason").value,note:$("#specialNote").value.trim()});
      $("#genericDialog").close();await refresh();toast("Đã chốt kết quả đặc biệt và cập nhật bracket.");
    }catch(e){toast("Không thể chốt: "+e.message)}
  };
}
function openDivisionModal(){
  if(!state.tournaments.length)return toast("Cần tạo giải trước.");
  $("#genericTitle").textContent="Thêm nội dung thi đấu";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Giải<select id="dTournament">${state.tournaments.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select></label>
    <label class="field full">Tên nội dung<input id="dName" placeholder="VD: Đôi nam 3.0–3.5"></label>
    <label class="field">Loại<select id="dType"><option value="doubles">Doubles</option><option value="mixed_doubles">Mixed Doubles</option><option value="singles">Singles</option><option value="team">Team</option></select></label>
    <label class="field">Thể thức<select id="dFormat"><option value="pool_to_knockout">Bảng + Knockout</option><option value="round_robin">Round Robin</option><option value="single_elimination">Loại trực tiếp</option><option value="double_elimination">Double Elimination</option></select></label>
    <label class="field">Best of<select id="dBest"><option value="1">1</option><option value="3" selected>3</option><option value="5">5</option></select></label>
    <label class="field">Điểm/set<select id="dPoints"><option value="11">11</option><option value="15">15</option><option value="21">21</option></select></label>
    <label class="field">Top đi tiếp<input id="dAdvance" type="number" value="2" min="1"></label>
    <label class="field" style="align-content:end"><span><input id="dWin2" type="checkbox" checked> Thắng cách 2</span></label>
    <div class="field full"><button type="button" class="btn primary" id="saveDivision">Thêm nội dung</button></div>
  </div>`;
  $("#genericDialog").showModal();
  $("#saveDivision").onclick=async()=>{try{await API.createDivision($("#dTournament").value,{name:$("#dName").value,eventType:$("#dType").value,format:$("#dFormat").value,bestOf:Number($("#dBest").value),pointsToWin:Number($("#dPoints").value),advanceCount:Number($("#dAdvance").value),winByTwo:$("#dWin2").checked});$("#genericDialog").close();await refresh();toast("Đã thêm nội dung.")}catch(e){toast("Không thể thêm: "+e.message)}};
}
function openCourtModal(){
  if(!state.tournaments.length)return toast("Cần tạo giải trước.");
  $("#genericTitle").textContent="Thêm sân";
  $("#genericBody").innerHTML=`<div class="form-grid"><label class="field full">Giải<select id="cTournament">${state.tournaments.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select></label><label class="field full">Tên sân<input id="cName" placeholder="VD: Sân 1"></label><div class="field full"><button type="button" class="btn primary" id="saveCourt">Thêm sân</button></div></div>`;
  $("#genericDialog").showModal();
  $("#saveCourt").onclick=async()=>{try{await API.createCourt($("#cTournament").value,{name:$("#cName").value});$("#genericDialog").close();await refresh();toast("Đã thêm sân.")}catch(e){toast("Không thể thêm sân: "+e.message)}};
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
function openCsvImportModal(){
  $("#genericTitle").textContent="Import CSV";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field">Loại dữ liệu<select id="csvType"><option value="players">VĐV</option><option value="teams">Đội / cặp</option></select></label>
    <label class="field" id="csvDivisionWrap" style="display:none">Nội dung<select id="csvDivision">${state.divisions.filter(d=>d.active!==false).map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}</select></label>
    <label class="field full">File CSV<input id="csvFile" type="file" accept=".csv,text/csv"></label>
    <div class="field full csv-help" id="csvHelp"><b>Header VĐV:</b> fullName,nickname,gender,rating,phone,club</div>
    <div class="field full"><div id="csvPreview" class="csv-preview">Chọn file để xem trước.</div></div>
    <div class="field full"><button type="button" class="btn primary" id="csvImportBtn" disabled>Import</button></div>
  </div>`;
  $("#genericDialog").showModal();
  let rows=[];
  const type=$("#csvType"),file=$("#csvFile"),preview=$("#csvPreview"),btn=$("#csvImportBtn");
  const updateHelp=()=>{const teams=type.value==="teams";$("#csvDivisionWrap").style.display=teams?"grid":"none";$("#csvHelp").innerHTML=teams?'<b>Header đội:</b> name,club,group,seed,player1,player2':'<b>Header VĐV:</b> fullName,nickname,gender,rating,phone,club'};
  type.onchange=()=>{updateHelp();rows=[];preview.textContent="Chọn file để xem trước.";btn.disabled=true};updateHelp();
  file.onchange=async()=>{
    const f=file.files?.[0];if(!f)return;rows=window.PickleCSV?.parse(await f.text())||[];
    if(!rows.length){preview.textContent="CSV không có dữ liệu hợp lệ.";btn.disabled=true;return}
    const keys=Object.keys(rows[0]);preview.innerHTML='<div class="csv-preview-head">'+keys.map(k=>`<b>${k}</b>`).join("")+'</div>'+rows.slice(0,5).map(r=>'<div class="csv-preview-row">'+keys.map(k=>`<span>${r[k]||""}</span>`).join("")+'</div>').join("")+`<small>${rows.length} dòng dữ liệu</small>`;btn.disabled=false;
  };
  btn.onclick=async()=>{if(!rows.length)return;btn.disabled=true;try{const r=type.value==="players"?await API.importPlayers(rows):await API.importTeams($("#csvDivision").value,rows);$("#genericDialog").close();await refresh();toast(`Đã import ${r.created} ${type.value==="players"?"VĐV":"đội"}.`)}catch(e){btn.disabled=false;toast("Import thất bại: "+e.message)}};
}
async function openPlayerModal(){
  const clubs=await API.clubs().catch(()=>[]);
  $("#genericTitle").textContent="Thêm VĐV";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Họ tên<input id="pName"></label>
    <label class="field">Biệt danh<input id="pNick"></label>
    <label class="field">Giới tính<select id="pGender"><option value="">Chưa chọn</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option></select></label>
    <label class="field">CLB<select id="pClub"><option value="">Tự do</option>${clubs.map(x=>`<option value="${x.id}">${x.name}</option>`).join("")}</select></label>
    <label class="field">Rating ban đầu<input id="pRating" type="number" min="0" step="0.001" value="3.000"></label>
    <label class="field">Điện thoại<input id="pPhone"></label>
    <div class="field full"><button type="button" class="btn primary" id="savePlayer">Thêm VĐV</button></div>
  </div>`;
  $("#genericDialog").showModal();
  $("#savePlayer").onclick=async()=>{try{await API.createPlayer({fullName:$("#pName").value,nickname:$("#pNick").value,gender:$("#pGender").value||null,clubId:$("#pClub").value||null,rating:Number($("#pRating").value)||3,phone:$("#pPhone").value});$("#genericDialog").close();await render();toast("Đã thêm VĐV.")}catch(e){toast("Không thể thêm VĐV: "+e.message)}};
}
function openClubModal(){
  $("#genericTitle").textContent="Thêm CLB";
  $("#genericBody").innerHTML=`<div class="form-grid"><label class="field full">Tên CLB<input id="clubName"></label><label class="field full">Khu vực / Thành phố<input id="clubCity"></label><div class="field full"><button type="button" class="btn primary" id="saveClub">Thêm CLB</button></div></div>`;
  $("#genericDialog").showModal();
  $("#saveClub").onclick=async()=>{try{await API.createClub({name:$("#clubName").value,city:$("#clubCity").value});$("#genericDialog").close();await render();toast("Đã thêm CLB.")}catch(e){toast("Không thể thêm CLB: "+e.message)}};
}
function openAvatarModal(playerId,name){
  $("#genericTitle").textContent="Cập nhật avatar";
  $("#genericBody").innerHTML=`<div class="form-grid"><div class="field full"><b>${name}</b><span>JPG, PNG hoặc WebP, tối đa 3MB.</span></div><label class="field full">Chọn ảnh<input id="avatarFile" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="field full"><button type="button" class="btn primary" id="saveAvatar">Tải avatar lên</button></div></div>`;
  $("#genericDialog").showModal();
  $("#saveAvatar").onclick=async()=>{const file=$("#avatarFile").files?.[0];if(!file)return toast("Chọn ảnh trước.");if(file.size>3*1024*1024)return toast("Ảnh tối đa 3MB.");try{await API.uploadPlayerAvatar(playerId,file);$("#genericDialog").close();await render();toast("Đã cập nhật avatar.")}catch(e){toast("Không thể tải avatar: "+e.message)}};
}
function openRatingModal(playerId,name,current){
  $("#genericTitle").textContent="Điều chỉnh rating";
  $("#genericBody").innerHTML=`<div class="form-grid"><div class="field full"><b>${name}</b><span>Rating hiện tại: ${Number(current).toFixed(3)}</span></div><label class="field">Điều chỉnh (+/-)<input id="ratingDelta" type="number" step="0.001" placeholder="VD: 0.015 hoặc -0.010"></label><label class="field full">Lý do<textarea id="ratingReason" rows="3" placeholder="Bắt buộc ghi lý do"></textarea></label><div class="field full"><button type="button" class="btn primary" id="saveRating">Lưu rating</button></div></div>`;
  $("#genericDialog").showModal();
  $("#saveRating").onclick=async()=>{try{await API.adjustRating(playerId,{delta:Number($("#ratingDelta").value),reason:$("#ratingReason").value});$("#genericDialog").close();await render();toast("Đã cập nhật rating và audit.")}catch(e){toast("Không thể cập nhật: "+e.message)}};
}
function openAutoSeedModal(){
  if(!state.divisions.length)return toast("Chưa có nội dung thi đấu.");
  $("#genericTitle").textContent="Chia bảng tự động";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Nội dung<select id="seedDivision">${state.divisions.filter(d=>d.active!==false).map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}</select></label>
    <label class="field full">Số bảng<input id="seedGroups" type="number" min="2" max="26" value="2"></label>
    <div class="field full"><p style="font-size:11px;color:#73847b;margin:0">Xếp theo rating trung bình của VĐV, phân phối kiểu snake và ưu tiên tránh cùng CLB chung bảng.</p></div>
    <div class="field full"><button type="button" class="btn primary" id="runAutoSeed">Chia bảng</button></div>
  </div>`;
  $("#genericDialog").showModal();
  $("#runAutoSeed").onclick=async()=>{try{
    const r=await API.autoSeedGroups($("#seedDivision").value,Number($("#seedGroups").value));
    $("#genericDialog").close();await refresh();toast(`Đã chia ${r.groupCount} bảng theo rating.`);
  }catch(e){const m={MORE_GROUPS_THAN_TEAMS:"Số bảng nhiều hơn số đội.",INVALID_GROUP_COUNT:"Số bảng không hợp lệ."}[e.message]||e.message;toast("Không thể chia bảng: "+m)}};
}
async function openTeamModal(){
  if(!state.divisions.length)return toast("Cần tạo giải/nội dung trước.");
  const roster=await API.players().catch(()=>[]);
  $("#genericTitle").textContent="Thêm cặp / đội";
  const options='<option value="">Chưa chọn</option>'+roster.filter(p=>p.active).map(p=>`<option value="${p.id}">${p.full_name} • ${Number(p.rating||0).toFixed(3)}</option>`).join("");
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Nội dung<select id="teamDivision">${state.divisions.filter(d=>d.active!==false).map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}</select></label>
    <label class="field">VĐV 1<select id="teamPlayer1">${options}</select></label>
    <label class="field">VĐV 2<select id="teamPlayer2">${options}</select></label>
    <label class="field full">Tên cặp / đội<input id="teamName" placeholder="Để trống sẽ lấy tên VĐV đã chọn"></label>
    <label class="field">CLB<input id="teamClub" placeholder="Có thể để trống"></label>
    <label class="field">Bảng<input id="teamGroup" value="A" maxlength="3"></label>
    <label class="field">Seed<input id="teamSeed" type="number" min="1"></label>
    <div class="field full"><button type="button" class="btn primary" id="saveTeam">Thêm đội</button></div>
  </div>`;
  $("#genericDialog").showModal();
  const syncName=()=>{
    if($("#teamName").value.trim())return;
    const ids=[$("#teamPlayer1").value,$("#teamPlayer2").value].filter(Boolean);
    const names=ids.map(id=>roster.find(p=>p.id===id)?.full_name).filter(Boolean);
    $("#teamName").value=names.join(" / ");
    const clubs=[...new Set(ids.map(id=>roster.find(p=>p.id===id)?.club_name).filter(x=>x&&x!=="Tự do"))];
    if(clubs.length===1)$("#teamClub").value=clubs[0];
  };
  $("#teamPlayer1").onchange=syncName;$("#teamPlayer2").onchange=syncName;
  $("#saveTeam").onclick=async()=>{
    const ids=[$("#teamPlayer1").value,$("#teamPlayer2").value].filter(Boolean);
    if(ids.length!==new Set(ids).size)return toast("Không thể chọn cùng một VĐV hai lần.");
    let name=$("#teamName").value.trim();if(!name){syncName();name=$("#teamName").value.trim()}
    if(!name)return toast("Nhập tên đội hoặc chọn VĐV.");
    try{
      const t=await API.createTeam($("#teamDivision").value,{name,club:$("#teamClub").value,group:$("#teamGroup").value||"A",seed:Number($("#teamSeed").value)||null});
      for(const id of ids)await API.addTeamPlayer(t.id,id);
      $("#genericDialog").close();await refresh();toast("Đã thêm đội và liên kết hồ sơ VĐV.");
    }catch(e){toast("Không thể thêm đội: "+e.message)}
  };
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
$("#logoutBtn").onclick=async()=>{await API.logout().catch(()=>{});location.href=location.pathname.includes("/preview/")?"index.html":"/login"};

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