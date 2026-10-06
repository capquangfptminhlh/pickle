function unlockTournamentScroll(){
  document.documentElement.style.height="auto";
  document.documentElement.style.overflowY="auto";
  document.body.classList.remove("app-drawer-open","route-leaving");
  document.body.style.position="static";
  document.body.style.height="auto";
  document.body.style.overflowY="auto";
  document.body.style.touchAction="auto";
}
unlockTournamentScroll();
addEventListener("pageshow",unlockTournamentScroll);
addEventListener("visibilitychange",()=>{if(!document.hidden)unlockTournamentScroll()});
let state=null,sponsors=[],realtimeConnected=false,realtimeRefreshBusy=false;const $=s=>document.querySelector(s);const id=new URLSearchParams(location.search).get("id");
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const team=x=>state?.teams.find(t=>t.id===x)?.name||"Chưa xác định";
const teamPlayers=id=>(state?.teamPlayers?.[id]||[]).map(pid=>state?.players?.find(p=>p.id===pid)).filter(Boolean);
const teamAvatar=id=>teamPlayers(id)[0]?.avatar_url||"";
const initials=n=>(n||"VĐV").trim().split(/\s+/).slice(-2).map(x=>x[0]||"").join("").toUpperCase();
const fmtRating=v=>{const n=Number(v);return Number.isFinite(n)?(Math.round(n*100)/100).toFixed((Math.round(n*100)%100)===0?1:2):"—"};
const athleteChip=p=>{const av=p?.avatar_url?`<img src="${esc(p.avatar_url)}" alt="${esc(p.full_name||"VĐV")}" loading="lazy" class="tour-athlete-avatar">`:`<span class="tour-athlete-avatar tour-athlete-fallback">${esc(initials(p?.full_name))}</span>`;return `<span class="tour-athlete-chip">${av}<span class="tour-athlete-copy"><b>${esc(p?.full_name||"VĐV")}</b><small><strong>${fmtRating(p?.rating)}</strong> điểm</small></span></span>`}
const badge=s=>s==="live"?'<span class="badge live">LIVE</span>':s==="done"?'<span class="badge done">KẾT THÚC</span>':'<span class="badge wait">SẮP ĐẤU</span>';
const statusMeta=s=>({live:["ĐANG DIỄN RA","live"],registration:["ĐANG NHẬN ĐĂNG KÝ","blue"],open:["ĐANG NHẬN ĐĂNG KÝ","blue"],completed:["ĐÃ KẾT THÚC","done"],cancelled:["ĐÃ HỦY","done"]}[s]||["SẮP DIỄN RA","wait"]);\nconst formatLabel=f=>({pool_to_knockout:"Vòng bảng → Loại trực tiếp",round_robin:"Vòng tròn",knockout:"Loại trực tiếp"}[f]||String(f||""));
const safeHttps=s=>{if(!s)return "#";try{const u=new URL(s,location.origin);return u.protocol==="https:"?s:"#"}catch{return "#"}};
function empty(icon,title,copy){return '<div class="app-empty-card"><span>'+icon+'</span><b>'+title+'</b><small>'+copy+'</small></div>'}
function render(){
 if(!state)return;const t=state.tournaments.find(x=>x.id===id);
 if(!t){$("#tourName").textContent="Không tìm thấy giải";$("#tourMeta").textContent="Giải không tồn tại hoặc chưa được công khai.";document.querySelectorAll(".tournament-app-main section:not(.tournament-app-hero),.tournament-tabs").forEach(x=>x.hidden=true);return}
 document.title=t.name+" | Pickle Tour";
 $("#tourName").textContent=t.name;
 $("#tourMeta").textContent=[t.date,t.venue,t.format].filter(Boolean).join(" • ");
 const boardLink=$("#tourBoardLink");if(boardLink)boardLink.href="court-board.html?tournament="+encodeURIComponent(t.id);
 const banner=$("#tourBannerImage"),bannerWrap=document.querySelector(".tournament-event-banner-wrap");
 if(banner&&t.posterUrl){
   banner.src=t.posterUrl;banner.alt="Poster "+t.name;banner.hidden=false;bannerWrap?.classList.add("has-banner");
 }else if(banner){
   banner.removeAttribute("src");banner.hidden=true;bannerWrap?.classList.remove("has-banner");
 }
 const divs=state.divisions.filter(d=>d.tournamentId===t.id),dids=new Set(divs.map(d=>d.id));
 const teams=state.teams.filter(x=>dids.has(x.divisionId)),matches=state.matches.filter(x=>dids.has(x.divisionId));
 const live=matches.filter(m=>m.status==="live"),done=matches.filter(m=>m.status==="done");
 const sm=statusMeta(t.status),status=$("#tourStatus");status.innerHTML='<span class="badge '+sm[1]+'">'+sm[0]+'</span>';
 const fee=t.entryFee||"Liên hệ BTC",phone=String(t.contactPhone||"").trim(),digits=phone.replace(/\D/g,"");
 const register=$("#tourRegisterLink");if(register){register.href=digits?"https://zalo.me/"+digits:"#participants";register.target=digits?"_blank":"";register.rel=digits?"noopener noreferrer":""}
 const contactName=$("#tourContactName"),contactPhone=$("#tourContactPhone"),prize=$("#tourPrizePool");
 if(contactName)contactName.textContent=t.contactName||"BTC giải đấu";if(contactPhone)contactPhone.textContent=phone||"Thông tin liên hệ đang cập nhật";if(prize)prize.textContent=t.prizePool||"Cơ cấu giải thưởng đang cập nhật.";
 const facts=$("#tourEventFacts");if(facts)facts.innerHTML=[
   ["📅","Thời gian",t.date||"Sắp diễn ra"],
   ["🏓","Nội dung",t.format||divs[0]?.name||"Open"],
   ["💳","Lệ phí",fee],
   ["📍","Địa điểm",t.venue||"Đang cập nhật"]
 ].map(([icon,label,value])=>'<article><span>'+icon+'</span><div><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div></article>').join("");
 $("#tourHeroStats").innerHTML=[
   ["Nội dung",divs.length],["Đội / cặp",teams.length],["Trận đấu",matches.length],["Đã xong",done.length]
 ].map(([k,v])=>'<span><b>'+v+'</b><small>'+k+'</small></span>').join("");
 $("#tourLiveCount").textContent=(live.length?"● "+live.length+" LIVE":"0 live")+" • "+(realtimeConnected?"REALTIME":"CÔNG KHAI");$("#tourLiveCount").classList.toggle("is-realtime",realtimeConnected);$("#tourTeamCount").textContent=teams.length+" đội";
 $("#tourDivisions").innerHTML=divs.map(d=>'<article class="tournament-division-card"><div><span>'+esc(d.eventType||"Nội dung")+'</span><h3>'+esc(d.name)+'</h3><p>'+esc(d.format||"")+'</p></div><div class="division-rule-pills"><b>Best of '+esc(d.bestOf)+'</b><b>'+esc(d.pointsToWin)+' điểm</b><b>'+(d.winByTwo?"Cách 2":"Không cách 2")+'</b></div></article>').join("")||empty("🏓","Chưa có nội dung thi đấu","BTC chưa tạo nội dung cho giải này.");
 $("#tourTeams").innerHTML=(()=>{
   const sorted=[...teams].sort((a,b)=>String(a.group||"ZZ").localeCompare(String(b.group||"ZZ"),"vi")||Number(a.seed||999)-Number(b.seed||999)||String(a.name).localeCompare(String(b.name),"vi"));
   const existingGroups=[...new Set(sorted.map(x=>x.group).filter(Boolean))].sort();
   const groupKeys=existingGroups.length?existingGroups:["__ungrouped__"];
   return groupKeys.map((g,gi)=>{
     const rows=g==="__ungrouped__"?sorted.filter(x=>!x.group):sorted.filter(x=>x.group===g);
     const label=g==="__ungrouped__"?"CHƯA CHIA BẢNG":"BẢNG "+esc(g);
     return '<section class="tournament-group-card">'+
       '<div class="tournament-group-head"><div><span>'+label+'</span><small>'+rows.length+' đội / cặp</small></div><b>'+(g==="__ungrouped__"?"—":esc(g))+'</b></div>'+
       '<div class="tournament-group-list">'+rows.map((x,rowIndex)=>{
         const d=divs.find(v=>v.id===x.divisionId),ps=teamPlayers(x.id),avg=ps.length?ps.reduce((s,p)=>s+Number(p.rating||0),0)/ps.length:null;
         const athletes=ps.length?'<div class="tour-athlete-list">'+ps.map(athleteChip).join("")+'</div>':'<small class="tour-no-athlete">Chưa có hồ sơ VĐV/avatar</small>';
         return '<article class="tournament-team-row"><span class="team-seed">'+(x.seed||rowIndex+1)+'</span><div class="tour-team-main"><div class="tour-team-title"><b>'+esc(x.name)+'</b>'+(avg!==null?'<span>TB '+fmtRating(avg)+'</span>':'')+'</div><small class="tour-team-meta">'+esc(x.club||"Tự do")+' • '+esc(d?.name||"")+'</small>'+athletes+'</div></article>';
       }).join("")+'</div></section>';
   }).join("");
 })()||empty("👥","Chưa có đội / cặp tham dự","Danh sách sẽ xuất hiện khi BTC thêm đội."); const queueRank=m=>m.status==="live"?0:m.courtState==="warming_up"?1:m.courtState==="on_deck"?2:m.courtState==="called"?3:m.status==="wait"?4:5; const ordered=[...matches].sort((a,b)=>queueRank(a)-queueRank(b)||String(a.time).localeCompare(String(b.time)));
 const courtDefs=(state.courts||[]).filter(c=>c.tournamentId===t.id&&c.active!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
 const courtKeys=[...new Set([
   ...courtDefs.map(c=>String(c.sortOrder||c.name?.replace(/\D+/g,"")||c.name||"—")),
   ...ordered.map(m=>String(m.court??"—"))
 ])].sort((a,b)=>Number(a)-Number(b)||a.localeCompare(b,"vi"));
 const scoreOf=(m,side)=>m.status==="live"?(m.current?.[side]??0):(m.status==="done"||m.status==="completed"?(m.sets||[]).filter(s=>side===0?s[0]>s[1]:s[1]>s[0]).length:"—");
 const courtTeamRow=(m,side)=>{
   const tid=side===0?m.a:m.b,av=teamAvatar(tid),name=team(tid),score=scoreOf(m,side);
   return '<div class="court-team-row">'+(av?'<img src="'+esc(av)+'" alt="" loading="lazy">':'<span class="court-team-avatar">'+esc(initials(name))+'</span>')+'<b>'+esc(name)+'</b><strong>'+esc(score)+'</strong></div>';
 };
 $("#tourMatches").innerHTML=courtKeys.length?'<div class="court-board-grid">'+courtKeys.map((court,ci)=>{
   const rows=ordered.filter(m=>String(m.court??"—")===court);
   const liveCount=rows.filter(m=>m.status==="live").length;
   const cards=rows.map((m,mi)=>{
     const statusClass=m.status==="live"?"is-live":(m.status==="done"||m.status==="completed"?"is-done":"is-wait");
     const queueText=m.status==="live"?'<span class="live-dot"></span> Đang diễn ra':m.status==="done"||m.status==="completed"?'✓ Đã kết thúc':m.courtState==="warming_up"?'🔥 Đang khởi động':m.courtState==="on_deck"?'⏭ On deck':m.courtState==="called"?'📣 Đang gọi VĐV':'◷ Sắp diễn ra';
     return '<article class="court-match-card '+statusClass+'" style="--match-delay:'+((ci*90)+(mi*45))+'ms"><div class="court-match-meta"><span><b>'+esc(m.time||"--:--")+'</b> • '+esc(m.stage||"Trận đấu")+'</span>'+badge(m.status)+'</div>'+courtTeamRow(m,0)+courtTeamRow(m,1)+'<footer>'+queueText+'</footer></article>';
   }).join("");
   const empty='<div class="court-empty-slot"><span>🏟</span><b>Sân đang trống</b><small>Chưa có trận được xếp</small></div>';
   return '<section class="court-board court-tone-'+((ci%4)+1)+'" style="--court-delay:'+(ci*70)+'ms"><header class="court-board-head"><div><span>SÂN</span><h3>Sân '+esc(court)+'</h3></div><b>'+(liveCount?'● '+liveCount+' LIVE':rows.length+' trận')+'</b></header><div class="court-match-stack">'+(cards||empty)+'</div></section>';
 }).join("")+'</div>':empty("🏓","Chưa có lịch đấu","Lịch thi đấu sẽ xuất hiện khi BTC xếp trận.");

  function sortGroupTeams(arr){return [...arr].sort((a,b)=>Number(a.standingRank||999)-Number(b.standingRank||999)||Number(a.seed||999)-Number(b.seed||999));}
  const groupEntries=divs.flatMap(d=>[...new Set(teams.filter(x=>x.divisionId===d.id).map(x=>x.group).filter(Boolean))].sort().map(g=>({d,g})));
  $("#tourStandings").innerHTML=groupEntries.map(({d,g})=>{const advance=Math.max(1,Number(d.advanceCount||2)),rows=sortGroupTeams(teams.filter(x=>x.divisionId===d.id&&x.group===g),matches.filter(m=>m.divisionId===d.id));return '<div class="public-standings"><div class="panel-head"><div><span class="eyebrow">'+esc(d.name)+' • BẢNG '+esc(g)+'</span><h2>Xếp hạng Bảng '+esc(g)+'</h2></div><span class="badge blue">TOP '+advance+' ĐI TIẾP</span></div><div class="standing-table-wrap"><div class="standing-row head"><span>#</span><span>Đội / VĐV</span><span>Trận</span><span>Set</span><span>Điểm</span><span>+/-</span><span>Xếp hạng</span></div>'+rows.map((r,i)=>{const qualified=i<advance,rankTag=i===0?'<span class="rank-badge rank-1">🥇 Nhất bảng</span>':i===1?'<span class="rank-badge rank-2">🥈 Nhì bảng</span>':'<span class="rank-badge rank-other">Hạng '+(i+1)+'</span>';const qCls=i===0?'qualify-rank-1':i===1?'qualify-rank-2':'';const diff=r.pf-r.pa;return '<div class="standing-row '+qCls+'"><b>'+(i+1)+'</b><span><b>'+esc(r.name)+'</b><small class="muted-block">'+esc(r.club||"")+'</small></span><span>'+r.w+'-'+r.l+'</span><span>'+(r.sw||0)+'-'+(r.sl||0)+'</span><span>'+r.pf+'-'+r.pa+'</span><b>'+(diff>0?'+':'')+diff+'</b><div>'+rankTag+(qualified?'<small class="qualify-status">Vào vòng trong</small>':'')+'</div></div>';}).join("")+'</div></div>'}).join("")||empty("📊","Chưa có bảng xếp hạng","Kết quả vòng bảng sẽ tự cập nhật.");
 const hasKnockout=matches.some(m=>m.bracketSlot)||matches.some(m=>/bán kết|chung kết|tứ kết/i.test(m.stage||""));
 const bracketHtml=hasKnockout
   ?(window.PickleBracket?.render(matches,team,{admin:false})||"")
   :(window.PickleBracket?.renderPlan(teams)||empty("🏆","Chưa có sơ đồ","BTC chưa chia bảng."));
 const champ=window.PickleBracket?.champion(matches,team);
 $("#tourBracket").innerHTML=bracketHtml+(champ&&champ!=="Chưa xác định"?'<div class="public-champion"><span>CHAMPION</span><strong>'+esc(champ)+'</strong></div>':"");
 requestAnimationFrame(()=>{requestAnimationFrame(drawBracketConnectors)});
 const relevant=sponsors.filter(s=>!s.tournament_id||s.tournament_id===t.id);
 $("#tourSponsors").innerHTML=relevant.map(s=>'<a class="public-sponsor" href="'+esc(safeHttps(s.website_url))+'" '+(safeHttps(s.website_url)!=="#"?'target="_blank" rel="noopener noreferrer"':"")+'>'+(s.logo_url?'<img src="'+esc(s.logo_url)+'" alt="'+esc(s.name)+'">':'<b>'+esc(s.name)+'</b>')+'<span>'+esc(s.tier||"Partner")+'</span></a>').join("")||'<span class="sponsor-empty">Chưa có nhà tài trợ công khai.</span>';
}
function drawBracketConnectors(){
  const host=document.querySelector("#tourBracket");
  if(!host)return;
  const tree=host.querySelector(".bracket-tree,.bracket-plan");
  if(!tree)return;
  tree.querySelector(".bracket-connectors")?.remove();
  const rounds=[...tree.querySelectorAll(":scope > .bracket-round-pro")];
  if(rounds.length<2)return;
  const ns="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(ns,"svg");
  svg.setAttribute("class","bracket-connectors");
  svg.setAttribute("aria-hidden","true");
  const width=Math.max(tree.scrollWidth,tree.offsetWidth),height=Math.max(tree.scrollHeight,tree.offsetHeight);
  svg.setAttribute("width",width);svg.setAttribute("height",height);svg.setAttribute("viewBox",`0 0 ${width} ${height}`);
  const base=tree.getBoundingClientRect();
  const point=(el,side)=>{
    const r=el.getBoundingClientRect();
    return {x:(side==="right"?r.right:r.left)-base.left+tree.scrollLeft,y:r.top-base.top+r.height/2};
  };
  const addPath=(d,cls)=>{
    const p=document.createElementNS(ns,"path");p.setAttribute("d",d);p.setAttribute("class",cls);svg.appendChild(p);
  };
  for(let ri=0;ri<rounds.length-1;ri++){
    const source=[...rounds[ri].querySelectorAll(":scope > .bracket-match-wrap")];
    const target=[...rounds[ri+1].querySelectorAll(":scope > .bracket-match-wrap")];
    target.forEach((to,j)=>{
      const dst=point(to,"left");
      [source[j*2],source[j*2+1]].filter(Boolean).forEach(from=>{
        const src=point(from,"right");
        const mid=src.x+Math.max(16,(dst.x-src.x)*.5);
        const d=`M ${src.x} ${src.y} H ${mid} Q ${mid+6} ${src.y} ${mid+6} ${src.y+6} V ${dst.y-6} Q ${mid+6} ${dst.y} ${mid+12} ${dst.y} H ${dst.x}`;
        addPath(d,"bracket-connector-glow");
        addPath(d,"bracket-connector-line");
      });
    });
  }
  tree.prepend(svg);
}
addEventListener("resize",()=>{clearTimeout(window.__pickleBracketResize);window.__pickleBracketResize=setTimeout(drawBracketConnectors,120)});
function showTournamentDraw(payload,done=false){
  if(payload?.tournamentId!==id)return;
  let el=document.querySelector(".realtime-draw-overlay");
  if(!el){el=document.createElement("div");el.className="realtime-draw-overlay";document.body.appendChild(el)}
  const groups=Array.isArray(payload?.groups)?payload.groups:[];
  el.innerHTML=`<div class="realtime-draw-card ${done?"is-done":""}"><div class="realtime-draw-icon">${done?"✓":"🎡"}</div><span>${done?"KẾT QUẢ BỐC THĂM":"ĐANG BỐC THĂM REALTIME"}</span><h3>${esc(payload?.divisionName||"Chia bảng")}</h3><p>${done?`${payload.groupCount||groups.length} bảng • Top ${payload.advanceCount||2} đi tiếp`:`${payload.teamCount||0} cặp/đội đang được quay`}</p>${done&&groups.length?`<div class="realtime-draw-groups">${groups.map(g=>`<b>Bảng ${esc(g.group)} <small>${g.count} đội</small></b>`).join("")}</div>`:""}</div>`;
  el.classList.add("show");clearTimeout(window.__tourDrawTimer);
  if(done)window.__tourDrawTimer=setTimeout(()=>{el.classList.remove("show");setTimeout(()=>el.remove(),250)},6000);
}
async function load(){
  if(realtimeRefreshBusy){realtimeRefreshAgain=true;return}
  realtimeRefreshBusy=true;
  try{do{realtimeRefreshAgain=false;[state,sponsors]=await Promise.all([PickleAPI.publicState(),PickleAPI.publicSponsors().catch(()=>[])]);render()}while(realtimeRefreshAgain)}
  finally{realtimeRefreshBusy=false}
}
let realtimeRefreshAgain=false;
load().catch(console.error);
if(window.io){
  const socket=io();
  socket.on("connect",()=>{realtimeConnected=true;load().catch(console.error)});
  socket.on("disconnect",()=>{realtimeConnected=false;render()});
  socket.on("public:state",s=>{realtimeConnected=true;if(Array.isArray(s?.matches)&&Array.isArray(s?.teams)&&Array.isArray(s?.tournaments)){state=s;render()}else load().catch(console.error)});
  socket.on("match:update",()=>{realtimeConnected=true;load().catch(console.error)});
  socket.on("draw:start",p=>{realtimeConnected=true;showTournamentDraw(p,false)});
  socket.on("draw:complete",p=>{realtimeConnected=true;showTournamentDraw(p,true);load().catch(console.error)});
}
setInterval(()=>{if(!realtimeConnected)load().catch(console.error)},10000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)load().catch(console.error)});
