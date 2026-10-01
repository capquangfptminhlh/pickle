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
const statusMeta=s=>({live:["ĐANG DIỄN RA","live"],registration:["ĐANG NHẬN ĐĂNG KÝ","blue"],open:["ĐANG NHẬN ĐĂNG KÝ","blue"],completed:["ĐÃ KẾT THÚC","done"],cancelled:["ĐÃ HỦY","done"]}[s]||["SẮP DIỄN RA","wait"]);
const safeHttps=s=>{if(!s)return "#";try{const u=new URL(s,location.origin);return u.protocol==="https:"?s:"#"}catch{return "#"}};
function empty(icon,title,copy){return '<div class="app-empty-card"><span>'+icon+'</span><b>'+title+'</b><small>'+copy+'</small></div>'}
function render(){
 if(!state)return;const t=state.tournaments.find(x=>x.id===id);
 if(!t){$("#tourName").textContent="Không tìm thấy giải";$("#tourMeta").textContent="Giải không tồn tại hoặc chưa được công khai.";document.querySelectorAll(".tournament-app-main section:not(.tournament-app-hero),.tournament-tabs").forEach(x=>x.hidden=true);return}
 document.title=t.name+" | Pickle Tour";
 $("#tourName").textContent=t.name;
 $("#tourMeta").textContent=[t.date,t.venue,t.format].filter(Boolean).join(" • ");
 const banner=$("#tourBannerImage"),hero=document.querySelector(".tournament-app-hero");
 if(banner&&t.posterUrl){
   banner.src=t.posterUrl;banner.alt="Banner "+t.name;banner.hidden=false;hero?.classList.add("has-banner");
 }else if(banner){
   banner.removeAttribute("src");banner.hidden=true;hero?.classList.remove("has-banner");
 }
 const divs=state.divisions.filter(d=>d.tournamentId===t.id),dids=new Set(divs.map(d=>d.id));
 const teams=state.teams.filter(x=>dids.has(x.divisionId)),matches=state.matches.filter(x=>dids.has(x.divisionId));
 const live=matches.filter(m=>m.status==="live"),done=matches.filter(m=>m.status==="done");
 const sm=statusMeta(t.status),status=$("#tourStatus");status.innerHTML='<span class="badge '+sm[1]+'">'+sm[0]+'</span>';
 $("#tourHeroStats").innerHTML=[
   ["Nội dung",divs.length],["Đội / cặp",teams.length],["Trận đấu",matches.length],["Đã xong",done.length]
 ].map(([k,v])=>'<span><b>'+v+'</b><small>'+k+'</small></span>').join("");
 $("#tourLiveCount").textContent=(live.length?"● "+live.length+" LIVE":"0 live")+" • "+(realtimeConnected?"REALTIME":"CÔNG KHAI");$("#tourLiveCount").classList.toggle("is-realtime",realtimeConnected);$("#tourTeamCount").textContent=teams.length+" đội";
 const hasMlp=divs.some(d=>d?.eventType==="team"||d?.format==="minigame_mlp"||/mlp/i.test(d?.name||""));
 $("#tourDivisions").innerHTML=divs.map(d=>{
   const isMlp=d?.eventType==="team"||d?.format==="minigame_mlp"||/mlp/i.test(d?.name||"");
   const pills=isMlp?'<b>4 Game (AB, BC, CD, DA)</b><b>Cộng dồn 36 điểm</b><b>Freeze điểm 36 (Bên giao bóng)</b>':'<b>Best of '+esc(d.bestOf)+'</b><b>'+esc(d.pointsToWin)+' điểm</b><b>'+(d.winByTwo?"Cách 2":"Không cách 2")+'</b>';
   return '<article class="tournament-division-card"><div><span>'+esc(isMlp?"Đồng đội MLP":d.eventType||"Nội dung")+'</span><h3>'+esc(d.name)+'</h3><p>'+esc(d.format||"")+'</p></div><div class="division-rule-pills">'+pills+'</div></article>';
 }).join("")||empty("🏓","Chưa có nội dung thi đấu","BTC chưa tạo nội dung cho giải này.");

 if(hasMlp){
   const mlpHtml=`<div class="mlp-rules-banner" style="margin-top:16px;background:linear-gradient(135deg,#0d2118,#163c2c);color:#fff;border-radius:20px;padding:20px;border:1px solid rgba(223,255,105,.25);box-shadow:0 8px 24px rgba(0,0,0,.15)">
     <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;border-bottom:1px solid rgba(223,255,105,.2);padding-bottom:10px">
       <div>
         <span style="font-size:10px;font-weight:900;letter-spacing:.12em;color:#dfff69;text-transform:uppercase">QUY TẮC CHÍNH THỨC</span>
         <h3 style="margin:2px 0 0;font-size:17px;color:#fff">🏆 ĐIỀU LỆ THI ĐẤU MINIGAME MLP (36 ĐIỂM CỘNG DỒN)</h3>
       </div>
       <span style="padding:4px 10px;border-radius:20px;background:#dfff69;color:#0d2118;font-size:11px;font-weight:900">4 VĐV • 4 GAME</span>
     </div>
     <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;font-size:12px">
       <div style="background:rgba(255,255,255,.06);padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08)">
         <strong style="display:block;color:#dfff69;margin-bottom:4px">1. TRÌNH ĐỘ</strong>
         <span>Đội 4 VĐV xếp theo thứ tự trình độ: <b>A - B - C - D</b>.</span>
       </div>
       <div style="background:rgba(255,255,255,.06);padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08)">
         <strong style="display:block;color:#dfff69;margin-bottom:4px">2. NỘI DUNG THI ĐẤU</strong>
         <span>4 cặp đấu: <b>AB - BC - CD - DA</b>. Thứ tự bốc thăm trước mỗi trận.</span>
       </div>
       <div style="background:rgba(255,255,255,.06);padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08)">
         <strong style="display:block;color:#dfff69;margin-bottom:4px">3. TÍNH ĐIỂM CỘNG DỒN</strong>
         <span>Tổng 36đ, 4 game: G1 đến <b>9đ</b> ➔ G2 tích lũy đến <b>18đ</b> ➔ G3 tích lũy đến <b>27đ</b> ➔ G4 chạm <b>36đ</b> thắng.</span>
       </div>
       <div style="background:rgba(255,255,255,.06);padding:12px;border-radius:12px;border:1px solid rgba(223,255,105,.3)">
         <strong style="display:block;color:#fde047;margin-bottom:4px">⚡ 4. ĐIỂM 36 QUYẾT ĐỊNH</strong>
         <span><b>Điểm 36 bên cầm giao bóng mới được tính điểm</b> (Freeze rule: bên đỡ bóng thắng rally chỉ giành quyền giao).</span>
       </div>
     </div>
   </div>`;
   const host=document.querySelector("#overview .public-container");
   if(host){
     let rEl=document.querySelector("#tourMlpRules");
     if(!rEl){rEl=document.createElement("div");rEl.id="tourMlpRules";host.appendChild(rEl)}
     rEl.innerHTML=mlpHtml;
   }
 }
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
 const courtDefs=(state.courts||[]).filter(c=>c.tournamentId===t.id&&c.active!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
 const courtKeys=[...new Set([
   ...courtDefs.map(c=>String(c.sortOrder||c.name?.replace(/\D+/g,"")||c.name||"—")),
   ...ordered.map(m=>String(m.court??"—"))
 ])].sort((a,b)=>Number(a)-Number(b)||a.localeCompare(b,"vi"));
 const isMlpDiv=d=>d?.eventType==="team"||d?.format==="minigame_mlp"||/mlp/i.test(d?.name||"");
 const isMlpMatch=m=>{const d=divs.find(x=>x.id===m.divisionId);return isMlpDiv(d)||/mlp/i.test(m.stage||"")};
 const scoreOf=(m,side)=>{
   if(m.status==="live")return m.current?.[side]??0;
   if(m.status==="done"||m.status==="completed"){
     if(isMlpMatch(m)&&m.sets?.length){
       const last=m.sets[m.sets.length-1];
       return last[side]??0;
     }
     return (m.sets||[]).filter(s=>side===0?s[0]>s[1]:s[1]>s[0]).length;
   }
   return "—";
 };
 const courtTeamRow=(m,side)=>{
   const tid=side===0?m.a:m.b,av=teamAvatar(tid),name=team(tid),score=scoreOf(m,side);
   return '<div class="court-team-row">'+(av?'<img src="'+esc(av)+'" alt="" loading="lazy">':'<span class="court-team-avatar">'+esc(initials(name))+'</span>')+'<b>'+esc(name)+'</b><strong>'+esc(score)+'</strong></div>';
 };
 $("#tourMatches").innerHTML=courtKeys.length?'<div class="court-board-grid">'+courtKeys.map((court,ci)=>{
   const rows=ordered.filter(m=>String(m.court??"—")===court);
   const liveCount=rows.filter(m=>m.status==="live").length;
   const cards=rows.map((m,mi)=>{
     const statusClass=m.status==="live"?"is-live":(m.status==="done"||m.status==="completed"?"is-done":"is-wait");
     return '<article class="court-match-card '+statusClass+'" style="--match-delay:'+((ci*90)+(mi*45))+'ms"><div class="court-match-meta"><span><b>'+esc(m.time||"--:--")+'</b> • '+esc(m.stage||"Trận đấu")+'</span>'+badge(m.status)+'</div>'+courtTeamRow(m,0)+courtTeamRow(m,1)+'<footer>'+(m.status==="live"?'<span class="live-dot"></span> Đang diễn ra':m.status==="done"||m.status==="completed"?'✓ Đã kết thúc':'◷ Sắp diễn ra')+'</footer></article>';
   }).join("");
   const empty='<div class="court-empty-slot"><span>🏟</span><b>Sân đang trống</b><small>Chưa có trận được xếp</small></div>';
   return '<section class="court-board court-tone-'+((ci%4)+1)+'" style="--court-delay:'+(ci*70)+'ms"><header class="court-board-head"><div><span>SÂN</span><h3>Sân '+esc(court)+'</h3></div><b>'+(liveCount?'● '+liveCount+' LIVE':rows.length+' trận')+'</b></header><div class="court-match-stack">'+(cards||empty)+'</div></section>';
 }).join("")+'</div>':empty("🏓","Chưa có lịch đấu","Lịch thi đấu sẽ xuất hiện khi BTC xếp trận.");

  function sortGroupTeams(teamList, gm) {
    if (!teamList || !teamList.length) return [];
    const list = [...teamList];
    const mList = gm || [];
    const getH2H = (idA, idB) => {
      const m = mList.find(x => ((x.a === idA && x.b === idB) || (x.a === idB && x.b === idA)) && (x.status === "done" || x.status === "completed") && x.winner);
      if (!m) return 0;
      return m.winner === idA ? -1 : 1;
    };
    function resolveTied(subTeams) {
      if (subTeams.length <= 1) return subTeams;
      if (subTeams.length === 2) {
        const h2h = getH2H(subTeams[0].id, subTeams[1].id);
        if (h2h !== 0) return h2h < 0 ? [subTeams[0], subTeams[1]] : [subTeams[1], subTeams[0]];
        return [...subTeams].sort((a, b) =>
          ((b.sw || 0) - (b.sl || 0)) - ((a.sw || 0) - (a.sl || 0)) ||
          ((b.pf || 0) - (b.pa || 0)) - ((a.pf || 0) - (a.pa || 0)) ||
          (b.pf || 0) - (a.pf || 0) ||
          (a.seed || 999) - (b.seed || 999)
        );
      }
      const setDiffs = new Set(subTeams.map(t => (t.sw || 0) - (t.sl || 0)));
      if (setDiffs.size > 1) {
        const buckets = new Map();
        subTeams.forEach(t => {
          const sd = (t.sw || 0) - (t.sl || 0);
          if (!buckets.has(sd)) buckets.set(sd, []);
          buckets.get(sd).push(t);
        });
        const sortedDiffs = [...buckets.keys()].sort((a, b) => b - a);
        return sortedDiffs.flatMap(sd => resolveTied(buckets.get(sd)));
      }
      const ptDiffs = new Map(subTeams.map(t => [t.id, (t.pf || 0) - (t.pa || 0)]));
      const sortedByPt = [...subTeams].sort((a, b) => (ptDiffs.get(b.id) - ptDiffs.get(a.id)) || ((b.pf || 0) - (a.pf || 0)));
      const topPd = ptDiffs.get(sortedByPt[0].id);
      const topTeams = sortedByPt.filter(t => ptDiffs.get(t.id) === topPd);
      if (topTeams.length === 1) {
        const winner = topTeams[0];
        const remaining = subTeams.filter(t => t.id !== winner.id);
        return [winner, ...resolveTied(remaining)];
      }
      const minPd = ptDiffs.get(sortedByPt[sortedByPt.length - 1].id);
      const bottomTeams = sortedByPt.filter(t => ptDiffs.get(t.id) === minPd);
      if (bottomTeams.length === 1 && subTeams.length > 2) {
        const loser = bottomTeams[0];
        const remaining = subTeams.filter(t => t.id !== loser.id);
        return [...resolveTied(remaining), loser];
      }
      return [...subTeams].sort((a, b) => {
        const pdA = (a.pf || 0) - (a.pa || 0), pdB = (b.pf || 0) - (b.pa || 0);
        if (pdB !== pdA) return pdB - pdA;
        const h2h = getH2H(a.id, b.id);
        if (h2h !== 0) return h2h;
        return (b.pf || 0) - (a.pf || 0) || (a.seed || 999) - (b.seed || 999);
      });
    }

    const winBuckets = new Map();
    list.forEach(t => {
      const w = t.w || 0;
      if (!winBuckets.has(w)) winBuckets.set(w, []);
      winBuckets.get(w).push(t);
    });
    const sortedWins = [...winBuckets.keys()].sort((a, b) => b - a);
    return sortedWins.flatMap(w => resolveTied(winBuckets.get(w)));
  }
  const groups=[...new Set(teams.map(x=>x.group).filter(Boolean))];
  const hasSeriesB=matches.some(m=>(m.bracketSlot||"").startsWith("SE-B-"));
  $("#tourStandings").innerHTML=groups.map(g=>{const rows=sortGroupTeams(teams.filter(x=>x.group===g),matches);return '<div class="public-standings"><div class="panel-head"><div><span class="eyebrow">BẢNG '+esc(g)+'</span><h2>Xếp hạng Bảng '+esc(g)+'</h2></div><span class="badge blue">'+(hasSeriesB?'TOP VÀO SERIES A & B':'TOP 2 ĐI TIẾP')+'</span></div><div class="standing-table-wrap"><div class="standing-row head"><span>#</span><span>Đội / VĐV</span><span>Trận</span><span>Set</span><span>Điểm</span><span>+/-</span><span>Xếp hạng</span></div>'+rows.map((r,i)=>{const qualifyText=hasSeriesB?(i<2?'Vào Series A':'Vào Series B'):'Vào vòng trong';const rankTag=i===0?'<span class="rank-badge rank-1">🥇 Nhất bảng</span><small class="qualify-status">'+qualifyText+'</small>':i===1?'<span class="rank-badge rank-2">🥈 Nhì bảng</span><small class="qualify-status">'+qualifyText+'</small>':'<span class="rank-badge rank-other">Hạng '+(i+1)+'</span>'+(hasSeriesB?'<small class="qualify-status" style="color:#dfff69">'+qualifyText+'</small>':'');const qCls=i===0?'qualify-rank-1':i===1?'qualify-rank-2':'';const diff=r.pf-r.pa;return '<div class="standing-row '+qCls+'"><b>'+(i+1)+'</b><span><b>'+esc(r.name)+'</b><small class="muted-block">'+esc(r.club||"")+'</small></span><span>'+r.w+'-'+r.l+'</span><span>'+(r.sw||0)+'-'+(r.sl||0)+'</span><span>'+r.pf+'-'+r.pa+'</span><b>'+(diff>0?'+':'')+diff+'</b><div>'+rankTag+'</div></div>';}).join("")+'</div></div>'}).join("")||empty("📊","Chưa có bảng xếp hạng","Kết quả vòng bảng sẽ tự cập nhật.");
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
async function load(){
  if(realtimeRefreshBusy)return;
  realtimeRefreshBusy=true;
  try{[state,sponsors]=await Promise.all([PickleAPI.publicState(),PickleAPI.publicSponsors().catch(()=>[])]);render()}
  finally{realtimeRefreshBusy=false}
}
load().catch(console.error);
if(window.io){
  const socket=io();
  socket.on("connect",()=>{realtimeConnected=true;render()});
  socket.on("disconnect",()=>{realtimeConnected=false;render()});
  socket.on("public:state",s=>{realtimeConnected=true;state=s;render()});
  socket.on("match:update",()=>{realtimeConnected=true;load().catch(console.error)});
}
setInterval(()=>{if(!realtimeConnected)load().catch(console.error)},10000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)load().catch(console.error)});

// TV Kiosk Mode Handler (for venue display monitors)
(function initKioskMode(){
  const isKiosk=new URLSearchParams(location.search).get("kiosk")==="1";
  if(!isKiosk)return;
  const style=document.createElement("style");
  style.id="tv-kiosk-styles";
  style.textContent=`
    .public-header, .public-footer, .tournament-tabs, .tournament-hero-actions, .tournament-bracket-help, #overview, #participants, #tourSponsorsSection {
      display: none !important;
    }
    body.tournament-app-page {
      background: #0b1411 !important;
      color: #e6ede9 !important;
    }
    .tournament-app-hero {
      background: linear-gradient(135deg, #10261d 0%, #0c1c15 100%) !important;
      border: 1px solid rgba(223, 255, 105, 0.2) !important;
      color: #fff !important;
      margin-top: 16px !important;
      border-radius: 20px !important;
    }
    .tournament-app-hero h1, .tournament-app-hero p, .tournament-hero-stats b {
      color: #fff !important;
    }
    .tournament-hero-stats span {
      background: rgba(255,255,255,0.06) !important;
      border: 1px solid rgba(255,255,255,0.1) !important;
    }
    .app-section-head h2 {
      color: #dfff69 !important;
      font-size: 24px !important;
    }
    .app-section-head span {
      color: #7ce3b6 !important;
    }
    .public-section {
      padding: 24px 0 !important;
    }
    .public-match-grid .match-card, .public-division-card, .podium-card, .tournament-standing-card {
      background: #14231d !important;
      border: 1px solid #243d32 !important;
      color: #f0f6f2 !important;
    }
    .tv-kiosk-floating-pill {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #dfff69;
      color: #0b1411;
      padding: 8px 18px;
      border-radius: 999px;
      font-weight: 800;
      font-size: 13px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
      letter-spacing: 0.04em;
    }
    .tv-kiosk-floating-pill::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #e11d48;
      box-shadow: 0 0 10px #e11d48;
      animation: kioskPulse 1.5s infinite;
    }
    @keyframes kioskPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.8); }
    }
  `;
  document.head.appendChild(style);

  const pill=document.createElement("div");
  pill.className="tv-kiosk-floating-pill";
  pill.innerHTML="📺 MÀN HÌNH TV TRỰC TIẾP • ĐANG TỰ ĐỘNG CUỘN";
  document.body.appendChild(pill);

  const sections=["#schedule","#knockout","#standings"];
  let curSecIdx=0;
  setInterval(()=>{
    const target=document.querySelector(sections[curSecIdx]);
    if(target&&target.offsetHeight>0){
      target.scrollIntoView({behavior:"smooth",block:"start"});
    }
    curSecIdx=(curSecIdx+1)%sections.length;
  },16000);
})();