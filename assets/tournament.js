let state=null,sponsors=[];const $=s=>document.querySelector(s);const id=new URLSearchParams(location.search).get("id");
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const team=x=>state?.teams.find(t=>t.id===x)?.name||"Chưa xác định";
const teamPlayers=id=>(state?.teamPlayers?.[id]||[]).map(pid=>state?.players?.find(p=>p.id===pid)).filter(Boolean);
const teamAvatar=id=>teamPlayers(id)[0]?.avatar_url||"";
const initials=n=>(n||"VĐV").trim().split(/\s+/).slice(-2).map(x=>x[0]||"").join("").toUpperCase();
const fmtRating=v=>{const n=Number(v);return Number.isFinite(n)?(Math.round(n*100)/100).toFixed((Math.round(n*100)%100)===0?1:2):"—"};
const athleteChip=p=>{const av=p?.avatar_url?`<img src="${esc(p.avatar_url)}" alt="${esc(p.full_name||"VĐV")}" loading="lazy" class="tour-athlete-avatar">`:`<span class="tour-athlete-avatar tour-athlete-fallback">${esc(initials(p?.full_name))}</span>`;return `<span class="tour-athlete-chip">${av}<span class="tour-athlete-copy"><b>${esc(p?.full_name||"VĐV")}</b><small><strong>${fmtRating(p?.rating)}</strong> điểm</small></span></span>`}
const badge=s=>s==="live"?'<span class="badge live">LIVE</span>':s==="done"?'<span class="badge done">KẾT THÚC</span>':'<span class="badge wait">SẮP ĐẤU</span>';
const statusMeta=s=>({live:["ĐANG DIỄN RA","live"],registration:["ĐANG NHẬN ĐĂNG KÝ","blue"],open:["ĐANG NHẬN ĐĂNG KÝ","blue"],completed:["ĐÃ KẾT THÚC","done"],cancelled:["ĐÃ HỦY","done"]}[s]||["SẮP DIỄN RA","wait"]);
const safeHttps=s=>{if(!s)return "#";try{const u=new URL(s,location.origin);return u.protocol==="https:"?s:"#"}catch{return "#"}};
function empty(icon,title,copy){return '<div class="app-empty-card"><span>'+icon+'</span><b>'+title+'</b><small>'+copy+'</small></div>'}
function render(){
 if(!state)return;const t=state.tournaments.find(x=>x.id===id);
 if(!t){$("#tourName").textContent="Không tìm thấy giải";$("#tourMeta").textContent="Giải không tồn tại hoặc chưa được công khai.";document.querySelectorAll(".tournament-app-main section:not(.tournament-app-hero),.tournament-tabs").forEach(x=>x.hidden=true);return}
 document.title=t.name+" | Pickle Tour";
 $("#tourName").textContent=t.name;
 $("#tourMeta").textContent=[t.date,t.venue,t.format].filter(Boolean).join(" • ");
 const divs=state.divisions.filter(d=>d.tournamentId===t.id),dids=new Set(divs.map(d=>d.id));
 const teams=state.teams.filter(x=>dids.has(x.divisionId)),matches=state.matches.filter(x=>dids.has(x.divisionId));
 const live=matches.filter(m=>m.status==="live"),done=matches.filter(m=>m.status==="done");
 const sm=statusMeta(t.status),status=$("#tourStatus");status.innerHTML='<span class="badge '+sm[1]+'">'+sm[0]+'</span>';
 $("#tourHeroStats").innerHTML=[
   ["Nội dung",divs.length],["Đội / cặp",teams.length],["Trận đấu",matches.length],["Đã xong",done.length]
 ].map(([k,v])=>'<span><b>'+v+'</b><small>'+k+'</small></span>').join("");
 $("#tourLiveCount").textContent=live.length+" live";$("#tourTeamCount").textContent=teams.length+" đội";
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
 })()||empty("👥","Chưa có đội / cặp tham dự","Danh sách sẽ xuất hiện khi BTC thêm đội."); const ordered=[...matches].sort((a,b)=>(a.status==="live"?0:a.status==="wait"?1:2)-(b.status==="live"?0:b.status==="wait"?1:2)||String(a.time).localeCompare(String(b.time)));
 const courtKeys=[...new Set(ordered.map(m=>String(m.court??"—"))) ].sort((a,b)=>Number(a)-Number(b)||a.localeCompare(b,"vi"));
 const scoreOf=(m,side)=>m.status==="live"?(m.current?.[side]??0):(m.status==="done"||m.status==="completed"?(m.sets||[]).filter(s=>side===0?s[0]>s[1]:s[1]>s[0]).length:"—");
 const courtTeamRow=(m,side)=>{
   const tid=side===0?m.a:m.b,av=teamAvatar(tid),name=team(tid),score=scoreOf(m,side);
   return '<div class="court-team-row">'+(av?'<img src="'+esc(av)+'" alt="" loading="lazy">':'<span class="court-team-avatar">'+esc(initials(name))+'</span>')+'<b>'+esc(name)+'</b><strong>'+esc(score)+'</strong></div>';
 };
 $("#tourMatches").innerHTML=courtKeys.length?'<div class="court-board-grid">'+courtKeys.map((court,ci)=>{
   const rows=ordered.filter(m=>String(m.court??"—")===court);
   const liveCount=rows.filter(m=>m.status==="live").length;
   return '<section class="court-board court-tone-'+((ci%4)+1)+'" style="--court-delay:'+(ci*70)+'ms"><header class="court-board-head"><div><span>SÂN</span><h3>Sân '+esc(court)+'</h3></div><b>'+(liveCount?'● '+liveCount+' LIVE':rows.length+' trận')+'</b></header><div class="court-match-stack">'+rows.map((m,mi)=>{
     const statusClass=m.status==="live"?"is-live":(m.status==="done"||m.status==="completed"?"is-done":"is-wait");
     return '<article class="court-match-card '+statusClass+'" style="--match-delay:'+((ci*90)+(mi*45))+'ms"><div class="court-match-meta"><span><b>'+esc(m.time||"--:--")+'</b> • '+esc(m.stage||"Trận đấu")+'</span>'+badge(m.status)+'</div>'+courtTeamRow(m,0)+courtTeamRow(m,1)+'<footer>'+(m.status==="live"?'<span class="live-dot"></span> Đang diễn ra':m.status==="done"||m.status==="completed"?'✓ Đã kết thúc':'◷ Sắp diễn ra')+'</footer></article>';
   }).join("")+'</div></section>';
 }).join("")+'</div>':empty("🏓","Chưa có lịch đấu","Lịch thi đấu sẽ xuất hiện khi BTC xếp trận.");
  function sortGroupTeams(arr,mList){return [...arr].sort((a,b)=>{if(b.w!==a.w)return b.w-a.w;const sdA=(a.sw||0)-(a.sl||0),sdB=(b.sw||0)-(b.sl||0);if(sdB!==sdA)return sdB-sdA;if(mList&&mList.length){const h2h=mList.find(m=>(m.status==="done"||m.status==="completed")&&((m.a===a.id&&m.b===b.id)||(m.a===b.id&&m.b===a.id))&&m.winner);if(h2h){if(h2h.winner===a.id)return -1;if(h2h.winner===b.id)return 1;}}return ((b.pf-b.pa)-(a.pf-a.pa))||(b.pf-a.pf)||((a.seed||999)-(b.seed||999));});}
  const groups=[...new Set(teams.map(x=>x.group).filter(Boolean))];
  $("#tourStandings").innerHTML=groups.map(g=>{const rows=sortGroupTeams(teams.filter(x=>x.group===g),matches);return '<div class="public-standings"><div class="panel-head"><div><span class="eyebrow">BẢNG '+esc(g)+'</span><h2>Xếp hạng Bảng '+esc(g)+'</h2></div><span class="badge blue">TOP 2 ĐI TIẾP</span></div><div class="standing-table-wrap"><div class="standing-row head"><span>#</span><span>Đội / VĐV</span><span>Trận</span><span>Set</span><span>Điểm</span><span>+/-</span><span>Xếp hạng</span></div>'+rows.map((r,i)=>{const rankTag=i===0?'<span class="rank-badge rank-1">🥇 Nhất bảng</span><small class="qualify-status">Vào vòng trong</small>':i===1?'<span class="rank-badge rank-2">🥈 Nhì bảng</span><small class="qualify-status">Vào vòng trong</small>':'<span class="rank-badge rank-other">Hạng '+(i+1)+'</span>';const qCls=i===0?'qualify-rank-1':i===1?'qualify-rank-2':'';const diff=r.pf-r.pa;return '<div class="standing-row '+qCls+'"><b>'+(i+1)+'</b><span><b>'+esc(r.name)+'</b><small class="muted-block">'+esc(r.club||"")+'</small></span><span>'+r.w+'-'+r.l+'</span><span>'+(r.sw||0)+'-'+(r.sl||0)+'</span><span>'+r.pf+'-'+r.pa+'</span><b>'+(diff>0?'+':'')+diff+'</b><div>'+rankTag+'</div></div>';}).join("")+'</div></div>'}).join("")||empty("📊","Chưa có bảng xếp hạng","Kết quả vòng bảng sẽ tự cập nhật.");
 const hasKnockout=matches.some(m=>m.bracketSlot)||matches.some(m=>/bán kết|chung kết|tứ kết/i.test(m.stage||""));
 const bracketHtml=hasKnockout
   ?(window.PickleBracket?.render(matches,team,{admin:false})||"")
   :(window.PickleBracket?.renderPlan(teams)||empty("🏆","Chưa có sơ đồ","BTC chưa chia bảng."));
 const champ=window.PickleBracket?.champion(matches,team);
 $("#tourBracket").innerHTML=bracketHtml+(champ&&champ!=="Chưa xác định"?'<div class="public-champion"><span>CHAMPION</span><strong>'+esc(champ)+'</strong></div>':"");
 const relevant=sponsors.filter(s=>!s.tournament_id||s.tournament_id===t.id);
 $("#tourSponsors").innerHTML=relevant.map(s=>'<a class="public-sponsor" href="'+esc(safeHttps(s.website_url))+'" '+(safeHttps(s.website_url)!=="#"?'target="_blank" rel="noopener noreferrer"':"")+'>'+(s.logo_url?'<img src="'+esc(s.logo_url)+'" alt="'+esc(s.name)+'">':'<b>'+esc(s.name)+'</b>')+'<span>'+esc(s.tier||"Partner")+'</span></a>').join("")||'<span class="sponsor-empty">Chưa có nhà tài trợ công khai.</span>';
}
async function load(){[state,sponsors]=await Promise.all([PickleAPI.publicState(),PickleAPI.publicSponsors().catch(()=>[])]);render()}load().catch(console.error);
if(window.io){const socket=io();socket.on("public:state",s=>{state=s;render()})}