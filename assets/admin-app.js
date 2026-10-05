const API=window.PickleAPI;
const $=s=>document.querySelector(s);
const NAV=[
  ["dashboard","dashboard","Tổng quan"],
  ["tournaments","trophy","Giải đấu"],
  ["registrations","checkin","Đăng ký & Check-in"],
  ["players","users","VĐV / Rating"],
  ["clubs","club","CLB"],
  ["club_events","calendar","Lịch hoạt động CLB"],
  ["club_attendance","checkin","Điểm danh CLB"],
  ["treasury","payment","Thu chi CLB"],
  ["matches","calendar","Lịch & trận đấu"],
  ["scores","score","Nhập điểm"],
  ["standings","standings","Bảng xếp hạng"],
  ["bracket","bracket","Bracket"],
  ["courts","court","Sân thi đấu"],
  ["bookings","booking","Booking sân"],
  ["referees","whistle","Trọng tài"],
  ["accounts","users","Tài khoản & phân quyền"],
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

const roleLabel=r=>({super_admin:"Super Admin",organizer:"Chủ giải",referee:"Trọng tài",club_manager:"Quản lý CLB",finance:"Thu ngân",player:"VĐV"}[r]||r);
const teamName=id=>state.teams.find(t=>t.id===id)?.name||(id==="TBD"||!id?"Chưa xác định":id);
const escHtml=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
const fmtRating=v=>{const n=Number(v||0),r=Math.round(n*100)/100;return r%1===0?r.toFixed(1):r.toString()};
const statusBadge=s=>s==="live"?'<span class="badge live">ĐANG ĐẤU</span>':s==="done"?'<span class="badge done">KẾT THÚC</span>':s==="open"?'<span class="badge blue">ĐANG MỞ</span>':'<span class="badge wait">CHỜ</span>';
const courtStateMeta=s=>({scheduled:["Chờ","scheduled"],called:["Đang gọi VĐV","called"],on_deck:["On deck","on_deck"],warming_up:["Khởi động","warming_up"],live:["Đang đấu","live"],done:["Hoàn tất","done"]}[s]||["Chờ","scheduled"]);
const nextCourtState=s=>({scheduled:["called","📣 Gọi VĐV"],called:["on_deck","⏭ On deck"],on_deck:["warming_up","🔥 Khởi động"]}[s]||null);
const resultText=m=>!m.sets?.length?"—":m.sets.map(x=>x.join("-")).join(" / ");
const toast=msg=>{const el=document.createElement("div");el.className="toast";el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2400)};
const canManage=()=>["super_admin","organizer"].includes(user?.role);
const canOperateMatch=()=>canManage()||user?.role==="referee";
const canRoster=()=>["super_admin","organizer","referee","club_manager"].includes(user?.role);
const canCreatePlayer=()=>["super_admin","organizer","club_manager"].includes(user?.role);
const canFinance=()=>["super_admin","organizer","finance"].includes(user?.role);
const canReferees=()=>["super_admin","organizer"].includes(user?.role);
const canAccounts=()=>["super_admin","organizer"].includes(user?.role)&&!location.pathname.includes("/preview/");
const visibleNav=()=>{
  if(user?.role==="super_admin")return NAV.filter(n=>n[0]!=="accounts"||canAccounts());
  if(user?.role==="organizer")return NAV.filter(n=>["dashboard","tournaments","registrations","players","matches","scores","standings","bracket","courts","referees","accounts","payments"].includes(n[0]));
  if(user?.role==="referee")return NAV.filter(n=>["dashboard","players","matches","scores","standings","bracket","courts"].includes(n[0]));
  if(user?.role==="club_manager")return NAV.filter(n=>["dashboard","club_events","players","clubs","club_attendance","treasury"].includes(n[0]));
  if(user?.role==="finance")return NAV.filter(n=>["dashboard","treasury","payments","reports"].includes(n[0]));
  return NAV.filter(n=>n[0]==="dashboard");
};
async function switchAdminPage(id){
  const nav=visibleNav();if(!nav.some(n=>n[0]===id))return;
  const oldIndex=nav.findIndex(n=>n[0]===page),newIndex=nav.findIndex(n=>n[0]===id);
  const update=async()=>{
    page=id;$("#sidebar").classList.remove("open");await render();
    if(matchMedia("(max-width:760px)").matches)scrollTo({top:0,behavior:"instant"});
  };
  const direction=newIndex>=oldIndex?"forward":"back";
  document.documentElement.dataset.navDirection=direction;
  if(document.startViewTransition){
    const vt=document.startViewTransition(update);vt.finished.finally(()=>delete document.documentElement.dataset.navDirection);
  }else{
    await update();setTimeout(()=>delete document.documentElement.dataset.navDirection,320);
  }
}

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
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>switchAdminPage(b.dataset.page));
}
function setHeader(title,sub){$("#pageTitle").textContent=title;$("#pageSub").textContent=sub}
function matchCard(m){
  const scoreBtn=m.status!=="cancelled"&&m.a!=="TBD"&&m.b!=="TBD"?`<button class="mini" data-score-match="${m.id}">${m.status==="done"?"Xem điểm / Undo":"Nhập điểm"}</button>`:"";
  const queueState=m.status==="live"?"live":m.status==="done"?"done":(m.courtState||"scheduled"),meta=courtStateMeta(queueState),next=nextCourtState(queueState);
  const queueActions=canOperateMatch()&&m.status==="wait"&&next?`<button class="mini" data-court-state-value="${next[0]}" data-court-state-match="${m.id}">${next[1]}</button>`:"";
  const resetQueue=canManage()&&m.status==="wait"&&queueState!=="scheduled"?`<button class="mini" data-court-state-value="scheduled" data-court-state-match="${m.id}">↶ Chờ</button>`:"";
  return `<div class="match-card" data-match-card="${m.id}" data-match-court="${m.courtId||""}" data-match-status="${m.status}">
    <div class="match-top"><span>${m.time} • Sân ${m.court} • ${m.stage}</span><div class="actions">${statusBadge(m.status)}<span class="court-state-chip ${meta[1]}">${meta[0]}</span></div></div>
    <div class="versus">
      <div class="team"><strong>${teamName(m.a)}</strong><small>${state.teams.find(t=>t.id===m.a)?.club||""}</small></div>
      <div class="vs">${m.status==="done"?`<span class="score-final">${resultText(m)}</span>`:"VS"}</div>
      <div class="team"><strong>${teamName(m.b)}</strong><small>${state.teams.find(t=>t.id===m.b)?.club||""}</small></div>
    </div>
    <div class="actions" style="margin-top:12px">${queueActions}${resetQueue}${scoreBtn}<button class="mini" data-match-detail="${m.id}">Chi tiết</button></div>
  </div>`;
}
async function dashboard(){
  const live=state.matches.filter(m=>m.status==="live").length,done=state.matches.filter(m=>m.status==="done").length;
  const clubRole=["super_admin","finance","club_manager"].includes(user?.role);
  const [report,events]=clubRole?await Promise.all([API.reportOverview().catch(()=>({})),API.clubEvents().catch(()=>[])]):[{},[]];
  const nextMatch=state.matches.find(m=>m.status!=="done"),nextEvent=events.find(e=>e.status!=="cancelled"&&new Date(e.start_at)>=new Date());
  setHeader("Trang chủ","Lịch, thành viên, điểm danh, thu chi và thi đấu trong một màn hình");
  const allowed=new Set(visibleNav().map(n=>n[0]));
  const quick=[
    ["club_events","calendar","Lịch hoạt động","Social, tập luyện, giao hữu"],
    ["players","users","Thành viên","Hồ sơ VĐV trong CLB"],
    ["club_attendance","checkin","Điểm danh","Có mặt theo từng buổi"],
    ["treasury","payment","Thu chi","Quỹ và lịch sử giao dịch"],
    ["matches","calendar","Lịch trận","Điều phối giải đấu"],
    ["scores","score","Nhập điểm","Courtside scoring"],
    ["payments","payment","Phí giải","Đối soát đăng ký"]
  ].filter(x=>allowed.has(x[0])).slice(0,4);
  const metricHtml=user?.role==="referee"?`
    <article><span class="metric-icon score">${iconSvg("score")}</span><div><small>TRẬN ĐƯỢC GÁN</small><strong>${state.matches.length}</strong><p>Trong phạm vi tài khoản</p></div></article>
    <article><span class="metric-icon score">${iconSvg("score")}</span><div><small>ĐANG LIVE</small><strong>${live}</strong><p>Cần theo dõi</p></div></article>
    <article><span class="metric-icon standings">${iconSvg("standings")}</span><div><small>HOÀN TẤT</small><strong>${done}</strong><p>Đã chốt kết quả</p></div></article>
    <article><span class="metric-icon court">${iconSvg("court")}</span><div><small>SÂN LIÊN QUAN</small><strong>${state.courts.length}</strong><p>Theo phân công</p></div></article>`:`
    <article><span class="metric-icon users">${iconSvg("users")}</span><div><small>THÀNH VIÊN</small><strong>${Number(report.members??report.players??0)}</strong><p>Hồ sơ hoạt động</p></div></article>
    <article><span class="metric-icon checkin">${iconSvg("checkin")}</span><div><small>ĐIỂM DANH HÔM NAY</small><strong>${Number(report.attendanceToday||0)}</strong><p>Lượt có mặt</p></div></article>
    <article><span class="metric-icon payment">${iconSvg("payment")}</span><div><small>SỐ DƯ QUỸ</small><strong>${Number(report.clubBalance||0).toLocaleString("vi-VN")}<em> đ</em></strong><p>Thu trừ chi</p></div></article>
    <article><span class="metric-icon calendar">${iconSvg("calendar")}</span><div><small>HOẠT ĐỘNG SẮP TỚI</small><strong>${Number(report.upcomingActivities||0)}</strong><p>Lịch CLB</p></div></article>`;
  const scheduleHtml=clubRole?events.filter(e=>e.status!=="cancelled").slice(0,5).map(e=>`<button class="club-event-home-row" data-home-event="${e.id}"><span class="club-event-date"><b>${new Date(e.start_at).toLocaleDateString("vi-VN",{day:"2-digit"})}</b><small>${new Date(e.start_at).toLocaleDateString("vi-VN",{month:"2-digit"})}</small></span><span><strong>${e.title}</strong><small>${new Date(e.start_at).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})} • ${e.venue||e.club_name||"CLB"}</small></span><em>${Number(e.participants||0)} người</em></button>`).join(""):state.matches.filter(m=>m.status!=="done").slice(0,5).map(matchCard).join("");
  return `<section class="club-home-hero">
    <div><span class="admin-app-overline">PICKLEUP.VN • CLUB OPERATIONS</span><h2>${user?.name||"Quản trị viên"}</h2><p>${nextEvent?`${nextEvent.title} • ${new Date(nextEvent.start_at).toLocaleString("vi-VN",{dateStyle:"short",timeStyle:"short"})}`:nextMatch?`${nextMatch.stage} • ${nextMatch.time} • Sân ${nextMatch.court}`:"Hệ thống sẵn sàng vận hành"}</p></div>
    <div class="club-home-live"><i></i><strong>${live}</strong><span>LIVE</span></div>
  </section>
  <div class="club-home-actions">${quick.map(([id,ico,label,sub])=>`<button data-goto="${id}"><span>${iconSvg(ico)}</span><b>${label}</b><small>${sub}</small></button>`).join("")||'<div class="empty">Không có thao tác nhanh cho vai trò này.</div>'}</div>
  <div class="club-home-metrics">${metricHtml}</div>
  <div class="grid-2 club-home-grid">
    <div class="panel app-section-card"><div class="panel-head"><div><h2>${clubRole?"Lịch CLB sắp tới":"Lịch thi đấu"}</h2><p>${clubRole?"Hoạt động của thành viên":"Trận đang diễn ra và chờ thi đấu"}</p></div>${allowed.has(clubRole?"club_events":"matches")?`<button class="mini" data-goto="${clubRole?"club_events":"matches"}">Xem tất cả</button>`:""}</div>${scheduleHtml||'<div class="empty">Chưa có lịch.</div>'}</div>
    <div class="panel app-section-card"><div class="panel-head"><div><h2>Hoạt động gần đây</h2><p>Nhật ký hệ thống</p></div></div><div class="activity-feed">${state.audit.slice(0,7).map(a=>`<div class="activity-item"><i></i><div><strong>${a.action}</strong><small>${a.time} • ${a.user}</small><p>${a.detail}</p></div></div>`).join("")||'<div class="empty">Không có log quản trị trong phạm vi tài khoản.</div>'}</div></div>
  </div>`;
}
function rankTournamentGroup(did,g){
  return state.teams.filter(t=>t.divisionId===did&&t.group===g&&t.status!=="withdrawn")
    .sort((a,b)=>Number(a.standingRank||999)-Number(b.standingRank||999)||(a.seed||999)-(b.seed||999));
}
function tournamentCard(t){
  const dids=state.divisions.filter(d=>d.tournamentId===t.id).map(d=>d.id);
  const teamCount=state.teams.filter(x=>dids.includes(x.divisionId)&&x.status!=="withdrawn").length;
  const courtCount=state.courts.filter(x=>x.tournamentId===t.id&&x.active!==false).length;
  return `<article class="tour-card" data-open-tournament="${t.id}" style="cursor:pointer"><div class="tour-cover"><strong>${t.format||"Tournament"}</strong>${statusBadge(t.status)}</div><div class="tour-body">
    <h3>${t.name}</h3><div class="tour-meta-grid"><span><small>Ngày</small><b>${t.date}</b></span><span><small>Địa điểm</small><b>${t.venue}</b></span><span><small>Đăng ký</small><b>${teamCount} cặp/đội</b></span><span><small>Sân</small><b>${courtCount||6} sân</b></span></div>
    <div class="actions tournament-quick-actions"><button type="button" class="mini" data-tournament-roster="${t.id}">👥 VĐV đăng ký</button><button type="button" class="mini" data-share-roster="${t.id}">🔗 Chia sẻ VĐV</button><button type="button" class="mini draw-mini" data-tournament-draw="${t.id}">🎡 Quay số</button><button type="button" class="mini" data-tournament-bracket="${t.id}">🧩 Sơ đồ</button><a class="mini" href="tournament.html?id=${encodeURIComponent(t.id)}#schedule" target="_blank" rel="noopener">🔴 Live</a></div>
  </div></article>`;
}
async function shareTournamentRoster(tournamentId){
  const t=state.tournaments.find(x=>x.id===tournamentId);if(!t)return;
  if(t.publicVisible===false)return toast("Giải đang để riêng tư. Bật công khai trước khi chia sẻ cho khách.");
  const url=new URL("/tournament.html",location.origin);
  url.searchParams.set("id",t.id);url.hash="participants";
  const data={title:"Danh sách VĐV • "+t.name,text:"Danh sách VĐV tham dự "+t.name,url:url.href};
  try{
    if(navigator.share){await navigator.share(data);return}
    await navigator.clipboard.writeText(url.href);toast("Đã sao chép link danh sách VĐV.");
  }catch(e){
    if(e?.name!=="AbortError"){
      try{await navigator.clipboard.writeText(url.href);toast("Đã sao chép link danh sách VĐV.")}catch{toast("Không thể chia sẻ link trên trình duyệt này.")}
    }
  }
}
function tournaments(){
  setHeader("Giải đấu","Chọn một giải để xem VĐV đăng ký, bốc thăm chia bảng và tạo nhánh tự động");
  return `<div class="panel-head"><div><h2>Danh sách giải</h2><p>${state.tournaments.length} giải • Nhấn vào giải để quản lý danh sách thi đấu</p></div>${canManage()?'<div class="actions"><button class="btn secondary" data-test-16>🧪 Test 16 cặp</button><button class="btn secondary" data-action="newDivision">Nội dung</button><button class="btn primary" data-action="newTournament">Tạo giải mới</button></div>':""}</div>
  <div class="page-grid">${state.tournaments.map(tournamentCard).join("")||'<div class="empty">Chưa có giải.</div>'}</div>`;
}
async function create16PairTestTournament(){
  const existing=state.tournaments.find(t=>String(t.name||"").startsWith("TEST 16 CẶP"));
  if(existing){await openTournamentDetail(existing.id);toast("Đã mở giải test 16 cặp hiện có.");return}
  if(!confirm("Tạo giải TEST 16 CẶP, quay 4 bảng × 4 cặp và sinh sơ đồ Tứ kết → Bán kết → Chung kết?"))return;
  const overlay=document.createElement("div");overlay.className="draw-wheel-overlay";
  overlay.innerHTML='<div class="draw-wheel-card"><div class="draw-wheel"><div class="draw-wheel-ring"></div><strong>16</strong></div><h3>Đang tạo 16 cặp VĐV...</h3><p>Tạo VĐV → quay 4 bảng → 24 trận vòng bảng → Top 8 → sơ đồ Chung kết.</p></div>';
  document.body.appendChild(overlay);
  try{
    const created=await API.createTournament({name:"TEST 16 CẶP – AUTO DRAW",venue:"Sân Demo Pickleup",eventType:"doubles"});
    const tid=created.tournament.id,did=created.division.id;
    await API.updateDivisionFull(did,{name:"Đôi 16 cặp",eventType:"doubles",format:"pool_to_knockout",bestOf:3,pointsToWin:11,winByTwo:true,advanceCount:2,active:true});
    for(let i=1;i<=6;i++)await API.createCourt(tid,{name:"Sân "+i});
    for(let i=1;i<=16;i++){
      const p1=await API.createPlayer({fullName:"VĐV "+String(i*2-1).padStart(2,"0"),rating:2+((i*7)%16)/10});
      const p2=await API.createPlayer({fullName:"VĐV "+String(i*2).padStart(2,"0"),rating:2+((i*11)%16)/10});
      const team=await API.createTeam(did,{name:"Cặp "+String(i).padStart(2,"0"),club:"Test Pickleup",group:"A",seed:i,playerIds:[p1.id,p2.id]});
      await API.createRegistration(did,{teamId:team.id,amount:0});
    }
    overlay.querySelector("h3").textContent="🎡 Đang quay số chia 4 bảng...";
    await API.autoSeedGroups(did,4);
    const rr=await API.generateRoundRobin(did);
    let snapshot=await API.adminState();
    const gm=snapshot.matches.filter(m=>m.divisionId===did&&!m.bracketSlot&&(m.stage||"").startsWith("Bảng "));
    for(let i=0;i<gm.length;i++){
      const a=11,b=5+(i%5);
      await API.quickScore(gm[i].id,{sets:[[a,b],[a,Math.min(9,b+1)]]});
    }
    const ko=await API.generateBracket(did);
    overlay.querySelector("h3").textContent="✅ Test 16 cặp hoàn tất";
    overlay.querySelector("p").textContent="4 bảng × 4 cặp • "+rr.created+" trận vòng bảng • "+ko.created+" trận knockout.";
    await new Promise(r=>setTimeout(r,900));
    overlay.remove();await refresh();await openTournamentDetail(tid);
    setTimeout(()=>document.querySelector(".tournament-bracket-preview")?.scrollIntoView({behavior:"smooth",block:"center"}),120);
    toast("Đã tạo 16 cặp, chia 4 bảng và sinh sơ đồ đến Chung kết.");
  }catch(e){overlay.remove();toast("Test 16 cặp lỗi: "+e.message)}
}
async function openTournamentDetail(tournamentId){
  const t=state.tournaments.find(x=>x.id===tournamentId);if(!t)return;
  const divisions=state.divisions.filter(d=>d.tournamentId===tournamentId&&d.active!==false);
  const [registrations,refs]=await Promise.all([API.registrations().catch(()=>[]),API.referees().catch(()=>[])]);
  const allPlayers=state.players||[];
  const teamPlayers=state.teamPlayers||{};
  const statusLabel=s=>({approved:"Đã duyệt",pending:"Chờ duyệt",cancelled:"Đã hủy"}[s]||s||"Đã đăng ký");
  const divisionHtml=divisions.map(d=>{
    const allTeams=state.teams.filter(x=>x.divisionId===d.id&&x.status!=="withdrawn");
    const regForDivision=registrations.filter(r=>r.division_name===d.name&&r.tournament_name===t.name&&r.status!=="cancelled");
    const registeredNames=new Set(regForDivision.map(r=>r.team_name).filter(Boolean));
    const teams=registeredNames.size?allTeams.filter(x=>registeredNames.has(x.name)):allTeams;
    const groups=[...new Set(teams.map(x=>x.group).filter(Boolean))].sort();
    const divisionMatches=state.matches.filter(m=>m.divisionId===d.id);
    const groupMatches=divisionMatches.filter(m=>!m.bracketSlot&&(m.stage||"").startsWith("Bảng "));
    const knockoutMatches=divisionMatches.filter(m=>m.bracketSlot);
    const liveMatches=divisionMatches.filter(m=>m.status==="live");
    const bracketPreview=knockoutMatches.length
      ?(window.PickleBracket?.render(divisionMatches,teamName,{admin:true})||"")
      :(window.PickleBracket?.renderPlan(allTeams)||"");
    const completed=groupMatches.filter(m=>m.status==="done"||m.status==="completed").length;
    const top2=groups.flatMap(g=>rankTournamentGroup(d.id,g).slice(0,2).map((x,i)=>({team:x,group:g,rank:i+1})));
    const rosterRows=teams.map(team=>{
      const ps=(teamPlayers[team.id]||[]).map(pid=>allPlayers.find(p=>p.id===pid)).filter(Boolean);
      const rating=ps.length?(ps.reduce((a,p)=>a+Number(p.rating||0),0)/ps.length).toFixed(2):"—";
      const reg=regForDivision.find(r=>r.team_name===team.name);
      const playerList=ps.length?ps.map(p=>{
        const initials=(p.full_name||"VĐV").trim().split(/\s+/).slice(-2).map(x=>x[0]||"").join("").toUpperCase();
        const avatar=p.avatar_url
          ?`<img src="${escHtml(p.avatar_url)}" alt="${escHtml(p.full_name||"VĐV")}" loading="lazy" style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex:0 0 38px;border:2px solid #e5ece8;background:#eef3f0">`
          :`<span style="width:38px;height:38px;border-radius:50%;display:grid;place-items:center;flex:0 0 38px;background:#dfff69;color:#10281d;font-size:11px;font-weight:900;border:2px solid #cfe95f">${escHtml(initials)}</span>`;
        return `<span style="display:flex;align-items:center;gap:8px;min-width:0">${avatar}<span style="min-width:0"><strong style="display:block;font-size:12px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px">${escHtml(p.full_name)}</strong>${p.nickname?`<small style="display:block;color:#73847b">${escHtml(p.nickname)}</small>`:""}</span></span>`;
      }).join(""):'<small style="color:#73847b">Chưa gán VĐV</small>';
      return `<tr><td><b style="display:block;margin-bottom:8px">${escHtml(team.name)}</b><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${playerList}</div></td><td>${escHtml(team.club||"Tự do")}</td><td>${rating}</td><td>${team.group?'<span class="badge blue">Bảng '+escHtml(team.group)+'</span>':'<span class="badge wait">Chưa bốc thăm</span>'}</td><td>${statusLabel(reg?.status)}</td></tr>`;
    }).join("");
    const groupSummary=groups.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${groups.map(g=>{const r=rankTournamentGroup(d.id,g);return `<span class="badge blue">Bảng ${g}: ${r.length} đội</span>`}).join("")}</div>`:"";
    const topHtml=top2.length?`<div style="margin-top:14px;padding:12px;border-radius:14px;background:#f5f8f6"><b style="font-size:12px">Top 2 tạm thời / chính thức</b><div style="display:grid;gap:5px;margin-top:8px">${top2.map(q=>`<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px"><span>Bảng ${q.group} • ${q.rank===1?"Nhất":"Nhì"}</span><b>${escHtml(q.team.name)}</b></div>`).join("")}</div></div>`:"";
    return `<section class="panel" style="box-shadow:none;margin:0 0 16px;border:1px solid #e7ece9">
      <div class="panel-head"><div><h2>${escHtml(d.name)}</h2><p>${[...new Set(teams.flatMap(team=>teamPlayers[team.id]||[]))].length} VĐV • ${teams.length} cặp/đội • ${groupMatches.length?completed+"/"+groupMatches.length+" trận vòng bảng đã xong":"Chưa tạo lịch vòng bảng"}</p></div>
      ${canManage()?`<div class="actions"><button class="btn primary" data-add-participants="${d.id}">＋ Thêm VĐV tham gia</button><button class="btn secondary" data-auto-draw="${d.id}" data-team-count="${teams.length}">🎡 Bốc thăm + xếp sân AUTO</button><button class="btn secondary" data-auto-courts="${d.id}">🏟 Xếp lại sân</button><button class="btn secondary" data-top2-bracket="${d.id}">🏆 Tạo nhánh Top 2</button></div>`:""}</div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Cặp / VĐV</th><th>CLB</th><th>Rating TB</th><th>Bảng</th><th>Đăng ký</th></tr></thead><tbody>${rosterRows||'<tr><td colspan="5">Chưa có VĐV/cặp đăng ký nội dung này.</td></tr>'}</tbody></table></div>
      ${groupSummary}${topHtml}
      <div class="tournament-ops-grid">
        <div class="tournament-ops-card"><b>🔴 Live trận đấu</b><small>${liveMatches.length} trận đang live • ${divisionMatches.length} trận tổng</small><div class="tournament-live-mini">${divisionMatches.slice(0,6).map(m=>`<div class="tournament-live-row"><button type="button" class="mini" data-center-score="${m.id}">${m.status==="live"?"🔴 ":""}${escHtml(m.stage)} • ${escHtml(teamName(m.a))} vs ${escHtml(teamName(m.b))}${m.refereeId?" • TT: "+escHtml(refs.find(r=>r.id===m.refereeId)?.display_name||"Đã gán"):""}</button><button type="button" class="mini" data-center-assign="${m.id}">👨‍⚖️ Phân công</button></div>`).join("")||'<span class="muted">Chưa có trận.</span>'}</div></div>
        <div class="tournament-ops-card"><b>🧩 Sơ đồ thi đấu</b><small>${knockoutMatches.length?"Đã tạo nhánh từ vòng loại đến chung kết":"Sau khi vòng bảng xong, bấm Tạo nhánh Top 2 để sinh toàn bộ bracket."}</small>${bracketPreview?`<div class="tournament-bracket-preview">${bracketPreview}</div>`:""}</div>
      </div>
    </section>`;
  }).join("");
  $("#genericTitle").textContent=t.name+" • Trung tâm điều hành";
  $("#genericBody").innerHTML=`<div style="display:grid;gap:12px">
    <div class="tournament-control-hero"><div><b>${escHtml(t.name)}</b><div>${escHtml(t.date||"")} • ${escHtml(t.venue||"")}</div></div><div class="tournament-control-actions"><button type="button" class="btn secondary" data-center-roster>👥 VĐV đăng ký</button><button type="button" class="btn secondary" data-center-share-roster="${t.id}">🔗 Chia sẻ danh sách</button><button type="button" class="btn secondary" data-center-draw>🎡 Quay số chia bảng</button><button type="button" class="btn secondary" data-center-bracket>🧩 Sơ đồ thi đấu</button><button type="button" class="btn secondary" data-center-live>🔴 Live / Nhập điểm</button><button type="button" class="btn secondary" data-center-courts="${t.id}">🏟 ${state.courts.filter(x=>x.tournamentId===t.id&&x.active!==false).length||6} sân</button>${canReferees()?'<button type="button" class="btn primary" data-center-referees>👨‍⚖️ Tài khoản trọng tài</button>':""}</div><small>Quy trình: duyệt VĐV → quay số chia bảng → vòng bảng → Top 2 → bracket → chung kết. Trọng tài chỉ nhập điểm các trận được phân công.</small></div>
    ${divisionHtml||'<div class="empty">Giải chưa có nội dung thi đấu.</div>'}
  </div>`;
  $("#genericDialog").showModal();

  const runDraw=async btn=>{
    const did=btn.dataset.autoDraw,n=Number(btn.dataset.teamCount||0);
    if(n<4)return toast("Cần ít nhất 4 cặp/đội để bốc thăm vòng bảng.");
    const groupCount=Math.max(1,Math.floor(n/4));
    const oldGroupMatches=state.matches.filter(m=>m.divisionId===did&&!m.bracketSlot&&(m.stage||"").startsWith("Bảng "));
    if(oldGroupMatches.some(m=>m.status==="live"||m.status==="done"||m.status==="completed"||(m.sets||[]).length))return toast("Vòng bảng đã bắt đầu nên không thể quay lại.");
    if(!confirm(`Quay số ${n} cặp/đội → chia ${groupCount} bảng → tự xếp toàn bộ trận lên các sân đang hoạt động?`))return;
    const names=state.teams.filter(x=>x.divisionId===did&&x.status!=="withdrawn").map(x=>x.name);
    const overlay=document.createElement("div");overlay.className="draw-wheel-overlay";
    overlay.innerHTML=`<div class="draw-wheel-card"><div class="draw-wheel"><div class="draw-wheel-ring">${names.slice(0,12).map((name,i)=>`<span style="--i:${i};--n:${Math.max(1,Math.min(12,names.length))}">${escHtml(name)}</span>`).join("")}</div><strong>🎡</strong></div><h3>Đang quay số chia bảng...</h3><p>Hệ thống đang xáo trộn và cân bằng các đội.</p></div>`;
    document.body.appendChild(overlay);
    try{
      for(const m of oldGroupMatches)await API.deleteMatch(m.id);
      await new Promise(r=>setTimeout(r,1800));
      await API.autoSeedGroups(did,groupCount);
      const rr=await API.generateRoundRobin(did);
      overlay.querySelector("h3").textContent="✅ Đã bốc thăm & xếp sân";
      overlay.querySelector("p").textContent=`${groupCount} bảng • ${rr.created} trận • ${rr.courts||state.courts.filter(x=>x.active!==false).length} sân`;
      await new Promise(r=>setTimeout(r,700));
      overlay.remove();await refresh();$("#genericDialog").close();await openTournamentDetail(tournamentId);
      toast(`Đã bốc thăm ${groupCount} bảng, tạo ${rr.created} trận và tự xếp ${rr.courts||""} sân.`);
    }catch(e){overlay.remove();toast("Không thể quay số: "+e.message)}
  };
  document.querySelectorAll("[data-add-participants]").forEach(btn=>btn.onclick=()=>{const did=btn.dataset.addParticipants;$("#genericDialog").close();openTeamModal(did,true)});
  document.querySelectorAll("[data-auto-draw]").forEach(btn=>btn.onclick=()=>runDraw(btn));
  document.querySelectorAll("[data-auto-courts]").forEach(btn=>btn.onclick=async()=>{
    try{
      const r=await API.autoScheduleCourts(btn.dataset.autoCourts);
      await refresh();$("#genericDialog").close();await openTournamentDetail(tournamentId);
      toast(`Đã xếp lại ${r.updated||0} trận trên ${r.courts||0} sân, tránh trùng đội cùng giờ.`);
    }catch(e){toast(e.message==="NO_UNSTARTED_MATCHES"?"Không còn trận vòng bảng chưa bắt đầu để xếp lại.":"Không thể xếp sân: "+e.message)}
  });
  document.querySelector("[data-center-draw]")?.addEventListener("click",()=>document.querySelector("[data-auto-draw]")?.click());
  document.querySelector("[data-center-roster]")?.addEventListener("click",()=>document.querySelector("[data-auto-draw]")?.closest("section")?.scrollIntoView({behavior:"smooth",block:"start"}));
  document.querySelector("[data-center-share-roster]")?.addEventListener("click",e=>shareTournamentRoster(e.currentTarget.dataset.centerShareRoster));
  document.querySelector("[data-center-bracket]")?.addEventListener("click",()=>{$("#genericDialog").close();switchAdminPage("bracket")});
  document.querySelector("[data-center-live]")?.addEventListener("click",()=>{$("#genericDialog").close();switchAdminPage("scores")});
  document.querySelector("[data-center-courts]")?.addEventListener("click",e=>openCourtCountModal(e.currentTarget.dataset.centerCourts));
  document.querySelector("[data-center-referees]")?.addEventListener("click",()=>{$("#genericDialog").close();switchAdminPage("referees")});
  document.querySelectorAll("[data-center-score]").forEach(b=>b.onclick=()=>openScore(b.dataset.centerScore));
  document.querySelectorAll("[data-center-assign]").forEach(b=>b.onclick=()=>openMatchDetail(b.dataset.centerAssign));
  document.querySelectorAll("[data-top2-bracket]").forEach(btn=>btn.onclick=async()=>{
    if(!confirm("Tạo nhánh đấu tự động từ Nhất/Nhì mỗi bảng?"))return;
    try{
      const r=await API.generateBracket(btn.dataset.top2Bracket);
      await refresh();
      await openTournamentDetail(tournamentId);
      toast(`Đã tạo nhánh loại trực tiếp ${r.created||0} trận từ Top 2 mỗi bảng.`);
    }catch(e){
      const m={GROUP_STAGE_NOT_COMPLETE:"Vòng bảng chưa thi đấu xong.",BRACKET_ALREADY_EXISTS:"Nhánh đấu đã được tạo.",BRACKET_ALREADY_STARTED:"Nhánh đã có trận bắt đầu/kết quả nên không thể bốc lại.",NOT_ENOUGH_QUALIFIERS:"Chưa đủ đội đi tiếp.",ROUND_ROBIN_HAS_NO_KNOCKOUT:"Nội dung này chỉ thi đấu vòng tròn."}[e.message]||e.message;
      toast("Không thể tạo nhánh: "+m)
    }
  });
}
async function players(){
  setHeader("Bảng VĐV / Rating hệ thống","Hồ sơ VĐV, CLB, rating và đội tham dự");
  const roster=canRoster()?await API.players().catch(()=>[]):[];
  return `<div class="panel" style="margin-bottom:16px">
    <div class="panel-head"><div><h2>Bảng VĐV / Rating hệ thống</h2><p>${roster.length} VĐV${user?.role==="referee"?" trong các trận được phân công":""}</p></div>${canRoster()?`<div class="actions">${canManage()?'<button class="btn secondary" data-action="importCsv">Import CSV</button><button class="btn secondary" data-action="newClub">Thêm CLB</button>':""}${canCreatePlayer()?'<button class="btn primary" data-action="newPlayer">Tạo hồ sơ VĐV</button>':""}</div>`:""}</div>
    <div class="table-wrap"><table class="table"><thead><tr><th>VĐV</th><th>CLB</th><th>Giới tính</th><th>Rating</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
      ${roster.map(p=>`<tr data-player-row="${p.id}"><td><div style="display:flex;align-items:center;gap:10px">${p.avatar_url?`<img src="${p.avatar_url}" alt="" style="width:42px;height:42px;border-radius:12px;object-fit:cover">`:`<span style="width:42px;height:42px;border-radius:12px;background:#eaf1ed;display:grid;place-items:center;font-weight:900">${(p.full_name||"P").split(/\\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase()}</span>`}<span><b>${p.full_name}</b>${p.nickname?`<small style="display:block;color:#73847b">${p.nickname}</small>`:""}</span></div></td><td>${p.club_name||"Tự do"}</td><td>${p.gender||"—"}</td><td><b>${fmtRating(p.rating)}</b></td><td>${p.active?'<span class="badge live">HOẠT ĐỘNG</span>':'<span class="badge done">KHÓA</span>'}</td><td><div class="actions">${canRoster()?`<button class="mini primary-mini" data-crud-edit-player="${p.id}">Sửa</button><a class="mini" href="player.html?id=${encodeURIComponent(p.id)}" target="_blank" style="text-decoration:none">Hồ sơ</a><button class="mini" data-avatar-player="${p.id}" data-avatar-name="${p.full_name}">Avatar</button>`:""}</div></td></tr>`).join("")}
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
  const arr=scoreOnly?state.matches.filter(m=>m.status!=="cancelled"):state.matches;
  return `<div class="filters"><select id="courtFilter"><option value="">Tất cả sân</option>${state.courts.map(c=>`<option value="${c.id}">${c.name}</option>`).join("")}</select>
    <select id="statusFilter"><option value="">Tất cả trạng thái</option><option value="live">Đang đấu</option><option value="wait">Chờ</option><option value="done">Kết thúc</option></select>${canManage()?'<button class="btn secondary" data-action="autoSchedule">🏟 Xếp sân tự động</button><button class="btn primary" data-action="newMatch">Tạo trận</button>':""}</div>
    <div class="grid-2"><div class="panel"><div class="panel-head"><div><h2>${scoreOnly?"Các trận cần nhập":"Lịch thi đấu"}</h2><p id="matchCount">${arr.length} trận</p></div></div>
      <div id="matchList">${arr.map(matchCard).join("")||'<div class="empty">Không có trận.</div>'}<div class="empty" id="matchFilterEmpty" hidden>Không có trận phù hợp bộ lọc.</div></div>
    </div>
    <div class="panel"><div class="panel-head"><div><h2>Tình trạng sân</h2><p>Live court monitor</p></div></div>
      ${state.courts.length?state.courts.map(c=>{const m=state.matches.find(x=>x.courtId===c.id&&x.status==="live");return `<div style="display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #edf1ef"><div><strong>${c.name}</strong><div style="font-size:12px;color:#73847b;margin-top:4px">${m?teamName(m.a)+" vs "+teamName(m.b):"Đang trống"}</div></div>${m?'<span class="badge live">LIVE</span>':'<span class="badge done">TRỐNG</span>'}</div>`}).join(""):'<div class="empty">Chưa khai báo sân.</div>'}
    </div></div>`;
}
function calcGroup(did,g){
  return rankTournamentGroup(did,g);
}
function standings(){
  setHeader("Bảng xếp hạng","Tự động tính sau mỗi trận: Trận thắng → Hiệu số set → Đối đầu → Hiệu số điểm");
  const divisions=state.divisions.filter(d=>state.teams.some(t=>t.divisionId===d.id&&t.group));
  return divisions.map(d=>{
    const groups=[...new Set(state.teams.filter(t=>t.divisionId===d.id).map(t=>t.group).filter(Boolean))].sort();
    const content=groups.map(g=>{
      const gm=state.matches.filter(m=>m.divisionId===d.id&&!m.bracketSlot&&(m.stage==="Bảng "+g||(m.stage||"").includes("Bảng "+g)));
      const done=gm.filter(m=>m.status==="done"||m.status==="completed").length;
      return `<div class="panel" style="margin-bottom:16px"><div class="panel-head"><div><h2>${escHtml(d.name)} • Bảng ${g}</h2><p>${done}/${gm.length} trận hoàn tất • Top 2 vào vòng loại trực tiếp</p></div><span class="badge blue">TOP 2 ĐI TIẾP</span></div>
        <div class="standing-table-wrap">
          <div class="standing-row head"><span>#</span><span>Đội / VĐV</span><span>Trận</span><span>Set</span><span>Điểm</span><span>+/-</span><span>Xếp hạng</span></div>
          ${calcGroup(d.id,g).map((t,i)=>{
            const rankTag=i===0?'<span class="rank-badge rank-1">🥇 Nhất bảng</span><small class="qualify-status">Vào vòng trong</small>':i===1?'<span class="rank-badge rank-2">🥈 Nhì bảng</span><small class="qualify-status">Vào vòng trong</small>':`<span class="rank-badge rank-other">Hạng ${i+1}</span>`;
            const qCls=i===0?'qualify-rank-1':i===1?'qualify-rank-2':'';
            const diff=(t.pf||0)-(t.pa||0);
            return `<div class="standing-row ${qCls}"><span class="rank">${i+1}</span><span><b>${escHtml(t.name)}</b><small style="display:block;color:#73847b">${escHtml(t.club||"Tự do")}</small></span><span>${t.w||0}-${t.l||0}</span><span>${t.sw||0}-${t.sl||0}</span><span>${t.pf||0}-${t.pa||0}</span><span><b>${diff>0?"+":""}${diff}</b></span><div>${rankTag}</div></div>`;
          }).join("")}
        </div>
      </div>`;
    }).join("");
    return content;
  }).join("")||'<div class="panel empty">Chưa có bảng đấu.</div>';
}
function bracketMatch(m){if(!m)return"";return `<div class="bracket-match"><div class="bracket-team ${m.winner===m.a?"win":""}"><span>${teamName(m.a)}</span><b>${m.sets?.filter(s=>s[0]>s[1]).length||""}</b></div><div class="bracket-team ${m.winner===m.b?"win":""}"><span>${teamName(m.b)}</span><b>${m.sets?.filter(s=>s[1]>s[0]).length||""}</b></div>${m.status!=="cancelled"&&m.a!=="TBD"&&m.b!=="TBD"?`<button class="mini" style="margin-top:7px" data-score-match="${m.id}">Nhập điểm</button>`:""}</div>`}
function bracket(){
  setHeader("Bracket","Single elimination, double elimination và tự routing nhánh");
  const html=window.PickleBracket?.render(state.matches,teamName,{admin:true})||'<div class="empty">Bracket renderer chưa tải.</div>';
  const champ=window.PickleBracket?.champion(state.matches,teamName)||"Chưa xác định";
  return `<div class="panel"><div class="panel-head"><div><h2>Bracket thi đấu</h2><p>Tự tạo từ BXH hoặc seed, hỗ trợ BYE và nhánh thua</p></div>${canManage()?'<button class="btn primary" data-action="autoBracket">Tạo / sinh bracket</button>':""}</div>${html}<div class="admin-champion"><span>CHAMPION</span><strong>${champ}</strong></div></div>`;
}
function courts(){
  setHeader("Sân thi đấu","Theo dõi và cấu hình sân theo giải");
  const activeCourts=state.courts.filter(c=>c.active!==false);
  const cards=activeCourts.map(c=>{const live=state.matches.find(m=>m.courtId===c.id&&m.status==="live"),next=state.matches.find(m=>m.courtId===c.id&&m.status==="wait");return `<div class="panel" data-court-card="${c.id}"><div class="panel-head"><h2>${c.name}</h2>${live?'<span class="badge live">LIVE</span>':'<span class="badge done">TRỐNG</span>'}</div><p style="font-size:13px"><b>Hiện tại:</b> ${live?teamName(live.a)+" vs "+teamName(live.b):"Không có trận"}</p><p style="font-size:12px;color:#73847b"><b>Tiếp theo:</b> ${next?next.time+" • "+teamName(next.a)+" vs "+teamName(next.b):"Chưa xếp"}</p></div>`});
  return `<div class="panel-head"><div><h2>Danh sách sân</h2><p>${activeCourts.length} sân hoạt động • mặc định 6 sân / giải</p></div>${canManage()?'<div class="actions"><button class="btn secondary" data-action="courtCount">Cấu hình số sân</button><button class="btn primary" data-action="newCourt">Thêm sân</button></div>':""}</div><div class="page-grid">${cards.join("")||'<div class="panel empty">Chưa khai báo sân.</div>'}</div>`;
}
async function refereesPage(){
  setHeader("Trọng tài","Tài khoản theo từng giải và quyền nhập điểm");
  if(!canReferees())return '<div class="panel empty">Bạn không có quyền quản lý tài khoản trọng tài.</div>';
  const refs=await API.referees().catch(()=>[]);
  return `<div class="panel"><div class="panel-head"><div><h2>Danh sách trọng tài</h2><p>${refs.length} tài khoản • chỉ hiện trọng tài thuộc giải bạn quản lý</p></div><button class="btn primary" data-action="newReferee">Tạo trọng tài</button></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Tên</th><th>Email</th><th>Giải được giao</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${refs.map(r=>`<tr><td><b>${escHtml(r.display_name)}</b></td><td>${escHtml(r.email)}</td><td>${escHtml(r.tournament_name||"Toàn hệ thống")}</td><td>${r.active?'<span class="badge live">HOẠT ĐỘNG</span>':'<span class="badge done">KHÓA</span>'}</td><td><button class="mini" data-edit-referee="${r.id}">Sửa / Reset</button></td></tr>`).join("")||'<tr><td colspan="5">Chưa có trọng tài.</td></tr>'}</tbody></table></div>
  </div>`;
}
async function accountsPage(){
  setHeader("Tài khoản & phân quyền",user?.role==="organizer"?"Quản lý trọng tài thuộc các giải của bạn":"Tạo tài khoản con và giới hạn quyền ở server");
  if(!canAccounts())return '<div class="panel empty">Bạn không có quyền quản lý tài khoản.</div>';
  const rows=await API.users().catch(()=>[]);
  const isOwner=user?.role==="super_admin";
  const primary=isOwner?rows.filter(x=>x.role==="super_admin"):rows.filter(x=>x.id===user?.id||x.id===user?.sub);
  const children=isOwner?rows.filter(x=>x.role!=="super_admin"):rows.filter(x=>x.role==="referee");
  return `<div class="panel" style="margin-bottom:12px"><div class="panel-head"><div><h2>${isOwner?"Tài khoản chủ hệ thống":"Tài khoản Chủ giải"}</h2><p>${isOwner?"Không thể bị tài khoản con chỉnh sửa":"Quyền quản lý được giới hạn theo giải"}</p></div></div>
    ${primary.map(r=>`<div class="account-row account-owner"><div><b>${escHtml(r.display_name)}</b><small>${escHtml(r.email)}</small></div><span class="badge live">${roleLabel(r.role).toUpperCase()}</span></div>`).join("")||'<div class="empty">Tài khoản hiện tại</div>'}
  </div>
  <div class="panel"><div class="panel-head"><div><h2>${isOwner?"Tài khoản con":"Tài khoản trọng tài"}</h2><p>${children.length} tài khoản • phân quyền tại server</p></div><button class="btn primary" data-action="newUser">${isOwner?"Tạo tài khoản con":"Tạo trọng tài"}</button></div>
    <div class="role-help"><span><b>Chủ giải</b>Chỉ vận hành các giải mình sở hữu/được gán và VĐV trong các giải đó.</span><span><b>Trọng tài</b>Chỉ thấy trận được phân công; được nhập điểm và cập nhật thông tin cơ bản VĐV của trận đó.</span><span><b>Khách xem</b>Không cần tài khoản; chỉ đọc danh sách VĐV, lịch, BXH và bracket từ link công khai.</span>${isOwner?'<span><b>Quản lý CLB / Thu ngân</b>Giới hạn theo CLB hoặc nghiệp vụ được giao.</span>':""}</div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Tên</th><th>Email</th><th>Vai trò</th><th>Phạm vi</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${children.map(r=>`<tr><td><b>${escHtml(r.display_name)}</b>${r.club_name?`<small style="display:block;color:#73847b">${escHtml(r.club_name)}</small>`:""}</td><td>${escHtml(r.email)}</td><td>${roleLabel(r.role)}</td><td>${escHtml(r.tournament_name||r.club_name||"Toàn hệ thống")}</td><td>${r.active?'<span class="badge live">HOẠT ĐỘNG</span>':'<span class="badge done">ĐÃ KHÓA</span>'}</td><td><button class="mini" data-edit-user="${r.id}">Sửa quyền</button></td></tr>`).join("")||'<tr><td colspan="6">Chưa có tài khoản con.</td></tr>'}
    </tbody></table></div>
  </div>`;
}
async function payments(){
  setHeader("Thanh toán","Đăng ký giải, phí tham dự và đối soát");
  if(!canFinance())return '<div class="panel empty">Bạn không có quyền quản lý thanh toán.</div>';
  const rows=await API.registrations().catch(()=>[]);
  return `<div class="panel">
    <div class="panel-head"><div><h2>Đăng ký & thanh toán</h2><p>${rows.length} hồ sơ</p></div>${canManage()?'<button class="btn primary" data-action="newRegistration">Tạo đăng ký</button>':""}</div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Giải</th><th>Nội dung</th><th>Đội</th><th>Số tiền</th><th>Đăng ký</th><th>Thanh toán</th><th>Thao tác</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${escHtml(r.tournament_name)}</td><td>${escHtml(r.division_name)}</td><td><b>${escHtml(r.team_name||"—")}</b></td><td>${r.amount?Number(r.amount).toLocaleString("vi-VN")+" đ":"—"}</td><td>${escHtml(r.status)}</td><td>${escHtml(r.payment_status)}</td><td><div class="actions">${r.receipt_url?`<button class="mini" data-view-receipt="${escHtml(r.receipt_url)}">Xem biên nhận</button>`:""}${!r.payment_id?`<button class="mini" data-add-payment="${r.id}">Ghi nhận CK</button>`:""}${r.payment_id&&r.payment_review_status==="pending"?`<button class="mini" data-review-payment="${r.payment_id}" data-status="approved">Duyệt</button><button class="mini" data-review-payment="${r.payment_id}" data-status="rejected">Từ chối</button>`:""}</div></td></tr>`).join("")}
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
      <label class="field">Cách tính điểm<select data-rule-scoring="${d.id}" ${canManage()?"":"disabled"}><option value="side_out" ${d.scoringMode!=="rally"?"selected":""}>Side-out</option><option value="rally" ${d.scoringMode==="rally"?"selected":""}>Rally scoring</option></select></label>
      <label class="field">Nghỉ tối thiểu (phút)<input data-rule-rest="${d.id}" type="number" min="0" max="120" value="${d.minimumRestMinutes??15}" ${canManage()?"":"disabled"}></label>
      <label class="field">Thời lượng/trận (phút)<input data-rule-slot="${d.id}" type="number" min="5" max="180" value="${d.matchSlotMinutes??20}" ${canManage()?"":"disabled"}></label>
      <label class="field" style="align-content:end"><span><input data-rule-win2="${d.id}" type="checkbox" ${d.winByTwo?"checked":""} ${canManage()?"":"disabled"}> Thắng cách 2</span></label>
      ${canManage()?`<div class="field full"><button class="btn primary" data-save-rules="${d.id}">Lưu cấu hình</button></div>`:""}
    </div></div>`).join("")}</div>`;
}
async function render(){
  renderNav();
  const ctx={API,state,user,setHeader,toast,refresh,canManage,canRoster,canFinance};
  const map={
    dashboard,tournaments,
    registrations:()=>window.AdminModules.registrations(ctx),
    players,
    clubs:()=>window.AdminModules.clubs(ctx),
    matches:()=>matchesPage(false),scores:()=>matchesPage(true),standings,bracket,courts,
    club_events:()=>window.AdminModules.clubEvents(ctx),
    club_attendance:()=>window.AdminModules.clubAttendance(ctx),
    treasury:()=>window.AdminModules.treasury(ctx),
    bookings:()=>window.AdminModules.bookings(ctx),
    referees:refereesPage,accounts:accountsPage,payments,
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
function applyMatchFilters(){
  const court=$("#courtFilter")?.value||"",status=$("#statusFilter")?.value||"";
  const cards=[...document.querySelectorAll("[data-match-card]")];
  let visible=0;
  cards.forEach(card=>{
    const show=(!court||card.dataset.matchCourt===court)&&(!status||card.dataset.matchStatus===status);
    card.hidden=!show;
    if(show)visible++;
  });
  const count=$("#matchCount");if(count)count.textContent=`${visible} trận`;
  const empty=$("#matchFilterEmpty");if(empty)empty.hidden=visible!==0||cards.length===0;
}
function bindDynamic(){
  document.querySelector("[data-test-16]")?.addEventListener("click",create16PairTestTournament);
  document.querySelectorAll("[data-open-tournament]").forEach(card=>card.onclick=e=>{if(e.target.closest("button,a,select,input"))return;openTournamentDetail(card.dataset.openTournament)});
  document.querySelectorAll("[data-tournament-roster]").forEach(b=>b.onclick=e=>{e.stopPropagation();openTournamentDetail(b.dataset.tournamentRoster)});
  document.querySelectorAll("[data-share-roster]").forEach(b=>b.onclick=e=>{e.stopPropagation();shareTournamentRoster(b.dataset.shareRoster)});
  document.querySelectorAll("[data-tournament-draw]").forEach(b=>b.onclick=async e=>{e.stopPropagation();await openTournamentDetail(b.dataset.tournamentDraw);setTimeout(()=>document.querySelector("[data-auto-draw]")?.click(),30)});
  document.querySelectorAll("[data-tournament-bracket]").forEach(b=>b.onclick=async e=>{e.stopPropagation();await openTournamentDetail(b.dataset.tournamentBracket);setTimeout(()=>document.querySelector(".tournament-bracket-preview")?.scrollIntoView({behavior:"smooth",block:"center"}),60)});
  document.querySelectorAll("[data-goto]").forEach(b=>b.onclick=e=>{e.stopPropagation();switchAdminPage(b.dataset.goto)});
  document.querySelectorAll("[data-home-event]").forEach(b=>b.onclick=()=>{sessionStorage.setItem("pickle-club-event",b.dataset.homeEvent);switchAdminPage("club_attendance")});
  document.querySelectorAll("[data-score-match]").forEach(b=>b.onclick=()=>openScore(b.dataset.scoreMatch));
  document.querySelectorAll("[data-court-state-value]").forEach(b=>b.onclick=()=>updateCourtState(b.dataset.courtStateMatch,b.dataset.courtStateValue));
  document.querySelectorAll('[data-action="newTournament"]').forEach(b=>b.onclick=openTournamentModal);
  document.querySelectorAll('[data-action="newDivision"]').forEach(b=>b.onclick=openDivisionModal);
  document.querySelectorAll('[data-action="newCourt"]').forEach(b=>b.onclick=openCourtModal);
  document.querySelectorAll('[data-action="courtCount"]').forEach(b=>b.onclick=()=>openCourtCountModal());
  document.querySelectorAll('[data-action="newTeam"]').forEach(b=>b.onclick=openTeamModal);
  document.querySelectorAll('[data-action="autoSeed"]').forEach(b=>b.onclick=openAutoSeedModal);
  document.querySelectorAll('[data-action="newPlayer"]').forEach(b=>b.onclick=openPlayerModal);
  document.querySelectorAll('[data-action="importCsv"]').forEach(b=>b.onclick=openCsvImportModal);
  document.querySelectorAll('[data-action="newClub"]').forEach(b=>b.onclick=openClubModal);
  document.querySelectorAll("[data-rating-player]").forEach(b=>b.onclick=()=>openRatingModal(b.dataset.ratingPlayer,b.dataset.ratingName,b.dataset.ratingCurrent));
  document.querySelectorAll("[data-avatar-player]").forEach(b=>b.onclick=()=>openAvatarModal(b.dataset.avatarPlayer,b.dataset.avatarName));
  document.querySelectorAll('[data-action="newReferee"]').forEach(b=>b.onclick=openRefereeModal);
  document.querySelectorAll("[data-edit-referee]").forEach(b=>b.onclick=()=>openEditRefereeModal(b.dataset.editReferee));
  document.querySelectorAll('[data-action="newUser"]').forEach(b=>b.onclick=openUserModal);
  document.querySelectorAll("[data-edit-user]").forEach(b=>b.onclick=()=>openEditUserModal(b.dataset.editUser));
  document.querySelectorAll('[data-action="newRegistration"]').forEach(b=>b.onclick=openRegistrationModal);
  document.querySelectorAll('[data-action="newMatch"]').forEach(b=>b.onclick=openMatchModal);
  document.querySelectorAll('[data-action="changePassword"]').forEach(b=>b.onclick=openPasswordModal);
  document.querySelectorAll('[data-action="autoSchedule"]').forEach(b=>b.onclick=openAutoScheduleModal);
  document.querySelectorAll('[data-action="autoBracket"]').forEach(b=>b.onclick=openAutoBracketModal);
  document.querySelectorAll("[data-match-detail]").forEach(b=>b.onclick=()=>openMatchDetail(b.dataset.matchDetail));
  document.querySelectorAll("[data-add-payment]").forEach(b=>b.onclick=()=>openPaymentModal(b.dataset.addPayment));
  document.querySelectorAll("[data-view-receipt]").forEach(b=>b.onclick=()=>openReceiptModal(b.dataset.viewReceipt));
  document.querySelectorAll("[data-review-payment]").forEach(b=>b.onclick=async()=>{try{await API.reviewPayment(b.dataset.reviewPayment,b.dataset.status);await render();toast("Đã cập nhật thanh toán.")}catch(e){toast("Không thể xử lý: "+e.message)}});
  document.querySelectorAll("[data-save-rules]").forEach(b=>b.onclick=()=>saveRules(b.dataset.saveRules));
  ["#courtFilter","#statusFilter"].forEach(s=>{const el=$(s);if(el)el.onchange=applyMatchFilters});
  applyMatchFilters();
}
async function openReceiptModal(value){
  try{
    const base=new URL(API.apiBase?.()||location.origin),url=new URL(value,base);
    if(url.origin!==base.origin){
      if(url.protocol!=="https:")return toast("Link biên nhận không hợp lệ.");
      window.open(url.href,"_blank","noopener,noreferrer");return;
    }
    const blobUrl=await API.receiptPreview(url.href);
    $("#genericTitle").textContent="Biên nhận thanh toán";
    $("#genericBody").innerHTML=`<iframe title="Biên nhận thanh toán" src="${blobUrl}" style="width:100%;height:60vh;border:0"></iframe>`;
    const dialog=$("#genericDialog");dialog.addEventListener("close",()=>URL.revokeObjectURL(blobUrl),{once:true});dialog.showModal();
  }catch(e){toast(e.status===403?"Bạn không có quyền xem biên nhận này.":e.status===401?"Phiên đăng nhập đã hết hạn.":"Không thể mở biên nhận.")}
}
function divisionForMatch(m){return state.divisions.find(d=>d.id===m.divisionId)}
async function updateCourtState(id,courtState){
  const m=state.matches.find(x=>x.id===id);if(!m)return;
  try{await API.setCourtState(id,{courtState,expectedVersion:m.version});await refresh();toast("Đã cập nhật điều phối sân.")}
  catch(e){if(e.message==="VERSION_CONFLICT")await refresh();toast(scoreError(e))}
}
function openScore(id){
  activeMatch=state.matches.find(m=>m.id===id);if(!activeMatch)return;
  if(activeMatch.a==="TBD"||activeMatch.b==="TBD"){toast("Chưa xác định đủ hai đội.");return}
  const d=divisionForMatch(activeMatch);
  const isMlp=d?.eventType==="team";
  const isDoubles=d?.eventType==="doubles"||d?.eventType==="mixed_doubles";
  $("#scoreMeta").textContent=`${activeMatch.stage} • Sân ${activeMatch.court} • ${activeMatch.time}`;
  $("#scoreTitle").textContent=isMlp?"Nhập điểm: MLP Đồng đội":isDoubles?"Nhập điểm: Đôi":"Nhập điểm trận";
  $("#teamAName").textContent=teamName(activeMatch.a);$("#teamBName").textContent=teamName(activeMatch.b);
  $("#targetScore").value=String(d?.pointsToWin||11);$("#targetScore").disabled=true;
  $("#winByTwo").checked=d?.winByTwo!==false;$("#winByTwo").disabled=true;

  const maxSets=Number(d?.bestOf||3);
  const mlpLabels=["Trận 1: Đôi Nữ","Trận 2: Đôi Nam","Trận 3: Đôi Nam Nữ 1","Trận 4: Đôi Nam Nữ 2","Trận 5: Dreambreaker (nếu 2-2)"];
  const existingSets=activeMatch.sets||[];
  let setsHtml="";
  for(let i=0;i<maxSets;i++){
    const label=isMlp?(mlpLabels[i]||`Trận ${i+1}`):`Set ${i+1}`;
    const curA=existingSets[i]?.[0]??(i===existingSets.length?activeMatch.current?.[0]||"":"");
    const curB=existingSets[i]?.[1]??(i===existingSets.length?activeMatch.current?.[1]||"":"");
    setsHtml+=`<div class="quick-set-row"><span>${label}</span><input type="number" min="0" max="99" class="quick-score-a" value="${curA}" placeholder="0"><span>:</span><input type="number" min="0" max="99" class="quick-score-b" value="${curB}" placeholder="0"></div>`;
  }
  const qList=$("#quickSetsList");
  if(qList)qList.innerHTML=setsHtml;

  syncScoreDialog();$("#scoreDialog").showModal();
}
function syncScoreDialog(){
  if(!activeMatch)return;
  const a=Number(activeMatch.current?.[0]||0),b=Number(activeMatch.current?.[1]||0),d=divisionForMatch(activeMatch);
  $("#scoreA").textContent=a;$("#scoreB").textContent=b;
  $("#scoreSets").innerHTML=activeMatch.sets?.length?activeMatch.sets.map((s,i)=>`<span class="set-chip">Set ${i+1}: ${s[0]}–${s[1]}</span>`).join(""):'<span style="font-size:12px;color:#73847b">Chưa có set hoàn tất</span>';
  const isDoubles=["doubles","mixed_doubles","team"].includes(d?.eventType),mode=d?.scoringMode||"side_out";
  const serveSide=activeMatch.servingSide||"A",serverNo=Number(activeMatch.serverNumber||(isDoubles?2:1));
  if($("#scoringModeLabel"))$("#scoringModeLabel").textContent=mode==="rally"?"Rally scoring":"Side-out";
  if($("#serveStatus"))$("#serveStatus").textContent=(serveSide==="A"?teamName(activeMatch.a):teamName(activeMatch.b))+(mode==="rally"?" • quyền giao":" • Server "+serverNo);
  if($("#timeoutA"))$("#timeoutA").textContent=Number(activeMatch.timeouts?.A||0)+"/2";
  if($("#timeoutB"))$("#timeoutB").textContent=Number(activeMatch.timeouts?.B||0)+"/2";
  if($("#medicalA"))$("#medicalA").textContent=Number(activeMatch.medicalTimeouts?.A||0)+"/1";
  if($("#medicalB"))$("#medicalB").textContent=Number(activeMatch.medicalTimeouts?.B||0)+"/1";
  document.querySelectorAll("[data-service-side]").forEach(btn=>{
    const side=btn.dataset.serviceSide,no=Number(btn.dataset.serverNumber);
    btn.classList.toggle("active",side===serveSide&&(mode==="rally"||no===serverNo));
    btn.disabled=locked||(!isDoubles&&no===2)||(mode==="rally"&&no===2);
  });
  document.querySelectorAll("[data-rally]").forEach(btn=>btn.disabled=locked);
  document.querySelectorAll("[data-timeout-side]").forEach(btn=>{
    const side=btn.dataset.timeoutSide,kind=btn.dataset.timeoutKind;
    const used=Number((kind==="medical"?activeMatch.medicalTimeouts:activeMatch.timeouts)?.[side]||0),limit=kind==="medical"?1:2;
    btn.disabled=locked||used>=limit;
  });
  const target=Number(d?.pointsToWin||11),winByTwo=d?.winByTwo!==false,hi=Math.max(a,b),lo=Math.min(a,b);
  const setWon=a!==b&&hi>=target&&(!winByTwo||hi-lo>=2);
  const locked=["done","completed","walkover","cancelled"].includes(activeMatch.status)||Boolean(activeMatch.winner);
  $("#finishSet").disabled=locked||!setWon;
  const need=Math.ceil(Number(d?.bestOf||3)/2);
  const winsA=(activeMatch.sets||[]).filter(s=>Number(s[0])>Number(s[1])).length;
  const winsB=(activeMatch.sets||[]).filter(s=>Number(s[1])>Number(s[0])).length;
  const decider=setWon&&(a>b?winsA+1:winsB+1)>=need;
  $("#finishMatch").disabled=locked||!(winsA>=need||winsB>=need||decider);
  $("#saveQuickScore").disabled=locked;
  document.querySelectorAll('#quickSetsList input').forEach(input=>input.disabled=locked);
  $("#undoScore").disabled=activeMatch.status==="cancelled";
  document.querySelectorAll('[data-score]').forEach(btn=>{
    btn.disabled=locked||(btn.dataset.delta==="-1"&&(btn.dataset.score==="a"?a:b)<=0);
  });
  const tip=$("#scoreStatusTip");
  if(tip){
    if(locked){tip.hidden=false;tip.textContent=activeMatch.status==="cancelled"?"Trận đã hủy, không thể nhập điểm.":"Trận đã kết thúc. Dùng Undo để sửa kết quả nếu nhánh sau chưa bắt đầu."}
    else if(setWon){
      const winName=hi===a?teamName(activeMatch.a):teamName(activeMatch.b);
      const isMatchDecider=(hi===a?winsA+1:winsB+1)>=need;
      tip.hidden=false;
      tip.innerHTML=`✅ <b>${escHtml(winName)}</b> đã đủ điều kiện thắng ${isMatchDecider?'trận':'set'} (${hi}–${lo})! Bấm <b>${isMatchDecider?'Kết thúc trận':'Hoàn tất set'}</b> để lưu.`;
    }else{
      tip.hidden=true;
      tip.innerHTML="";
    }
  }
}
function scoreError(e){
  return {VERSION_CONFLICT:"Điểm đã thay đổi từ máy khác. Đã tải dữ liệu mới; hãy kiểm tra lại trước khi lưu.",
    DOWNSTREAM_MATCH_LOCKED:"Trận ở nhánh sau đã có lịch sử thi đấu, không thể sửa kết quả này.",DOWNSTREAM_MATCH_STARTED:"Trận ở nhánh sau đã bắt đầu, không thể sửa kết quả này.",
    UNDO_HISTORY_UNAVAILABLE:"Lịch sử cũ không đủ dữ liệu để Undo an toàn. Hãy kiểm tra nhật ký trận.",NOTHING_TO_UNDO:"Không còn thao tác để Undo.",
    MATCH_NOT_FINISHED:"Chưa đủ số set thắng để kết thúc trận.",NOT_ENOUGH_SET_WINS:"Chưa đủ số set thắng để kết thúc trận.",
    INVALID_SET_SCORE:"Tỉ số set chưa hợp lệ theo điểm thắng và cách biệt đã cấu hình.",INVALID_SERIES:"Dãy set không hợp lệ.",TOO_MANY_SETS:"Số set vượt quá luật thi đấu.",EXTRA_SET_AFTER_WINNER:"Không nhập thêm set sau khi đã đủ số set thắng.",
    MATCH_COMPLETED:"Trận đã kết thúc. Hãy Undo trước khi sửa điểm.",MATCH_CANCELLED:"Trận đã hủy.",MATCH_TEAMS_REQUIRED:"Chưa xác định đủ hai đội.",
    INVALID_WINNER:"Đội thắng không khớp với tỉ số.",MATCH_ROSTER_LOCKED:"Trận đã có lịch sử thi đấu, không thể đổi hai đội.",
    INVALID_COURT_SCOPE:"Sân phải đang hoạt động và thuộc giải này.",INVALID_REFEREE_SCOPE:"Trọng tài phải đang hoạt động và được cấp quyền cho giải này.",
    INVALID_SERVICE:"Trạng thái giao bóng không hợp lệ.",INVALID_TIMEOUT:"Timeout không hợp lệ.",TIMEOUT_LIMIT:"Đội này đã dùng đủ 2 timeout.",MEDICAL_TIMEOUT_LIMIT:"Đội này đã dùng medical timeout.",INVALID_COURT_STATE:"Trạng thái điều phối sân không hợp lệ.",
    INVALID_TEAMS:"Chọn hai đội đang hoạt động thuộc cùng nội dung.",BRACKET_SLOT_OCCUPIED:"Vị trí ở nhánh sau đã có đội khác. Hãy kiểm tra bracket."}[e.message]||"Không thể lưu: "+e.message;
}
async function showScoreError(e){if(e.message==="VERSION_CONFLICT")await refresh({keepDialog:true});toast(scoreError(e))}
async function showMatchDraftError(e,m){
  if(e.message==="VERSION_CONFLICT"){
    await refresh();
    const latest=state.matches.find(x=>x.id===m.id);
    if(latest){
      Object.assign(m,latest);
      if(["done","completed","walkover","cancelled"].includes(latest.status)&&$("#saveSpecialResult"))$("#saveSpecialResult").disabled=true;
    }else{for(const id of ["#saveAssignment","#saveSpecialResult"])if($(id))$(id).disabled=true}
  }
  toast(scoreError(e));
}
async function saveQuickScore(){
  if(busy||!activeMatch)return;busy=true;
  try{
    const rows=document.querySelectorAll("#quickSetsList .quick-set-row");
    const sets=[];
    for(const r of rows){
      const valA=r.querySelector(".quick-score-a").value.trim();
      const valB=r.querySelector(".quick-score-b").value.trim();
      if(valA===""&&valB==="")continue;
      if(valA===""||valB==="")return toast("Nhập đủ điểm hai bên cho mỗi set.");
      const a=Number(valA),b=Number(valB);
      if(![a,b].every(n=>Number.isSafeInteger(n)&&n>=0))return toast("Điểm phải là số nguyên từ 0 trở lên.");
      sets.push([a,b]);
    }
    if(!sets.length)return toast("Vui lòng nhập tỉ số ít nhất 1 set.");
    await API.quickScore(activeMatch.id,{sets,expectedVersion:activeMatch.version});
    $("#scoreDialog").close();
    activeMatch=null;
    await refresh();
    toast("Đã lưu kết quả! Bảng xếp hạng đã tự động xếp Nhất bảng & Nhì bảng.");
  }catch(e){
    await showScoreError(e);
  }finally{
    busy=false;
  }
}
async function scorePoint(side,delta){
  if(busy||!activeMatch)return;busy=true;
  try{
    await API.point(activeMatch.id,{side:side.toUpperCase(),delta:Number(delta),expectedVersion:activeMatch.version});
    await refresh({keepDialog:true});
  }catch(e){await showScoreError(e)}
  finally{busy=false}
}
async function rallyPoint(side){
  if(busy||!activeMatch)return;busy=true;
  try{await API.rally(activeMatch.id,{side,expectedVersion:activeMatch.version});await refresh({keepDialog:true})}
  catch(e){await showScoreError(e)}finally{busy=false}
}
async function setService(side,serverNumber){
  if(busy||!activeMatch)return;busy=true;
  try{await API.service(activeMatch.id,{side,serverNumber:Number(serverNumber),expectedVersion:activeMatch.version});await refresh({keepDialog:true})}
  catch(e){await showScoreError(e)}finally{busy=false}
}
async function useTimeout(side,kind){
  if(busy||!activeMatch)return;busy=true;
  try{await API.timeout(activeMatch.id,{side,kind,expectedVersion:activeMatch.version});await refresh({keepDialog:true});toast(kind==="medical"?"Đã ghi medical timeout.":"Đã ghi timeout.")}
  catch(e){await showScoreError(e)}finally{busy=false}
}
async function finishSet(){
  if(busy||!activeMatch)return;busy=true;
  try{await API.finishSet(activeMatch.id,{expectedVersion:activeMatch.version});await refresh({keepDialog:true});toast("Đã chốt set.")}
  catch(e){await showScoreError(e)}
  finally{busy=false}
}
async function finishMatch(){
  if(busy||!activeMatch)return;busy=true;
  try{await API.finishMatch(activeMatch.id,{expectedVersion:activeMatch.version});$("#scoreDialog").close();activeMatch=null;await refresh();toast("Đã chốt trận và cập nhật bracket/BXH.")}
  catch(e){await showScoreError(e)}
  finally{busy=false}
}
async function undoScore(){
  if(busy||!activeMatch)return;busy=true;
  try{await API.undo(activeMatch.id,{expectedVersion:activeMatch.version});await refresh({keepDialog:true});toast("Đã Undo và ghi audit log.")}
  catch(e){await showScoreError(e)}
  finally{busy=false}
}
function openPasswordModal(){
  $("#genericTitle").textContent="Đổi mật khẩu";
  $("#genericBody").innerHTML=`<div class="form-grid"><label class="field full">Mật khẩu hiện tại<input id="pwCurrent" type="password"></label><label class="field full">Mật khẩu mới<input id="pwNew" type="password" minlength="12"></label><label class="field full">Nhập lại mật khẩu mới<input id="pwConfirm" type="password" minlength="12"></label><div class="field full"><button type="button" class="btn primary" id="savePassword">Đổi mật khẩu</button></div></div>`;
  $("#genericDialog").showModal();
  $("#savePassword").onclick=async()=>{const n=$("#pwNew").value;if(n!==$("#pwConfirm").value)return toast("Mật khẩu nhập lại không khớp.");try{await API.changePassword($("#pwCurrent").value,n);toast("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");location.href=location.pathname.includes("/preview/")?"admin.html":"/login"}catch(e){toast(e.message==="INVALID_CURRENT_PASSWORD"?"Mật khẩu hiện tại không đúng.":["PASSWORD_POLICY","PASSWORD_TOO_SHORT"].includes(e.message)?"Mật khẩu mới phải từ 12–64 ký tự.":e.message==="PASSWORD_REUSE"?"Mật khẩu mới phải khác mật khẩu hiện tại.":"Không thể đổi mật khẩu.")}};
}
function selectDivisionDialog(title,buttonText,onSubmit){
  if(!state.divisions.length)return toast("Chưa có nội dung thi đấu.");
  $("#genericTitle").textContent=title;
  $("#genericBody").innerHTML=`<div class="form-grid"><label class="field full">Nội dung<select id="autoDivision">${state.divisions.map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}</select></label><div class="field full"><button type="button" class="btn primary" id="autoSubmit">${buttonText}</button></div></div>`;
  $("#genericDialog").showModal();$("#autoSubmit").onclick=()=>onSubmit($("#autoDivision").value);
}
function openAutoScheduleModal(){selectDivisionDialog("Xếp sân tự động","Xếp sân",async id=>{try{let r;const hasGroup=state.matches.some(m=>m.divisionId===id&&!m.bracketSlot&&(m.stage||"").startsWith("Bảng "));r=hasGroup?await API.autoScheduleCourts(id):await API.generateRoundRobin(id);$("#genericDialog").close();await refresh();toast(hasGroup?`Đã xếp ${r.updated||0} trận trên ${r.courts||0} sân.`:`Đã tạo ${r.created||0} trận và xếp trên ${r.courts||0} sân.`)}catch(e){toast("Không thể xếp sân: "+e.message)}})}
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
    <label class="field">Trọng tài<select id="mRef"><option value="">Chưa gán</option>${refs.filter(r=>r.active).map(r=>`<option value="${r.id}">${escHtml(r.display_name)}</option>`).join("")}</select></label>
    <div class="field full"><button type="button" class="btn primary" id="saveMatch">Tạo trận</button></div>
  </div>`;
  const syncTeams=()=>{const did=$("#mDivision").value,ts=state.teams.filter(t=>t.divisionId===did),opts=ts.map(t=>`<option value="${t.id}">${t.name}</option>`).join("");$("#mTeamA").innerHTML=opts;$("#mTeamB").innerHTML=opts;if(ts.length>1)$("#mTeamB").selectedIndex=1};
  $("#genericDialog").showModal();syncTeams();$("#mDivision").onchange=syncTeams;
  $("#saveMatch").onclick=async()=>{
    const teamAId=$("#mTeamA").value,teamBId=$("#mTeamB").value;
    if(!teamAId||!teamBId)return toast("Cần chọn đủ hai đội.");
    if(teamAId===teamBId)return toast("Hai bên thi đấu phải là hai đội khác nhau.");
    try{await API.createMatch($("#mDivision").value,{teamAId,teamBId,courtId:$("#mCourt").value||null,refereeUserId:$("#mRef").value||null,stage:$("#mStage").value||"Vòng bảng",scheduledAt:$("#mTime").value||null});$("#genericDialog").close();await refresh();toast("Đã tạo trận.")}catch(e){toast("Không thể tạo trận: "+e.message)}
  };
}
async function openMatchDetail(id){
  const m=state.matches.find(x=>x.id===id);if(!m)return;
  const refs=canManage()?await API.referees().catch(()=>[]):[];
  $("#genericTitle").textContent="Chi tiết trận";
  const assignment=canManage()?`<div class="form-grid">
    <label class="field">Sân<select id="detailCourt"><option value="">Chưa gán</option>${state.courts.map(x=>`<option value="${x.id}" ${x.id===m.courtId?"selected":""}>${x.name}</option>`).join("")}</select></label>
    <label class="field">Trọng tài<select id="detailRef"><option value="">Chưa gán</option>${refs.filter(r=>r.active||r.id===m.refereeId).map(r=>`<option value="${r.id}" ${r.id===m.refereeId?"selected":""}>${escHtml(r.display_name)}${r.active?"":" (đã khóa)"}</option>`).join("")}</select></label>
    <label class="field full">Đổi giờ<input id="detailTime" type="datetime-local"></label>
    <div class="field full"><button type="button" class="btn primary" id="saveAssignment">Lưu điều phối</button></div>
  </div>`:"";
  const special=!["done","completed","walkover","cancelled"].includes(m.status)&&m.a!=="TBD"&&m.b!=="TBD"?`<div class="special-result-box">
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
    await API.assignMatch(m.id,{courtId:$("#detailCourt").value||null,refereeUserId:$("#detailRef").value||null,...($("#detailTime").value?{scheduledAt:$("#detailTime").value}:{}),expectedVersion:m.version});
    $("#genericDialog").close();await refresh();toast("Đã cập nhật điều phối.");
  }catch(e){await showMatchDraftError(e,m)}};

  const specialBtn=$("#saveSpecialResult");
  if(specialBtn)specialBtn.onclick=async()=>{
    if(!confirm("Chốt kết quả đặc biệt cho trận này?"))return;
    try{
      await API.specialResult(m.id,{winnerTeamId:$("#specialWinner").value,reason:$("#specialReason").value,note:$("#specialNote").value.trim(),expectedVersion:m.version});
      $("#genericDialog").close();await refresh();toast("Đã chốt kết quả đặc biệt và cập nhật bracket.");
    }catch(e){await showMatchDraftError(e,m)}
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
    <label class="field">Cách tính điểm<select id="dScoring"><option value="side_out">Side-out</option><option value="rally">Rally scoring</option></select></label>
    <label class="field">Nghỉ tối thiểu (phút)<input id="dRest" type="number" value="15" min="0" max="120"></label>
    <label class="field">Thời lượng/trận (phút)<input id="dSlot" type="number" value="20" min="5" max="180"></label>
    <label class="field" style="align-content:end"><span><input id="dWin2" type="checkbox" checked> Thắng cách 2</span></label>
    <div class="field full"><button type="button" class="btn primary" id="saveDivision">Thêm nội dung</button></div>
  </div>`;
  $("#genericDialog").showModal();
  $("#saveDivision").onclick=async()=>{try{await API.createDivision($("#dTournament").value,{name:$("#dName").value,eventType:$("#dType").value,format:$("#dFormat").value,bestOf:Number($("#dBest").value),pointsToWin:Number($("#dPoints").value),advanceCount:Number($("#dAdvance").value),scoringMode:$("#dScoring").value,minimumRestMinutes:Number($("#dRest").value),matchSlotMinutes:Number($("#dSlot").value),winByTwo:$("#dWin2").checked});$("#genericDialog").close();await refresh();toast("Đã thêm nội dung.")}catch(e){toast("Không thể thêm: "+e.message)}};
}
function openCourtModal(){
  if(!state.tournaments.length)return toast("Cần tạo giải trước.");
  $("#genericTitle").textContent="Thêm sân";
  $("#genericBody").innerHTML=`<div class="form-grid"><label class="field full">Giải<select id="cTournament">${state.tournaments.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select></label><label class="field full">Tên sân<input id="cName" placeholder="VD: Sân 1"></label><div class="field full"><button type="button" class="btn primary" id="saveCourt">Thêm sân</button></div></div>`;
  $("#genericDialog").showModal();
  $("#saveCourt").onclick=async()=>{try{await API.createCourt($("#cTournament").value,{name:$("#cName").value});$("#genericDialog").close();await refresh();toast("Đã thêm sân.")}catch(e){toast("Không thể thêm sân: "+e.message)}};
}
async function syncTournamentCourtCount(tournamentId,count){
  count=Math.max(1,Math.min(20,Number(count)||6));
  const active=state.courts.filter(x=>x.tournamentId===tournamentId&&x.active!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
  if(active.length<count){
    for(let i=active.length+1;i<=count;i++)await API.createCourt(tournamentId,{name:"Sân "+i,sortOrder:i});
  }else if(active.length>count){
    const remove=[...active].sort((a,b)=>(b.sortOrder||0)-(a.sortOrder||0)).slice(0,active.length-count);
    for(const court of remove)await API.deleteCourt(court.id);
  }
}
function openCourtCountModal(tournamentId){
  if(!state.tournaments.length)return toast("Cần tạo giải trước.");
  const selected=tournamentId||state.tournaments[0].id;
  const current=id=>state.courts.filter(x=>x.tournamentId===id&&x.active!==false).length||6;
  $("#genericTitle").textContent="Cấu hình số sân";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Giải<select id="courtCountTournament">${state.tournaments.map(t=>`<option value="${t.id}" ${t.id===selected?"selected":""}>${escHtml(t.name)}</option>`).join("")}</select></label>
    <label class="field full">Số sân hoạt động<input id="courtCountValue" type="number" min="1" max="20" step="1" value="${current(selected)}"></label>
    <div class="field full"><span style="font-size:11px;color:#73847b">Mặc định 6 sân. Có thể tăng/giảm từ 1–20 sân. Nếu giảm sân đã có lịch sử, sân sẽ được ẩn nhưng dữ liệu trận vẫn giữ nguyên.</span></div>
    <div class="field full"><button type="button" class="btn primary" id="saveCourtCount">Lưu số sân</button></div>
  </div>`;
  const dlg=$("#genericDialog");if(!dlg.open)dlg.showModal();
  const select=$("#courtCountTournament"),input=$("#courtCountValue");
  select.onchange=()=>{input.value=current(select.value)};
  $("#saveCourtCount").onclick=async()=>{
    const tid=select.value,count=Math.max(1,Math.min(20,Number(input.value)||6));
    try{
      await syncTournamentCourtCount(tid,count);
      await refresh();
      for(const d of state.divisions.filter(x=>x.tournamentId===tid)){
        const pending=state.matches.some(m=>m.divisionId===d.id&&!m.bracketSlot&&(m.stage||"").startsWith("Bảng ")&&m.status==="wait");
        const started=state.matches.some(m=>m.divisionId===d.id&&!m.bracketSlot&&(m.stage||"").startsWith("Bảng ")&&(m.status==="live"||m.status==="done"||m.status==="completed"));
        if(pending&&!started)await API.autoScheduleCourts(d.id).catch(()=>{});
      }
      dlg.close();await refresh();toast("Đã cấu hình "+count+" sân và tự xếp lại lịch chưa bắt đầu.");
    }catch(e){toast("Không thể cập nhật số sân: "+e.message)}
  };
}
function openTournamentModal(){
  $("#genericTitle").textContent="Tạo giải mới";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Tên giải<input id="fName" placeholder="VD: Bình Lợi Open 2026"></label>
    <label class="field">Ngày giờ<input id="fDate" type="datetime-local"></label>
    <label class="field">Nội dung<select id="fType"><option value="doubles">Đôi nam/nữ</option><option value="mixed_doubles">Đôi nam nữ</option><option value="singles">Đơn</option><option value="team">Đồng đội</option></select></label>
    <label class="field full">Địa điểm<input id="fVenue" placeholder="Tên sân / CLB"></label>
    <label class="field full">Số sân sử dụng<input id="fCourtCount" type="number" min="1" max="20" step="1" value="6"><span>Mặc định 6 sân, có thể chỉnh lại sau.</span></label>
    <div class="field full"><button type="button" class="btn primary" id="saveTournament">Tạo giải</button></div>
  </div>`;
  $("#genericDialog").showModal();
  $("#saveTournament").onclick=async()=>{const name=$("#fName").value.trim();if(!name)return toast("Nhập tên giải.");const courtCount=Math.max(1,Math.min(20,Number($("#fCourtCount").value)||6));try{const created=await API.createTournament({name,venue:$("#fVenue").value,startAt:$("#fDate").value||null,eventType:$("#fType").value});const tid=created?.tournament?.id||created?.id;if(tid)for(let i=1;i<=courtCount;i++)await API.createCourt(tid,{name:"Sân "+i,sortOrder:i});$("#genericDialog").close();await refresh();toast("Đã tạo giải với "+courtCount+" sân.")}catch(e){toast("Không thể tạo giải: "+e.message)}};
}
function openCsvImportModal(){
  $("#genericTitle").textContent="Import VĐV / Hội viên (Hỗ trợ Zalo)";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field">Loại dữ liệu<select id="csvType"><option value="players">VĐV / Hội viên</option><option value="teams">Đội / cặp</option></select></label>
    <label class="field" id="csvDivisionWrap" style="display:none">Nội dung<select id="csvDivision">${state.divisions.filter(d=>d.active!==false).map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}</select></label>
    <label class="field full">Tải lên file CSV<input id="csvFile" type="file" accept=".csv,text/csv,.json"></label>
    <label class="field full">Hoặc dán trực tiếp (CSV / JSON quét từ Zalo)<textarea id="csvPaste" rows="3" placeholder="Dán dữ liệu CSV hoặc JSON danh sách hội viên Zalo vào đây..."></textarea></label>
    <div class="field full" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div class="csv-help" id="csvHelp" style="margin:0"><b>Header VĐV:</b> fullName,avatarUrl,phone,club,rating,nickname,gender</div>
      <button type="button" class="mini" id="lhmPresetBtn" style="font-size:12px;padding:6px 12px;background:#0d2118;color:#dfff69;border:1px solid #dfff6944;border-radius:8px;font-weight:700;cursor:pointer;white-space:nowrap">⚡ Nạp 1,015 hội viên Bình Lợi (LHM CRM)</button>
    </div>
    <div class="field full"><div id="csvPreview" class="csv-preview">Chọn file hoặc dán dữ liệu để xem trước.</div></div>
    <div class="security-note" id="csvIssues" role="alert" hidden style="grid-column:1/-1;overflow-wrap:anywhere"></div>
    <div class="field full"><button type="button" class="btn primary" id="csvImportBtn" disabled>Bắt đầu Import</button></div>
  </div>`;
  $("#genericDialog").showModal();
  let rows=[];
  const type=$("#csvType"),file=$("#csvFile"),paste=$("#csvPaste"),preview=$("#csvPreview"),btn=$("#csvImportBtn"),lhmBtn=$("#lhmPresetBtn");
  const issueBox=$("#csvIssues");
  const showIssues=error=>{
    const issues=error.data?.detail?.issues||error.data?.issues||error.issues||[];
    const reasons={
      PLAYER_NOT_FOUND:"VĐV không tồn tại trong hệ thống. Hãy tạo hồ sơ hoặc sửa họ tên trước.",
      AMBIGUOUS_PLAYER:"Có nhiều hồ sơ trùng tên. Hãy kiểm tra và phân biệt hồ sơ trước khi import.",
      PLAYER_INACTIVE:"Hồ sơ VĐV đang bị khóa. Hãy chọn hồ sơ đang hoạt động.",
      DUPLICATE_PLAYER_SELECTION:"Không thể chọn cùng một VĐV hai lần trong một đội.",
      PLAYER_ALREADY_IN_IMPORT:"VĐV xuất hiện nhiều lần trong CSV này. Hãy giữ một đội cho mỗi nội dung.",
      PLAYER_ALREADY_IN_DIVISION:"VĐV đã thuộc một cặp/đội khác trong nội dung này.",
      PLAYER_SELECTION_REQUIRED:"Chưa có VĐV. Hãy điền tên hồ sơ tại các cột player.",
      INVALID_PLAYER_COUNT:"Số lượng VĐV không đúng: đơn cần 1, đôi / đôi nam nữ cần 2, đồng đội cần 1–4 VĐV."
    };
    issueBox.replaceChildren();
    const heading=document.createElement("b");heading.textContent="Import thất bại. Sửa các dòng dưới đây rồi thử lại:";issueBox.appendChild(heading);
    if(issues.length){
      const list=document.createElement("ul");
      issues.forEach(issue=>{
        const item=document.createElement("li");
        item.textContent=`Dòng ${issue.row??"—"} • Cột ${issue.field||"—"} • Tên: ${issue.name||"—"} • ${reasons[issue.reason]||issue.reason||"Dữ liệu không hợp lệ."}`;
        list.appendChild(item);
      });
      issueBox.appendChild(list);
    }else{
      const message=document.createElement("p");message.textContent=reasons[error.message]||error.message;issueBox.appendChild(message);
    }
    issueBox.hidden=false;
  };
  if(lhmBtn){
    lhmBtn.onclick=async()=>{
      try{
        lhmBtn.disabled=true;
        lhmBtn.textContent="Đang nạp 1,015 hội viên...";
        type.value="players";updateHelp();
        if(typeof window!=="undefined"&&window.PICKLE_BINH_LOI_MEMBERS&&window.PICKLE_BINH_LOI_MEMBERS.length){
          rows=window.PICKLE_BINH_LOI_MEMBERS;
        }else{
          const res=await fetch("assets/members-binh-loi.json");
          if(!res.ok)throw new Error("Không thể tải file dữ liệu.");
          rows=await res.json();
        }
        renderPreview();
        toast("Đã nạp 1,015 hội viên CLB Bình Lợi từ LHM CRM!");
      }catch(err){
        toast("Lỗi tải dữ liệu: "+err.message);
      }finally{
        lhmBtn.disabled=false;
        lhmBtn.textContent="⚡ Nạp 1,015 hội viên Bình Lợi (LHM CRM)";
      }
    };
  }
  const updateHelp=()=>{const teams=type.value==="teams";$("#csvDivisionWrap").style.display=teams?"grid":"none";$("#csvHelp").innerHTML=teams?'<b>Header đội:</b> name,club,group,seed,player1,player2,player3,player4 <small>(đơn: 1 VĐV; đôi / đôi nam nữ: 2; đồng đội: 1–4)</small>':'<b>Header VĐV:</b> fullName,avatarUrl,phone,club,rating,nickname,gender';if(lhmBtn)lhmBtn.style.display=teams?"none":"inline-block";};
  type.onchange=()=>{updateHelp();rows=[];preview.textContent="Chọn file hoặc dán dữ liệu để xem trước.";issueBox.hidden=true;btn.disabled=true};updateHelp();
  const renderPreview=()=>{
    if(!rows.length){preview.textContent="Không có dữ liệu hợp lệ.";btn.disabled=true;return}
    const keys=Object.keys(rows[0]);
    preview.innerHTML='<div class="csv-preview-head">'+keys.map(k=>`<b>${escHtml(k)}</b>`).join("")+'</div>'+rows.slice(0,5).map(r=>'<div class="csv-preview-row">'+keys.map(k=>{const val=String(r[k]??"");if(k.toLowerCase().includes("avatar")&&/^https?:\/\//i.test(val))return `<span><img src="${escHtml(val)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover"></span>`;return `<span>${escHtml(val)}</span>`;}).join("")+'</div>').join("")+`<small>${rows.length} dòng dữ liệu sẵn sàng import</small>`;btn.disabled=false;
  };
  file.onchange=async()=>{
    const f=file.files?.[0];if(!f)return;
    const txt=await f.text();
    if(f.name.endsWith(".json")||txt.trim().startsWith("[")){try{rows=JSON.parse(txt)}catch{rows=[]}}
    else rows=window.PickleCSV?.parse(txt)||[];
    renderPreview();
  };
  paste.oninput=()=>{
    const txt=paste.value.trim();if(!txt){rows=[];renderPreview();return}
    if(txt.startsWith("[")){try{rows=JSON.parse(txt)}catch{rows=[]}}
    else rows=window.PickleCSV?.parse(txt)||[];
    renderPreview();
  };
  btn.onclick=async()=>{
    if(!rows.length)return;btn.disabled=true;issueBox.hidden=true;
    try{
      const r=type.value==="players"?await API.importPlayers(rows):await API.importTeams($("#csvDivision").value,rows);
      $("#genericDialog").close();await refresh();toast(`Đã import thành công ${r.created} ${type.value==="players"?"VĐV / Hội viên":"đội"}.`);
    }catch(e){btn.disabled=false;showIssues(e);toast("Import thất bại. Xem chi tiết trong hộp import.")}
  };
}
async function openPlayerModal(){
  const clubs=await API.clubs().catch(()=>[]);
  $("#genericTitle").textContent="Tạo hồ sơ VĐV";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <div class="field full" style="padding:12px;border-radius:14px;background:#f5f8f6"><b>Tạo hồ sơ trước khi đưa VĐV vào giải</b><span style="display:block;margin-top:4px">VĐV sẽ được chọn từ Bảng VĐV / Rating hệ thống. Ảnh đại diện có thể bổ sung sau; khi chưa có ảnh hệ thống sẽ dùng chữ viết tắt.</span></div>
    <label class="field full">Họ tên *<input id="pName" autocomplete="off"></label>
    <label class="field">Biệt danh<input id="pNick"></label>
    <label class="field">Giới tính<select id="pGender"><option value="">Chưa chọn</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option></select></label>
    <label class="field">CLB<select id="pClub"><option value="">Tự do</option>${clubs.map(x=>`<option value="${x.id}">${escHtml(x.name)}</option>`).join("")}</select></label>
    <label class="field">Điểm trình *<input id="pRating" type="number" min="0.1" step="0.001" value="3.000"></label>
    <label class="field">Điện thoại<input id="pPhone"></label>
    <div class="field full"><button type="button" class="btn primary" id="savePlayer">Tạo hồ sơ VĐV</button></div>
  </div>`;
  $("#genericDialog").showModal();
  $("#savePlayer").onclick=async()=>{try{await API.createPlayer({fullName:$("#pName").value,nickname:$("#pNick").value,gender:$("#pGender").value||null,clubId:$("#pClub").value||null,rating:Number($("#pRating").value)||3,phone:$("#pPhone").value});$("#genericDialog").close();await render();toast("Đã tạo hồ sơ VĐV trong bảng Rating.")}catch(e){toast("Không thể tạo hồ sơ VĐV: "+e.message)}};
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
  $("#genericBody").innerHTML=`<div class="form-grid">
    <div class="field full"><b>${name}</b><span>Rating hiện tại: <strong>${fmtRating(current)}</strong></span></div>
    <div class="field full" style="display:flex;gap:8px">
      <button type="button" class="mini" id="quickChampion" style="background:#eaf1ed;border:1px solid #1a5632;color:#1a5632;font-weight:700;cursor:pointer">+0.2 (Vô địch)</button>
      <button type="button" class="mini" id="quickEliminated" style="background:#fde8e8;border:1px solid #c81e1e;color:#c81e1e;font-weight:700;cursor:pointer">-0.2 (Loại vòng bảng)</button>
    </div>
    <label class="field">Điều chỉnh (+/-)<input id="ratingDelta" type="number" step="0.1" placeholder="VD: 0.2 hoặc -0.2"></label>
    <label class="field full">Lý do<textarea id="ratingReason" rows="3" placeholder="Bắt buộc ghi lý do"></textarea></label>
    <div class="field full"><button type="button" class="btn primary" id="saveRating">Lưu rating</button></div>
  </div>`;
  $("#genericDialog").showModal();
  $("#quickChampion").onclick=()=>{ $("#ratingDelta").value="0.2"; $("#ratingReason").value="Vô địch giải đấu (+0.2)"; };
  $("#quickEliminated").onclick=()=>{ $("#ratingDelta").value="-0.2"; $("#ratingReason").value="Dừng bước vòng bảng (-0.2)"; };
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
async function openTeamModal(presetDivisionId=null,autoRegister=false){
  if(!state.divisions.length)return toast("Cần tạo giải/nội dung trước.");
  const roster=(await API.players().catch(()=>[])).filter(player=>player.active!==false&&player.active!==0);
  $("#genericTitle").textContent="Thêm cặp / đội";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Nội dung<select id="teamDivision">${state.divisions.filter(d=>d.active!==false).map(d=>`<option value="${d.id}" ${d.id===presetDivisionId?"selected":""}>${d.name}</option>`).join("")}</select></label>
    <div class="field full" id="teamPlayerPicker"></div>
    <label class="field full">Tên cặp / đội<input id="teamName" placeholder="Để trống sẽ lấy tên VĐV đã chọn"></label>
    <label class="field">CLB<input id="teamClub" placeholder="Có thể để trống"></label>
    <label class="field">Bảng<input id="teamGroup" value="A" maxlength="3"></label>
    <label class="field">Seed<input id="teamSeed" type="number" min="1"></label>
    <div class="field full"><button type="button" class="btn primary" id="saveTeam">${autoRegister?"Thêm vào giải":"Thêm đội"}</button></div>
  </div>`;
  $("#genericDialog").showModal();
  const slotCount=division=>division?.eventType==="singles"?1:(division?.eventType==="team"?4:2);
  const excludedFor=divisionId=>new Set(state.teams.filter(team=>team.divisionId===divisionId&&team.status!=="withdrawn").flatMap(team=>state.teamPlayers?.[team.id]||[]));
  let picker,nameEdited=false,clubEdited=false;
  const syncName=ids=>{
    const names=ids.map(id=>roster.find(p=>p.id===id)?.full_name).filter(Boolean);
    if(!nameEdited)$("#teamName").value=names.join(" / ");
    const clubs=ids.map(id=>roster.find(p=>p.id===id)?.club_name?.trim()||"");
    if(!clubEdited)$("#teamClub").value=clubs.length&&clubs[0]&&clubs[0]!=="Tự do"&&clubs.every(club=>club===clubs[0])?clubs[0]:"";
  };
  const mountPicker=()=>{
    picker?.destroy();
    const division=state.divisions.find(item=>item.id===$("#teamDivision").value);
    picker=window.PicklePlayerPicker.mount({
      root:$("#teamPlayerPicker"),players:roster,count:slotCount(division),excludedIds:[...excludedFor(division?.id)],
      formatRating:fmtRating,onChange:syncName
    });
    syncName([]);
  };
  $("#teamName").oninput=()=>{nameEdited=Boolean($("#teamName").value.trim())};
  $("#teamClub").oninput=()=>{clubEdited=Boolean($("#teamClub").value.trim())};
  $("#teamDivision").onchange=()=>{nameEdited=false;clubEdited=false;mountPicker()};
  mountPicker();
  $("#saveTeam").onclick=async()=>{
    const button=$("#saveTeam");
    const ids=picker.values();
    let name=$("#teamName").value.trim();if(!name){syncName(ids);name=$("#teamName").value.trim()}
    if(!name)return toast("Nhập tên đội hoặc chọn VĐV.");
    button.disabled=true;
    try{
      const divisionId=$("#teamDivision").value;
      const team=await API.createTeam(divisionId,{name,club:$("#teamClub").value,group:$("#teamGroup").value||"A",seed:Number($("#teamSeed").value)||null,playerIds:ids});
      if(autoRegister)await API.createRegistration(divisionId,{teamId:team.id,amount:0});
      $("#genericDialog").close();await refresh();
      if(autoRegister&&presetDivisionId){const division=state.divisions.find(item=>item.id===divisionId);if(division)await openTournamentDetail(division.tournamentId)}
      toast(autoRegister?"Đã thêm VĐV vào danh sách tham gia giải.":"Đã thêm đội và liên kết hồ sơ VĐV.");
    }catch(e){
      const message={
        PLAYER_SELECTION_REQUIRED:"Hãy chọn VĐV từ Bảng VĐV / Rating hệ thống.",
        DUPLICATE_PLAYER_SELECTION:"Không thể chọn cùng một VĐV hai lần.",
        INVALID_PLAYER_COUNT:"Số lượng VĐV chưa đúng với nội dung thi đấu.",
        PLAYER_NOT_FOUND:"Có VĐV không còn tồn tại trong hệ thống.",
        PLAYER_INACTIVE:"Có VĐV đang bị khóa trong hệ thống.",
        PLAYER_ALREADY_IN_DIVISION:"VĐV đã thuộc một cặp/đội khác trong nội dung này.",
        PLAYER_SCOPE_FORBIDDEN:"Bạn không có quyền sử dụng hồ sơ VĐV này.",
        REGISTRATION_EXISTS:"Cặp/đội này đã đăng ký."
      }[e.message]||e.message;
      toast("Không thể thêm đội: "+message)
    }finally{button.disabled=false}
  };
}
async function saveRules(id){
  try{
    await API.updateDivision(id,{
      bestOf:Number(document.querySelector(`[data-rule-best="${id}"]`).value),
      pointsToWin:Number(document.querySelector(`[data-rule-points="${id}"]`).value),
      advanceCount:Number(document.querySelector(`[data-rule-advance="${id}"]`).value),
      scoringMode:document.querySelector(`[data-rule-scoring="${id}"]`).value,
      minimumRestMinutes:Number(document.querySelector(`[data-rule-rest="${id}"]`).value),
      matchSlotMinutes:Number(document.querySelector(`[data-rule-slot="${id}"]`).value),
      winByTwo:document.querySelector(`[data-rule-win2="${id}"]`).checked
    });
    await refresh();toast("Đã lưu rule thi đấu.");
  }catch(e){toast("Không thể lưu: "+e.message)}
}
function openRegistrationModal(){
  if(!state.divisions.length||!state.teams.length)return toast("Chưa có nội dung hoặc đội.");
  $("#genericTitle").textContent="Tạo đăng ký";
  $("#genericBody").innerHTML=`<div class="form-grid"><label class="field full">Nội dung<select id="regDivision">${state.divisions.map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}</select></label><label class="field full">Đội<select id="regTeam"></select></label><label class="field full">Lệ phí<input id="regAmount" type="number" min="0" placeholder="VD: 500000"></label><div class="field full"><button type="button" class="btn primary" id="saveRegistration">Tạo đăng ký</button></div></div>`;
  $("#genericDialog").showModal();
  const syncRegistrationTeams=()=>{
    const did=$("#regDivision").value,teams=state.teams.filter(t=>t.divisionId===did);
    $("#regTeam").innerHTML=teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join("");
    $("#saveRegistration").disabled=!teams.length;
  };
  $("#regDivision").onchange=syncRegistrationTeams;syncRegistrationTeams();
  $("#saveRegistration").onclick=async()=>{
    const teamId=$("#regTeam").value;if(!teamId)return toast("Nội dung này chưa có đội để đăng ký.");
    try{await API.createRegistration($("#regDivision").value,{teamId,amount:Number($("#regAmount").value)||null});$("#genericDialog").close();await render();toast("Đã tạo đăng ký.")}catch(e){toast("Không thể tạo: "+e.message)}
  };
}
function openPaymentModal(registrationId){
  $("#genericTitle").textContent="Ghi nhận chuyển khoản";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Mã giao dịch / nội dung CK<input id="payRef"></label>
    <label class="field full">Biên lai ảnh/PDF<input id="payReceiptFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label>
    <label class="field full">Hoặc link biên lai<input id="payReceipt" type="url"></label>
    <div class="field full"><button type="button" class="btn primary" id="savePayment">Ghi nhận</button></div>
  </div>`;
  $("#genericDialog").showModal();
  $("#savePayment").onclick=async()=>{
    const btn=$("#savePayment");btn.disabled=true;
    try{
      let receiptUrl=$("#payReceipt").value.trim();const file=$("#payReceiptFile").files?.[0];
      if(file)receiptUrl=(await API.uploadReceipt(file)).url;
      await API.addPayment(registrationId,{method:"bank_transfer",referenceCode:$("#payRef").value,receiptUrl});
      $("#genericDialog").close();await render();toast("Đã ghi nhận, chờ duyệt.");
    }catch(e){btn.disabled=false;toast("Không thể ghi nhận: "+e.message)}
  };
}
async function openEditRefereeModal(id){
  const refs=await API.referees().catch(()=>[]),r=refs.find(x=>x.id===id);if(!r)return;
  const tournaments=state.tournaments||[];
  $("#genericTitle").textContent="Quản lý trọng tài";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Tên<input id="erName" value="${escHtml(r.display_name||"")}"></label>
    <label class="field full">Email<input id="erEmail" type="email" value="${escHtml(r.email||"")}"></label>
    <label class="field full">Giải được giao<select id="erTournament">${user?.role==="super_admin"?'<option value="">Toàn hệ thống</option>':""}${tournaments.map(t=>`<option value="${t.id}" ${t.id===r.tournament_id_scope?"selected":""}>${escHtml(t.name)}</option>`).join("")}</select></label>
    <label class="field full">Mật khẩu mới <small>(để trống nếu không reset)</small><input id="erPassword" type="password" minlength="12"></label>
    <label class="field full"><span><input id="erActive" type="checkbox" ${r.active?"checked":""}> Tài khoản hoạt động</span></label>
    <div class="field full security-note"><b>Phạm vi giải</b><span>Trọng tài chỉ thấy các trận được phân công trong giải này.</span></div>
    <div class="field full"><button type="button" class="btn primary" id="saveRefereeEdit">Lưu</button></div>
  </div>`;
  $("#genericDialog").showModal();
  $("#saveRefereeEdit").onclick=async()=>{try{
    const password=$("#erPassword").value,tournamentId=$("#erTournament").value||null;
    if(user?.role==="organizer"&&!tournamentId)return toast("Chọn giải cho trọng tài.");
    await API.updateReferee(id,{name:$("#erName").value.trim(),email:$("#erEmail").value.trim(),active:$("#erActive").checked,tournamentId,...(password?{password}:{})});
    $("#genericDialog").close();await render();toast(password?"Đã cập nhật và reset mật khẩu.":"Đã cập nhật trọng tài.");
  }catch(e){toast("Không thể cập nhật: "+e.message)}};
}
function openRefereeModal(){
  const tournaments=state.tournaments||[];
  if(user?.role==="organizer"&&!tournaments.length)return toast("Bạn chưa có giải để tạo trọng tài.");
  $("#genericTitle").textContent="Tạo tài khoản trọng tài";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Tên<input id="rName"></label>
    <label class="field full">Email<input id="rEmail" type="email" autocomplete="off"></label>
    <label class="field full">Giải được giao<select id="rTournament">${user?.role==="super_admin"?'<option value="">Toàn hệ thống</option>':""}${tournaments.map(t=>`<option value="${t.id}">${escHtml(t.name)}</option>`).join("")}</select></label>
    <label class="field full">Mật khẩu tạm (tối thiểu 12 ký tự)<input id="rPassword" type="password" minlength="12" autocomplete="new-password"></label>
    <div class="field full security-note"><b>Quyền trọng tài</b><span>Chỉ nhập điểm trận được phân công và cập nhật thông tin cơ bản VĐV của các trận đó.</span></div>
    <div class="field full"><button type="button" class="btn primary" id="saveReferee">Tạo tài khoản</button></div>
  </div>`;
  $("#genericDialog").showModal();$("#saveReferee").onclick=async()=>{try{
    const tournamentId=$("#rTournament").value||null;if(user?.role==="organizer"&&!tournamentId)return toast("Chọn giải cho trọng tài.");
    await API.createReferee({name:$("#rName").value,email:$("#rEmail").value,password:$("#rPassword").value,tournamentId});
    $("#genericDialog").close();await render();toast("Đã tạo trọng tài.");
  }catch(e){toast(["PASSWORD_TOO_SHORT","PASSWORD_POLICY"].includes(e.message)?"Mật khẩu phải từ 12–64 ký tự.":e.message==="INVALID_EMAIL"?"Email không hợp lệ.":"Không thể tạo: "+e.message)}};
}
async function openUserModal(){
  const isOrganizer=user?.role==="organizer";
  const clubs=isOrganizer?[]:await API.clubs().catch(()=>[]);
  const tournaments=state.tournaments||[];
  if(isOrganizer&&!tournaments.length)return toast("Bạn chưa có giải để tạo trọng tài.");
  $("#genericTitle").textContent=isOrganizer?"Tạo trọng tài":"Tạo tài khoản con";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Tên hiển thị<input id="uName" autocomplete="off"></label>
    <label class="field full">Email đăng nhập<input id="uEmail" type="email" autocomplete="off"></label>
    <label class="field full">Vai trò<select id="uRole" ${isOrganizer?"disabled":""}>${isOrganizer?'<option value="referee">Trọng tài</option>':'<option value="organizer">Chủ giải</option><option value="referee">Trọng tài</option><option value="club_manager">Quản lý CLB</option><option value="finance">Thu ngân</option>'}</select></label>
    <label class="field full" id="uTournamentWrap">Giải được gán<select id="uTournament"><option value="">${isOrganizer?"Chọn giải":"Không giới hạn / tự sở hữu"}</option>${tournaments.map(t=>`<option value="${t.id}">${escHtml(t.name)}</option>`).join("")}</select></label>
    <label class="field full" id="uClubWrap" hidden>CLB được quản lý<select id="uClub"><option value="">Chọn CLB</option>${clubs.map(x=>`<option value="${x.id}">${escHtml(x.name)}</option>`).join("")}</select></label>
    <label class="field full">Mật khẩu tạm (tối thiểu 12 ký tự)<input id="uPassword" type="password" minlength="12" autocomplete="new-password"></label>
    <div class="field full security-note"><b>Phân quyền được kiểm tra ở server</b><span>Chủ giải chỉ quản lý giải thuộc phạm vi của mình. Trọng tài chỉ thấy trận được phân công. Không thể tự nâng quyền.</span></div>
    <div class="field full"><button type="button" class="btn primary" id="saveUser">Tạo tài khoản</button></div>
  </div>`;
  $("#genericDialog").showModal();
  const syncRole=()=>{const r=$("#uRole").value;$("#uClubWrap").hidden=![ "club_manager","finance" ].includes(r);$("#uTournamentWrap").hidden=![ "organizer","referee" ].includes(r);};$("#uRole").onchange=syncRole;syncRole();
  $("#saveUser").onclick=async()=>{try{
    const role=$("#uRole").value,tournamentId=["organizer","referee"].includes(role)?($("#uTournament").value||null):null;
    if(isOrganizer&&!tournamentId)return toast("Chọn giải cho trọng tài.");
    await API.createUser({name:$("#uName").value.trim(),email:$("#uEmail").value.trim(),role,clubId:["club_manager","finance"].includes(role)?($("#uClub").value||null):null,tournamentId,password:$("#uPassword").value});
    $("#genericDialog").close();await render();toast(isOrganizer?"Đã tạo trọng tài.":"Đã tạo tài khoản con.");
  }catch(e){toast({PASSWORD_TOO_SHORT:"Mật khẩu phải từ 12–64 ký tự.",PASSWORD_POLICY:"Mật khẩu phải từ 12–64 ký tự.",INVALID_EMAIL:"Email không hợp lệ.",NAME_TOO_LONG:"Tên hiển thị quá dài.",EMAIL_EXISTS:"Email đã được sử dụng.",INVALID_CHILD_ROLE:"Vai trò không hợp lệ.",CLUB_REQUIRED:"Quản lý CLB phải được gán một CLB.",TOURNAMENT_REQUIRED:"Hãy chọn giải.",TOURNAMENT_SCOPE_FORBIDDEN:"Bạn không có quyền trên giải này.",INVALID_TOURNAMENT:"Giải không hợp lệ."}[e.message]||"Không thể tạo: "+e.message)}};
}
async function openEditUserModal(id){
  const isOrganizer=user?.role==="organizer";
  const [rows,clubs]=await Promise.all([API.users().catch(()=>[]),isOrganizer?Promise.resolve([]):API.clubs().catch(()=>[])]);
  const r=rows.find(x=>x.id===id);if(!r||r.role==="super_admin"||(isOrganizer&&r.role!=="referee"))return;
  const tournaments=state.tournaments||[];
  $("#genericTitle").textContent=isOrganizer?"Sửa tài khoản trọng tài":"Sửa tài khoản con";
  $("#genericBody").innerHTML=`<div class="form-grid">
    <label class="field full">Tên hiển thị<input id="euName" value="${escHtml(r.display_name||"")}"></label>
    <label class="field full">Email<input id="euEmail" type="email" value="${escHtml(r.email||"")}"></label>
    <label class="field full">Vai trò<select id="euRole" ${isOrganizer?"disabled":""}>${isOrganizer?'<option value="referee">Trọng tài</option>':`<option value="organizer" ${r.role==="organizer"?"selected":""}>Chủ giải</option><option value="referee" ${r.role==="referee"?"selected":""}>Trọng tài</option><option value="club_manager" ${r.role==="club_manager"?"selected":""}>Quản lý CLB</option><option value="finance" ${r.role==="finance"?"selected":""}>Thu ngân</option>`}</select></label>
    <label class="field full" id="euTournamentWrap">Giải được gán<select id="euTournament"><option value="">${isOrganizer?"Chọn giải":"Không giới hạn / tự sở hữu"}</option>${tournaments.map(t=>`<option value="${t.id}" ${t.id===r.tournament_id_scope?"selected":""}>${escHtml(t.name)}</option>`).join("")}</select></label>
    <label class="field full" id="euClubWrap">CLB được quản lý<select id="euClub"><option value="">Chọn CLB</option>${clubs.map(x=>`<option value="${x.id}" ${x.id===r.club_id?"selected":""}>${escHtml(x.name)}</option>`).join("")}</select></label>
    <label class="field full">Mật khẩu mới <small>(để trống nếu không reset)</small><input id="euPassword" type="password" minlength="12" autocomplete="new-password"></label>
    <label class="field full"><span><input id="euActive" type="checkbox" ${r.active?"checked":""}> Cho phép đăng nhập</span></label>
    <div class="field full"><button type="button" class="btn primary" id="saveUserEdit">Lưu tài khoản</button></div>
  </div>`;
  $("#genericDialog").showModal();
  const syncRole=()=>{const role=$("#euRole").value;$("#euClubWrap").hidden=![ "club_manager","finance" ].includes(role);$("#euTournamentWrap").hidden=![ "organizer","referee" ].includes(role);};$("#euRole").onchange=syncRole;syncRole();
  $("#saveUserEdit").onclick=async()=>{try{
    const password=$("#euPassword").value,role=$("#euRole").value,tournamentId=["organizer","referee"].includes(role)?($("#euTournament").value||null):null;
    if(isOrganizer&&!tournamentId)return toast("Chọn giải cho trọng tài.");
    await API.updateUser(id,{name:$("#euName").value.trim(),email:$("#euEmail").value.trim(),role,clubId:["club_manager","finance"].includes(role)?($("#euClub").value||null):null,tournamentId,active:$("#euActive").checked,...(password?{password}:{})});
    $("#genericDialog").close();await render();toast(password?"Đã lưu và reset mật khẩu.":"Đã cập nhật phân quyền.");
  }catch(e){toast({PASSWORD_TOO_SHORT:"Mật khẩu phải từ 12 ký tự.",EMAIL_EXISTS:"Email đã được sử dụng.",OWNER_ACCOUNT_PROTECTED:"Không thể chỉnh tài khoản chủ.",CLUB_REQUIRED:"Quản lý CLB phải được gán một CLB.",TOURNAMENT_SCOPE_FORBIDDEN:"Bạn không có quyền trên giải này.",ORGANIZER_CAN_ONLY_EDIT_REFEREE:"Chủ giải chỉ được quản lý tài khoản trọng tài.",INVALID_CLUB:"CLB không hợp lệ."}[e.message]||"Không thể cập nhật: "+e.message)}};
}
document.addEventListener("click",e=>{
  const score=e.target.closest("[data-score]");if(score&&activeMatch)return scorePoint(score.dataset.score,Number(score.dataset.delta));
  const rally=e.target.closest("[data-rally]");if(rally&&activeMatch)return rallyPoint(rally.dataset.rally);
  const service=e.target.closest("[data-service-side]");if(service&&activeMatch)return setService(service.dataset.serviceSide,service.dataset.serverNumber);
  const timeout=e.target.closest("[data-timeout-side]");if(timeout&&activeMatch)return useTimeout(timeout.dataset.timeoutSide,timeout.dataset.timeoutKind);
});
$("#finishSet").onclick=finishSet;$("#finishMatch").onclick=finishMatch;$("#undoScore").onclick=undoScore;
$("#saveQuickScore")?.addEventListener("click",saveQuickScore);
$("#mobileMenu").onclick=()=>$("#sidebar").classList.toggle("open");
$("#changePasswordBtn")?.addEventListener("click",openPasswordModal);
$("#quickTournament").onclick=()=>canManage()?openTournamentModal():toast("Bạn không có quyền tạo giải.");
$("#logoutBtn").onclick=async()=>{await API.logout().catch(()=>{});location.href="login.html"};

(async function boot(){
  try{
    const me=await API.me();user=me.user;$("#userName").textContent=user.name;$("#userRole").textContent=roleLabel(user.role);$("#quickTournament").hidden=!canManage();
    if(user.role==="referee")page="scores";
    if(user.role==="finance")page="payments";
    state=await API.adminState();await render();
    const socket=window.io?io():null;
    if(socket){
      socket.on("public:state",async()=>{if(!busy)await refresh({keepDialog:true})});
      socket.on("match:update",async()=>{if(!busy)await refresh({keepDialog:true})});
    }
  }catch(e){console.error(e);if(e?.status===401||e?.message==="AUTH_REQUIRED")location.href="login.html"}
})();
