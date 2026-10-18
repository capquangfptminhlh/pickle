let state={tournaments:[],divisions:[],teams:[],matches:[],audit:[]};
let players=[],posts=[],sponsors=[],branding={};
const enteredPublicCards=new Set();
const $=s=>document.querySelector(s);
const isPreview=location.pathname.includes("/preview/");
const href=p=>p.replace(/^\//,"");
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const initials=name=>(name||"P").trim().split(/\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase();
const team=id=>state.teams.find(t=>t.id===id)?.name||(id==="TBD"||!id?"Chưa xác định":id);
const score=(m,side)=>m.current?.[side==="a"?0:1]??0;
const badge=s=>s==="live"?'<span class="badge live">LIVE</span>':s==="done"?'<span class="badge done">KẾT THÚC</span>':s==="open"?'<span class="badge blue">ĐANG MỞ</span>':'<span class="badge wait">SẮP ĐẤU</span>';
const avatar=(p,cls="top-player-avatar")=>p.avatar_url?'<img class="'+cls+'" src="'+esc(p.avatar_url)+'" alt="'+esc(p.full_name)+' loading="lazy" decoding="async">':'<span class="'+cls+' avatar-fallback">'+esc(initials(p.full_name))+'</span>';
const fmtRating=v=>{const n=Number(v||0),r=Math.round(n*100)/100;return r%1===0?r.toFixed(1):r.toString()};
// Hide a whole homepage section while it has nothing to show; inline !important
// beats the layered public stylesheets that force display on sections.
const showSection=(sel,on)=>{const el=$(sel);if(!el)return;el.hidden=!on;if(on)el.style.removeProperty("display");else el.style.setProperty("display","none","important")};
function animateNewCards(root=document){const fresh=[];for(const el of root.querySelectorAll("[data-motion-key]")){const key=el.dataset.motionKey;el.dataset.motionReady="1";el.dataset.motionEntered="1";if(!key||enteredPublicCards.has(key))continue;enteredPublicCards.add(key);fresh.push(el)}if(fresh.length)window.PickleMotion?.entrance?.(fresh,{key:"public-cards-"+fresh.map(el=>el.dataset.motionKey).join("|")})}
const VN_TZ="Asia/Ho_Chi_Minh";
const dayKey=d=>d.toLocaleDateString("en-CA",{timeZone:VN_TZ});
// Soonest tournament that has not started yet (or starts today).
function nextTournament(){
 const today=dayKey(new Date());
 return state.tournaments.filter(t=>t.startAt&&!["completed","cancelled"].includes(t.status)&&dayKey(new Date(t.startAt))>=today)
   .sort((a,b)=>new Date(a.startAt)-new Date(b.startAt))[0]||null;
}
function countdownText(t){
 const start=new Date(t.startAt),days=Math.round((new Date(dayKey(start))-new Date(dayKey(new Date())))/86400000);
 const when=start.toLocaleDateString("vi-VN",{weekday:"short",day:"2-digit",month:"2-digit",timeZone:VN_TZ})+" • "+start.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:VN_TZ});
 return {when,left:days<=0?"Hôm nay":days===1?"Ngày mai":"Còn "+days+" ngày"};
}
function liveCard(m){return '<div class="hero-score"><div class="hero-score-meta"><span>'+esc(window.PickleBracket?.stageLabel(m)||m.stage||"Trận đấu")+'</span><span>Sân '+esc(m.court)+' • '+esc(m.time)+'</span></div><div class="line"><strong>'+esc(team(m.a))+'</strong><span class="points">'+score(m,"a")+'</span></div><div class="line"><strong>'+esc(team(m.b))+'</strong><span class="points">'+score(m,"b")+'</span></div></div>'}
function renderCore(){
 const live=state.matches.filter(m=>m.status==="live");
 if($("#liveCount"))$("#liveCount").textContent=live.length+" trận";
 if($("#mobileLiveCount"))$("#mobileLiveCount").textContent=live.length; if($("#mobileTournamentCount"))$("#mobileTournamentCount").textContent=state.tournaments.length; if($("#mobilePlayerCount"))$("#mobilePlayerCount").textContent=players.filter(p=>p.active!==false).length; if($("#desktopLiveCount"))$("#desktopLiveCount").textContent=live.length; if($("#desktopTournamentCount"))$("#desktopTournamentCount").textContent=state.tournaments.length; const ft=state.tournaments.find(t=>t.isFeatured)||state.tournaments.find(t=>t.status==="live")||state.tournaments.find(t=>t.status==="open")||state.tournaments[0]; if($("#desktopFeaturedName"))$("#desktopFeaturedName").textContent=ft?.name||"Chưa có giải đang mở";
 const badgeEl=$("#desktopLiveBadge");if(badgeEl){badgeEl.hidden=!live.length;if(live.length)badgeEl.style.removeProperty("display");else badgeEl.style.setProperty("display","none","important")}
 const next=nextTournament(),nextUp=$("#mobileNextUp");
 if(nextUp){const show=!live.length&&next;nextUp.hidden=!show;if(show){const c=countdownText(next);nextUp.href=href('/tournament.html?id='+encodeURIComponent(next.id));nextUp.innerHTML='<small>Giải sắp tới • '+esc(c.left)+'</small><b>'+esc(next.name)+'</b><span>'+esc(c.when)+'</span>'}}
 if($("#heroLive"))$("#heroLive").innerHTML=live.slice(0,2).map(liveCard).join("")||'<div class="hero-score empty-live"><b>Chưa có trận live</b><span>Live Center sẽ cập nhật khi trận bắt đầu.</span></div>';
 if($("#publicTours"))$("#publicTours").innerHTML=state.tournaments.map(t=>{const featTag=t.isFeatured?`<span class="tour-card-feature ${t.sponsorPackage==='top_sponsor'?'gold':''}">${t.sponsorPackage==='top_sponsor'?'ĐỈNH BẢNG':'NỔI BẬT'}</span>`:"";const ps=window.PickleAPI?.posterSources?.(t.posterUrl)||{src:t.posterUrl,srcset:""};const poster=t.posterUrl?'<img class="tour-poster-image" src="'+esc(ps.src)+'"'+(ps.srcset?' srcset="'+esc(ps.srcset)+'" sizes="(max-width:760px) 128px, (max-width:1100px) 240px, 280px"':'')+' alt="Banner '+esc(t.name)+'" loading="lazy" decoding="async">':"";const theme=/chị đẹp|xé túi|20\/10/i.test(t.name||"")?"tour-pink":/bình lợi|pickleup tour/i.test(t.name||"")?"tour-blue":"tour-green";const start=t.startAt?new Date(t.startAt):null;const time=start&&!Number.isNaN(start.getTime())?start.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Ho_Chi_Minh"}):"";return '<a data-motion-key="tournament:'+esc(t.id)+'" class="tour-card '+(t.isFeatured?'is-featured ':'')+theme+'" href="'+href('/tournament.html?id='+encodeURIComponent(t.id))+'" style="text-decoration:none;color:inherit"><div class="tour-media tour-media-real">'+poster+'<div class="tour-pickle-art" aria-hidden="true"><span class="tour-ball"></span><span class="tour-paddle-shape"></span><i></i></div><div class="tour-media-shade"></div><div class="tour-cover"><div><small>TOURNAMENT</small><strong>'+esc(t.format||"Tournament")+'</strong></div></div></div><div class="tour-body"><div class="tour-card-labels">'+featTag+badge(t.status)+'</div><h3>'+esc(t.name)+'</h3><div class="tour-meta-grid tour-meta-premium"><span><small>Ngày</small><b>'+esc(t.date||"Sắp diễn ra")+'</b></span><span><small>Bắt đầu</small><b>'+esc(time||"Đang cập nhật")+'</b></span><span><small>Thể thức</small><b>'+esc(t.format||"Open")+'</b></span></div><div class="tour-venue-line"><span>⌖</span><b>'+esc(t.venue||"Đang cập nhật địa điểm")+'</b></div><div class="tour-card-footer"><span>'+(t.entryFee?'<b>'+esc(t.entryFee)+'</b>':'<b>Xem thông tin giải</b>')+'</span><span class="tour-detail-cta">Xem chi tiết <b>→</b></span></div></div></a>';}).join("")||'<div class="empty">Chưa có giải công khai.</div>';
 if($("#publicMatches"))$("#publicMatches").innerHTML=state.matches.filter(m=>m.status!=="done").slice(0,12).map(m=>'<article data-motion-key="match:'+esc(m.id)+'" class="public-match"><div class="public-match-top"><span>'+esc(m.stage)+' • '+esc(m.time)+' • Sân '+esc(m.court)+'</span>'+badge(m.status)+'</div><div class="public-team-row"><b>'+esc(team(m.a))+'</b><b>'+(m.status==="live"?score(m,"a"):"—")+'</b></div><div class="public-team-row"><b>'+esc(team(m.b))+'</b><b>'+(m.status==="live"?score(m,"b"):"—")+'</b></div></article>').join("")||(next?(()=>{const c=countdownText(next);return '<a class="public-next-up" href="'+href('/tournament.html?id='+encodeURIComponent(next.id))+'"><span class="public-next-up-left">'+esc(c.left)+'</span><span><small>Chưa có trận đang diễn ra • Giải sắp tới</small><b>'+esc(next.name)+'</b><em>'+esc(c.when)+(next.venue?' • '+esc(next.venue):'')+'</em></span><i aria-hidden="true">›</i></a>'})():'<div class="empty">Chưa có trận nào đang diễn ra.</div>');
 function sortGroupTeams(arr){return [...arr].filter(t=>t.status!=="withdrawn").sort((a,b)=>Number(a.standingRank||9999)-Number(b.standingRank||9999)||Number(b.w||0)-Number(a.w||0)||Number(a.seed||9999)-Number(b.seed||9999));}
 const groupEntries=(state.divisions||[]).flatMap(d=>[...new Set(state.teams.filter(t=>t.divisionId===d.id).map(t=>t.group).filter(Boolean))].sort().map(g=>({d,g})));
 showSection("#ranking",groupEntries.length>0);
 if($("#publicStandings"))$("#publicStandings").innerHTML=groupEntries.map(({d,g})=>{const advance=Math.max(1,Number(d.advanceCount||2)),rows=sortGroupTeams(state.teams.filter(t=>t.divisionId===d.id&&t.group===g),state.matches.filter(m=>m.divisionId===d.id));return '<div class="public-standings"><div class="panel-head"><div><span class="eyebrow">'+esc(d.name)+' • BẢNG '+esc(g)+'</span><h2>Xếp hạng Bảng '+esc(g)+'</h2></div><span class="badge blue">TOP '+advance+' ĐI TIẾP</span></div><div class="standing-table-wrap"><div class="standing-row head"><span>#</span><span>Đội / VĐV</span><span>Trận</span><span>Set</span><span>Điểm</span><span>+/-</span><span>Xếp hạng</span></div>'+rows.map((t,i)=>{const qualified=i<advance,rankTag=i===0?'<span class="rank-badge rank-1">🥇 Nhất bảng</span>':i===1?'<span class="rank-badge rank-2">🥈 Nhì bảng</span>':'<span class="rank-badge rank-other">Hạng '+(i+1)+'</span>';const qCls=i===0?'qualify-rank-1':i===1?'qualify-rank-2':'';const diff=t.pf-t.pa;return '<div class="standing-row '+qCls+'"><b>'+(i+1)+'</b><span><b>'+esc(t.name)+'</b><small class="muted-block">'+esc(t.club||"")+'</small></span><span>'+t.w+'-'+t.l+'</span><span>'+(t.sw||0)+'-'+(t.sl||0)+'</span><span>'+t.pf+'-'+t.pa+'</span><b>'+(diff>0?'+':'')+diff+'</b><div>'+rankTag+(qualified?'<small class="qualify-status">Serie A • tạm thời</small>':d.seriesBEnabled&&i===2?'<small class="qualify-status">Serie B • hạng 3 tạm thời</small>':'')+'</div></div>';}).join("")+'</div></div>'}).join("")||'<div class="empty">Chưa có bảng xếp hạng.</div>';
 const hasBracket=state.matches.some(m=>m.bracketSlot||/bán kết|chung kết|tứ kết/i.test(m.stage||""));showSection("#bracket",hasBracket);
 if($("#publicBracket")&&hasBracket){const html=window.PickleBracket?.render(state.matches,team,{admin:false,showChampions:true,divisionNames:Object.fromEntries(state.divisions.map(d=>[d.id,d.name]))})||"";const champ=null;$("#publicBracket").innerHTML=html+(champ&&champ!=="Chưa xác định"?'<div class="public-champion"><span>VÔ ĐỊCH</span><strong>'+esc(champ)+'</strong></div>':"")}
 animateNewCards($("#publicTours")||document);animateNewCards($("#publicMatches")||document);
}
function renderPlayers(){if($("#desktopPlayerCount"))$("#desktopPlayerCount").textContent=players.filter(p=>p.active!==false).length;const el=$("#publicTopPlayers");if(!el)return;const all=[...players].filter(p=>p.active!==false).sort((a,b)=>Number(b.rating||0)-Number(a.rating||0)),top=all.slice(0,6);const rank=p=>1+all.filter(x=>Number(x.rating||0)>Number(p.rating||0)).length;el.innerHTML=top.map(p=>'<a data-motion-key="player:'+esc(p.id)+'" class="top-player-card" href="'+href('/player.html?id='+encodeURIComponent(p.id))+'"><div class="top-player-rank">'+String(rank(p)).padStart(2,"0")+'</div>'+avatar(p)+'<div class="top-player-copy"><b>'+esc(p.full_name)+'</b><span>'+esc(p.club_name||"Tự do")+(p.skillLevel?' • Trình '+esc(p.skillLevel):'')+'</span></div><strong>'+fmtRating(p.rating)+'</strong></a>').join("")||'<div class="empty">Chưa có dữ liệu rating.</div>';animateNewCards(el)}
function renderPosts(){if($("#desktopPostCount"))$("#desktopPostCount").textContent=posts.length;const el=$("#publicNews");if(!el)return;el.innerHTML=posts.slice(0,6).map(p=>'<article class="news-card"><div class="news-card-body"><span class="eyebrow">TIN MỚI</span><h3>'+esc(p.title)+'</h3><p>'+esc(p.excerpt||"")+'</p><small>'+(p.published_at?new Date(p.published_at).toLocaleDateString("vi-VN"):"")+'</small></div></article>').join("")||'<div class="empty">BTC chưa đăng tin. Thông báo giải sẽ xuất hiện tại đây.</div>'}
function renderSponsors(){const el=$("#publicSponsors");if(!el)return;showSection("#sponsors",sponsors.length>0);el.innerHTML=sponsors.map(s=>'<a class="public-sponsor" href="'+esc(s.website_url||"#")+'" '+(s.website_url?'target="_blank" rel="noopener noreferrer"':"")+'>'+(s.logo_url?'<img src="'+esc(s.logo_url)+'" alt="'+esc(s.name)+'">':'<b>'+esc(s.name)+'</b>')+'<span>'+esc(s.tier||"Partner")+'</span></a>').join("")||'<span class="sponsor-empty">Chưa có sponsor công khai.</span>'}
function applyBranding(){if(branding.primaryColor)document.documentElement.style.setProperty("--brand",branding.primaryColor);if(branding.accentColor)document.documentElement.style.setProperty("--acid",branding.accentColor);const brandName=(!branding.name||branding.name==="Pickle Tour")?"Pickleup.vn":branding.name;document.querySelectorAll(".public-brand b").forEach(el=>{el.textContent=brandName})}
function showRealtimeDraw(payload,done=false){
  
  let el=document.querySelector(".realtime-draw-overlay");
  if(!el){el=document.createElement("div");el.className="realtime-draw-overlay";document.body.appendChild(el)}
  window.__publicGroupDrawAbort?.abort();
  clearTimeout(window.__drawNoticeTimer);
  el.classList.remove("has-reveal");
  const groups=Array.isArray(payload?.groups)?payload.groups:[];
  if(done&&Array.isArray(payload?.assignments)&&payload.assignments.length&&window.PickleDrawReveal){
    const controller=new AbortController();
    window.__publicGroupDrawAbort=controller;
    el.classList.add("has-reveal","show");
    el.innerHTML='<div class="realtime-draw-card draw-reveal-spectator"><div data-reveal-host></div></div>';
    window.PickleDrawReveal.play(el.querySelector("[data-reveal-host]"),payload,{compact:true,signal:controller.signal})
      .then(result=>{
        if(result?.cancelled||controller.signal.aborted)return;
        window.__drawNoticeTimer=setTimeout(()=>{el.classList.remove("show");setTimeout(()=>{if(!controller.signal.aborted)el.remove()},280)},3800);
      }).catch(console.error);
    return;
  }
  el.innerHTML=`<div class="realtime-draw-card ${done?"is-done":""}"><div class="realtime-draw-icon">${done?"✓":"🎡"}</div><span>${done?"KẾT QUẢ BỐC THĂM":"ĐANG BỐC THĂM REALTIME"}</span><h3>${esc(payload?.tournamentName||"Giải đấu")}</h3><p>${done?`${payload.groupCount||groups.length} bảng • Top ${payload.advanceCount||2} đi tiếp`:`${payload.teamCount||0} cặp/đội • ${payload.groupCount||0} bảng`}</p>${done&&groups.length?`<div class="realtime-draw-groups">${groups.map(g=>`<b>Bảng ${esc(g.group)} <small>${g.count} đội</small></b>`).join("")}</div>`:""}</div>`;
  el.classList.add("show");
  if(done)window.__drawNoticeTimer=setTimeout(()=>{el.classList.remove("show");setTimeout(()=>el.remove(),280)},3800);
}
async function load(){try{const [,p,news,partners,brand]=await Promise.all([refreshCore(),PickleAPI.publicPlayers().catch(()=>[]),PickleAPI.publicPosts().catch(()=>[]),PickleAPI.publicSponsors().catch(()=>[]),PickleAPI.publicBranding().catch(()=>({}))]);players=p;posts=news;sponsors=partners;branding=brand;applyBranding();renderCore();renderPlayers();renderPosts();renderSponsors()}catch(e){console.error(e)}}
let coreRefresh=null,coreDirty=false;
function refreshCore(){
  coreDirty=true;
  if(!coreRefresh)coreRefresh=(async()=>{do{coreDirty=false;state=await PickleAPI.publicState();renderCore()}while(coreDirty)})().catch(console.error).finally(()=>{coreRefresh=null});
  return coreRefresh;
}
load();if(window.io){const socket=io();socket.on("public:state",s=>{
  if(Array.isArray(s?.matches)&&Array.isArray(s?.teams)&&Array.isArray(s?.tournaments)){state=s;renderCore();if(coreRefresh)coreDirty=true}
  else refreshCore();
});socket.on("draw:start",p=>showRealtimeDraw(p,false));socket.on("draw:complete",p=>{showRealtimeDraw(p,true);refreshCore()})}
