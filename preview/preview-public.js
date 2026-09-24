let state={tournaments:[],divisions:[],teams:[],matches:[],audit:[]};
let players=[],posts=[],sponsors=[],branding={};
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const initials=name=>(name||"P").split(/\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase();
const team=id=>state.teams.find(t=>t.id===id)?.name||(id==="TBD"||!id?"Chưa xác định":id);
const score=(m,side)=>m.current?.[side==="a"?0:1]??0;
const badge=s=>s==="live"?'<span class="badge live">LIVE</span>':s==="done"?'<span class="badge done">KẾT THÚC</span>':s==="open"?'<span class="badge blue">ĐANG MỞ</span>':'<span class="badge wait">SẮP ĐẤU</span>';
const avatar=(p,cls="top-player-avatar")=>p.avatar_url?'<img class="'+cls+'" src="'+esc(p.avatar_url)+'" alt="'+esc(p.full_name)+'">':'<span class="'+cls+' avatar-fallback">'+esc(initials(p.full_name))+'</span>';

function liveCard(m){
  return '<div class="hero-score"><div class="hero-score-meta"><span>'+esc(m.stage)+'</span><span>Sân '+esc(m.court)+' • '+esc(m.time)+'</span></div>'+
  '<div class="line"><strong>'+esc(team(m.a))+'</strong><span class="points">'+score(m,"a")+'</span></div>'+
  '<div class="line"><strong>'+esc(team(m.b))+'</strong><span class="points">'+score(m,"b")+'</span></div></div>';
}
function renderCore(){
  const live=state.matches.filter(m=>m.status==="live");
  $("#liveCount").textContent=live.length+" trận";
  $("#heroLive").innerHTML=live.slice(0,2).map(liveCard).join("")||'<div class="hero-score empty-live"><b>Chưa có trận live</b><span>Live Center sẽ tự cập nhật khi trọng tài bắt đầu trận.</span></div>';

  $("#publicTours").innerHTML=state.tournaments.map(t=>
    '<a class="tour-card" href="tournament.html?id='+encodeURIComponent(t.id)+'" style="text-decoration:none;color:inherit">'+
      '<div class="tour-cover"><div><small>TOURNAMENT</small><strong>'+esc(t.format||"Tournament")+'</strong></div>'+badge(t.status)+'</div>'+
      '<div class="tour-body"><h3>'+esc(t.name)+'</h3>'+
      '<div class="tour-meta-grid"><span><small>Ngày</small><b>'+esc(t.date)+'</b></span><span><small>Địa điểm</small><b>'+esc(t.venue)+'</b></span><span><small>Đội</small><b>'+esc(t.teams)+'</b></span></div></div></a>'
  ).join("")||'<div class="empty">Chưa có giải công khai.</div>';

  $("#publicMatches").innerHTML=state.matches.filter(m=>m.status!=="done").slice(0,12).map(m=>
    '<article class="public-match"><div class="public-match-top"><span>'+esc(m.stage)+' • '+esc(m.time)+' • Sân '+esc(m.court)+'</span>'+badge(m.status)+'</div>'+
      '<div class="public-team-row"><b>'+esc(team(m.a))+'</b><b>'+(m.status==="live"?score(m,"a"):"—")+'</b></div>'+
      '<div class="public-team-row"><b>'+esc(team(m.b))+'</b><b>'+(m.status==="live"?score(m,"b"):"—")+'</b></div></article>'
  ).join("")||'<div class="empty">Chưa có trận.</div>';

  const groups=[...new Set(state.teams.map(t=>t.group).filter(Boolean))];
  $("#publicStandings").innerHTML=groups.map(g=>{
    const rows=state.teams.filter(t=>t.group===g).sort((a,b)=>b.w-a.w||((b.pf-b.pa)-(a.pf-a.pa))||b.pf-a.pf);
    return '<div class="public-standings"><div class="panel-head"><div><span class="eyebrow">GROUP '+esc(g)+'</span><h2>Bảng '+esc(g)+'</h2></div><span class="badge blue">TOP 2</span></div>'+
      '<div class="standing-row head"><span>#</span><span>Đội</span><span>W</span><span>L</span><span>PF</span><span>PA</span><span>+/-</span></div>'+
      rows.map((t,i)=>'<div class="standing-row"><b>'+(i+1)+'</b><span><b>'+esc(t.name)+'</b><small class="muted-block">'+esc(t.club)+'</small></span><span>'+t.w+'</span><span>'+t.l+'</span><span>'+t.pf+'</span><span>'+t.pa+'</span><b>'+((t.pf-t.pa)>0?"+":"")+(t.pf-t.pa)+'</b></div>').join("")+'</div>';
  }).join("")||'<div class="empty">Chưa có bảng xếp hạng.</div>';

  const semis=state.matches.filter(m=>m.stage.toLowerCase().includes("bán kết"));
  const final=state.matches.find(m=>m.stage.toLowerCase().includes("chung kết"));
  const bm=m=>'<div class="public-bracket-card"><div class="public-bracket-row '+(m.winner===m.a?"win":"")+'"><span>'+esc(team(m.a))+'</span><b>'+(m.sets?.filter(s=>s[0]>s[1]).length||"")+'</b></div><div class="public-bracket-row '+(m.winner===m.b?"win":"")+'"><span>'+esc(team(m.b))+'</span><b>'+(m.sets?.filter(s=>s[1]>s[0]).length||"")+'</b></div></div>';
  $("#publicBracket").innerHTML='<div class="public-bracket"><div class="public-round"><small>BÁN KẾT</small>'+semis.map(bm).join("")+'</div><div class="public-round"><small>CHUNG KẾT</small>'+(final?bm(final):"")+'</div><div class="public-round"><small>VÔ ĐỊCH</small><div class="public-bracket-card champion-card"><div class="champion-mark">01</div><b>'+(final?.winner?esc(team(final.winner)):"Chưa xác định")+'</b></div></div></div>';
}
function renderPlayers(){
  const el=$("#publicTopPlayers");if(!el)return;
  const top=[...players].sort((a,b)=>Number(b.rating||0)-Number(a.rating||0)).slice(0,6);
  el.innerHTML=top.map((p,i)=>
    '<a class="top-player-card" href="player.html?id='+encodeURIComponent(p.id)+'"><div class="top-player-rank">0'+(i+1)+'</div>'+avatar(p)+
    '<div class="top-player-copy"><b>'+esc(p.full_name)+'</b><span>'+esc(p.club_name||"Tự do")+'</span></div><strong>'+Number(p.rating||0).toFixed(3)+'</strong></a>'
  ).join("")||'<div class="empty">Chưa có dữ liệu rating.</div>';
}
function renderPosts(){
  const el=$("#publicNews");if(!el)return;
  el.innerHTML=posts.slice(0,6).map(p=>
    '<article class="news-card"><a href="#" aria-label="'+esc(p.title)+'">'+
    (p.cover_url?'<img src="'+esc(p.cover_url)+'" alt="">':'<div class="news-cover-placeholder"><span>PICKLE TOUR</span></div>')+
    '<div class="news-card-body"><span class="eyebrow">UPDATE</span><h3>'+esc(p.title)+'</h3><p>'+esc(p.excerpt||"")+'</p><small>'+(p.published_at?new Date(p.published_at).toLocaleDateString("vi-VN"):"")+'</small></div></a></article>'
  ).join("")||'<div class="empty">Chưa có tin mới.</div>';
}
function renderSponsors(){
  const el=$("#publicSponsors");if(!el)return;
  el.innerHTML=sponsors.map(s=>'<a class="public-sponsor" href="'+esc(s.website_url||"#")+'" '+(s.website_url?'target="_blank" rel="noopener"':'')+'>'+(s.logo_url?'<img src="'+esc(s.logo_url)+'" alt="'+esc(s.name)+'">':'<b>'+esc(s.name)+'</b>')+'<span>'+esc(s.tier||"Partner")+'</span></a>').join("")||'<span class="sponsor-empty">Chưa có sponsor công khai.</span>';
}
function applyBranding(){
  if(branding.primaryColor)document.documentElement.style.setProperty("--brand",branding.primaryColor);
  if(branding.accentColor)document.documentElement.style.setProperty("--acid",branding.accentColor);
  document.querySelectorAll(".public-brand b").forEach(el=>{if(branding.name)el.textContent=branding.name});
}
async function load(){
  try{
    const data=await Promise.all([
      PickleAPI.publicState(),
      PickleAPI.publicPlayers().catch(()=>[]),
      PickleAPI.publicPosts().catch(()=>[]),
      PickleAPI.publicSponsors().catch(()=>[]),
      PickleAPI.publicBranding().catch(()=>({}))
    ]);
    [state,players,posts,sponsors,branding]=data;
    applyBranding();renderCore();renderPlayers();renderPosts();renderSponsors();
  }catch(e){console.error(e)}
}
load();
if(window.io){const socket=io();socket.on("public:state",s=>{state=s;renderCore()})}