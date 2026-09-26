let state={tournaments:[],divisions:[],teams:[],matches:[],audit:[]};
let players=[],posts=[],sponsors=[],branding={};
const $=s=>document.querySelector(s);
const isPreview=location.pathname.includes("/preview/");
const link=p=>isPreview?p.replace(/^\//,""):p;
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const initials=name=>(name||"P").trim().split(/\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase();
const team=id=>state.teams.find(t=>t.id===id)?.name||(id==="TBD"||!id?"Chưa xác định":id);
const score=(m,side)=>m.current?.[side==="a"?0:1]??0;
const badge=s=>s==="live"?'<span class="badge live">LIVE</span>':s==="done"?'<span class="badge done">KẾT THÚC</span>':s==="open"?'<span class="badge blue">ĐANG MỞ</span>':'<span class="badge wait">SẮP DIỄN RA</span>';
const avatar=(p,cls="top-player-avatar")=>p.avatar_url?'<img class="'+cls+'" src="'+esc(p.avatar_url)+'" alt="'+esc(p.full_name)+'">':'<span class="'+cls+' avatar-fallback">'+esc(initials(p.full_name))+'</span>';

function liveCard(m){
  return '<article class="app-live-card" data-search="'+esc([m.stage,team(m.a),team(m.b),m.court].join(" "))+'">'+
    '<div class="app-live-meta"><span><i></i> '+esc(m.stage||"Trận đấu")+'</span><small>Sân '+esc(m.court)+' • '+esc(m.time)+'</small></div>'+
    '<div class="app-live-team"><b>'+esc(team(m.a))+'</b><strong>'+score(m,"a")+'</strong></div>'+
    '<div class="app-live-team"><b>'+esc(team(m.b))+'</b><strong>'+score(m,"b")+'</strong></div>'+
  '</article>';
}
function renderFeatured(){
  const el=$("#featuredTournament");if(!el)return;
  const t=state.tournaments.find(x=>x.status==="live")||state.tournaments.find(x=>x.status==="open")||state.tournaments[0];
  if(!t){
    el.innerHTML='<div class="featured-empty"><span>🏆</span><div><b>Chưa có giải nổi bật</b><small>Khi BTC mở giải, thông tin sẽ xuất hiện tại đây.</small></div></div>';return;
  }
  el.innerHTML='<a href="'+link('/tournament.html?id='+encodeURIComponent(t.id))+'" class="featured-event-card" data-search="'+esc([t.name,t.venue,t.format].join(" "))+'">'+
    '<div class="featured-event-top"><span>'+badge(t.status)+'</span><small>GIẢI ĐẤU NỔI BẬT</small></div>'+
    '<div class="featured-event-copy"><h1>'+esc(t.name)+'</h1><p>'+esc(t.venue||"Chưa cập nhật địa điểm")+'</p></div>'+
    '<div class="featured-event-foot"><span>📅 '+esc(t.date||"Chưa cập nhật")+'</span><span>👥 '+esc(t.teams??0)+' đội/cặp</span><b>Xem chi tiết →</b></div>'+
  '</a>';
}
function renderCore(){
  const live=state.matches.filter(m=>m.status==="live");
  const liveCount=$("#liveCount");if(liveCount)liveCount.textContent=live.length+" trận";
  const hero=$("#heroLive");if(hero)hero.innerHTML=live.slice(0,3).map(liveCard).join("")||'<div class="app-empty-card"><span>⚡</span><b>Chưa có trận live</b><small>Tỷ số sẽ xuất hiện khi trọng tài bắt đầu trận.</small></div>';

  const tours=$("#publicTours");
  if(tours)tours.innerHTML=state.tournaments.map(t=>
    '<a class="event-list-card" data-search="'+esc([t.name,t.venue,t.format].join(" "))+'" href="'+link('/tournament.html?id='+encodeURIComponent(t.id))+'">'+
      '<div class="event-list-icon">🏆</div><div class="event-list-copy"><div>'+badge(t.status)+'<small>'+esc(t.date||"")+'</small></div><h3>'+esc(t.name)+'</h3><p>'+esc(t.venue||"Chưa cập nhật địa điểm")+'</p></div><span class="event-list-arrow">›</span>'+
    '</a>'
  ).join("")||'<div class="app-empty-card"><span>🏆</span><b>Chưa có giải công khai</b><small>Giải mới sẽ hiển thị tại đây.</small></div>';

  const matches=$("#publicMatches");
  if(matches)matches.innerHTML=state.matches.filter(m=>m.status!=="done").slice(0,12).map(m=>
    '<article class="public-match" data-search="'+esc([m.stage,team(m.a),team(m.b),m.court].join(" "))+'"><div class="public-match-top"><span>'+esc(m.stage)+' • '+esc(m.time)+' • Sân '+esc(m.court)+'</span>'+badge(m.status)+'</div>'+
      '<div class="public-team-row"><b>'+esc(team(m.a))+'</b><b>'+(m.status==="live"?score(m,"a"):"—")+'</b></div>'+
      '<div class="public-team-row"><b>'+esc(team(m.b))+'</b><b>'+(m.status==="live"?score(m,"b"):"—")+'</b></div></article>'
  ).join("")||'<div class="app-empty-card"><span>🏓</span><b>Chưa có trận sắp diễn ra</b><small>Lịch thi đấu sẽ được cập nhật từ BTC.</small></div>';

  const standings=$("#publicStandings");
  if(standings){
    const groups=[...new Set(state.teams.map(t=>t.group).filter(Boolean))];
    standings.innerHTML=groups.map(g=>{
      const rows=state.teams.filter(t=>t.group===g).sort((a,b)=>b.w-a.w||((b.pf-b.pa)-(a.pf-a.pa))||b.pf-a.pf);
      return '<div class="public-standings"><div class="panel-head"><div><span class="eyebrow">BẢNG '+esc(g)+'</span><h2>Xếp hạng</h2></div><span class="badge blue">TOP 2</span></div>'+
        '<div class="standing-row head"><span>#</span><span>Đội</span><span>W</span><span>L</span><span>PF</span><span>PA</span><span>+/-</span></div>'+
        rows.map((t,i)=>'<div class="standing-row" data-search="'+esc([t.name,t.club].join(" "))+'"><b>'+(i+1)+'</b><span><b>'+esc(t.name)+'</b><small class="muted-block">'+esc(t.club)+'</small></span><span>'+t.w+'</span><span>'+t.l+'</span><span>'+t.pf+'</span><span>'+t.pa+'</span><b>'+((t.pf-t.pa)>0?"+":"")+(t.pf-t.pa)+'</b></div>').join("")+'</div>';
    }).join("")||'<div class="app-empty-card"><span>📊</span><b>Chưa có bảng xếp hạng</b><small>Kết quả thi đấu sẽ tự cập nhật.</small></div>';
  }

  const bracket=$("#publicBracket");
  if(bracket){
    const html=window.PickleBracket?.render(state.matches,team,{admin:false})||'<div class="app-empty-card"><span>🏆</span><b>Chưa có bracket</b><small>Bracket sẽ xuất hiện khi BTC khởi tạo vòng loại trực tiếp.</small></div>';
    const champ=window.PickleBracket?.champion(state.matches,team);
    const hasChampion=champ&&champ!=="Chưa xác định";
    bracket.innerHTML=html+(hasChampion?'<div class="public-champion"><span>CHAMPION</span><strong>'+esc(champ)+'</strong></div>':"");
  }
  renderFeatured();
}
function renderPlayers(){
  const el=$("#publicTopPlayers");if(!el)return;
  const top=[...players].filter(p=>p.active!==false).sort((a,b)=>Number(b.rating||0)-Number(a.rating||0)).slice(0,8);
  el.innerHTML=top.map((p,i)=>
    '<a class="connect-player-card" data-search="'+esc([p.full_name,p.club_name,p.nickname].join(" "))+'" href="'+link('/player.html?id='+encodeURIComponent(p.id))+'">'+
      '<div class="connect-rank">'+(i+1)+'</div>'+avatar(p,"connect-avatar")+
      '<div class="connect-copy"><b>'+esc(p.full_name)+'</b><small>'+esc(p.club_name||"Tự do")+'</small><span>Rating '+Number(p.rating||0).toFixed(3)+'</span></div><div class="connect-action">Xem</div>'+
    '</a>'
  ).join("")||'<div class="app-empty-card"><span>👥</span><b>Chưa có hồ sơ người chơi</b><small>Người chơi được BTC công khai sẽ xuất hiện tại đây.</small></div>';
}
function renderPosts(){
  const el=$("#publicNews");if(!el)return;
  el.innerHTML=posts.slice(0,8).map(p=>
    '<article class="community-post-card" data-search="'+esc([p.title,p.excerpt].join(" "))+'">'+
      '<div class="community-post-head"><div class="post-author-avatar">P</div><div><b>'+esc(branding.name||"Pickle Tour")+'</b><small>'+(p.published_at?new Date(p.published_at).toLocaleDateString("vi-VN"):"")+'</small></div><span>•••</span></div>'+
      '<h3>'+esc(p.title)+'</h3><p>'+esc(p.excerpt||"")+'</p>'+
      (p.cover_url?'<img class="community-post-image" src="'+esc(p.cover_url)+'" alt="'+esc(p.title)+'">':"")+
      '<div class="community-post-foot"><span>♡ Quan tâm</span><span>💬 Thảo luận</span><span>↗ Chia sẻ</span></div>'+
    '</article>'
  ).join("")||'<div class="app-empty-card"><span>💬</span><b>Chưa có bài viết cộng đồng</b><small>Bài từ BTC/CLB sẽ hiển thị tại đây.</small></div>';
}
function renderSponsors(){
  const el=$("#publicSponsors");if(!el)return;
  el.innerHTML=sponsors.map(s=>'<a class="public-sponsor" href="'+esc(s.website_url||"#")+'" '+(s.website_url?'target="_blank" rel="noopener"':"")+'>'+(s.logo_url?'<img src="'+esc(s.logo_url)+'" alt="'+esc(s.name)+'">':'<b>'+esc(s.name)+'</b>')+'<span>'+esc(s.tier||"Partner")+'</span></a>').join("")||'<span class="sponsor-empty">Chưa có đối tác công khai.</span>';
}
function applyBranding(){
  if(branding.primaryColor)document.documentElement.style.setProperty("--brand",branding.primaryColor);
  if(branding.accentColor)document.documentElement.style.setProperty("--acid",branding.accentColor);
  document.querySelectorAll(".public-brand b").forEach(el=>{if(branding.name)el.textContent=branding.name});
}
function bindSearch(){
  const input=$("#appSearch");if(!input||input.dataset.bound)return;input.dataset.bound="1";
  input.addEventListener("input",()=>{
    const q=input.value.trim().toLocaleLowerCase("vi");
    document.querySelectorAll("[data-search]").forEach(el=>{
      const hit=!q||(el.dataset.search||"").toLocaleLowerCase("vi").includes(q);
      el.hidden=!hit;
    });
  });
}
async function load(){
  try{
    [state,players,posts,sponsors,branding]=await Promise.all([
      PickleAPI.publicState(),
      PickleAPI.publicPlayers().catch(()=>[]),
      PickleAPI.publicPosts().catch(()=>[]),
      PickleAPI.publicSponsors().catch(()=>[]),
      PickleAPI.publicBranding().catch(()=>({}))
    ]);
    applyBranding();renderCore();renderPlayers();renderPosts();renderSponsors();bindSearch();
  }catch(e){console.error(e)}
}
load();
if(window.io){const socket=io();socket.on("public:state",s=>{state=s;renderCore()})}