let state=null,sponsors=[];const $=s=>document.querySelector(s);const id=new URLSearchParams(location.search).get("id");
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const team=x=>state?.teams.find(t=>t.id===x)?.name||"Chưa xác định";
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
 $("#tourTeams").innerHTML=teams.map((x,i)=>{const d=divs.find(v=>v.id===x.divisionId);return '<article class="tournament-team-card"><span class="team-seed">'+(x.seed||i+1)+'</span><div><b>'+esc(x.name)+'</b><small>'+esc(x.club||"Tự do")+' • '+esc(d?.name||"")+'</small></div><em>Bảng '+esc(x.group||"—")+'</em></article>'}).join("")||empty("👥","Chưa có đội / cặp tham dự","Danh sách sẽ xuất hiện khi BTC thêm đội.");
 const ordered=[...matches].sort((a,b)=>(a.status==="live"?0:a.status==="wait"?1:2)-(b.status==="live"?0:b.status==="wait"?1:2)||String(a.time).localeCompare(String(b.time)));
 $("#tourMatches").innerHTML=ordered.map(m=>'<article class="public-match '+(m.status==="live"?"tournament-live-match":"")+'"><div class="public-match-top"><span>'+esc(m.stage)+' • '+esc(m.time)+' • Sân '+esc(m.court)+'</span>'+badge(m.status)+'</div><div class="public-team-row"><b>'+esc(team(m.a))+'</b><b>'+(m.status==="live"?(m.current?.[0]??0):(m.sets?.filter(s=>s[0]>s[1]).length||"—"))+'</b></div><div class="public-team-row"><b>'+esc(team(m.b))+'</b><b>'+(m.status==="live"?(m.current?.[1]??0):(m.sets?.filter(s=>s[1]>s[0]).length||"—"))+'</b></div></article>').join("")||empty("🏓","Chưa có lịch đấu","Lịch thi đấu sẽ xuất hiện khi BTC xếp trận.");
 const groups=[...new Set(teams.map(x=>x.group).filter(Boolean))];
 $("#tourStandings").innerHTML=groups.map(g=>{const rows=teams.filter(x=>x.group===g).sort((a,b)=>b.w-a.w||((b.pf-b.pa)-(a.pf-a.pa))||b.pf-a.pf);return '<div class="public-standings"><div class="panel-head"><div><span class="eyebrow">BẢNG '+esc(g)+'</span><h2>Xếp hạng</h2></div></div><div class="standing-row head"><span>#</span><span>Đội</span><span>W</span><span>L</span><span>PF</span><span>PA</span><span>+/-</span></div>'+rows.map((r,i)=>'<div class="standing-row"><b>'+(i+1)+'</b><span><b>'+esc(r.name)+'</b><small class="muted-block">'+esc(r.club||"")+'</small></span><span>'+r.w+'</span><span>'+r.l+'</span><span>'+r.pf+'</span><span>'+r.pa+'</span><b>'+((r.pf-r.pa)>0?"+":"")+(r.pf-r.pa)+'</b></div>').join("")+'</div>'}).join("")||empty("📊","Chưa có bảng xếp hạng","Kết quả vòng bảng sẽ tự cập nhật.");
 const bracketHtml=window.PickleBracket?.render(matches,team,{admin:false})||empty("🏆","Chưa có bracket","BTC chưa khởi tạo vòng loại trực tiếp.");
 const champ=window.PickleBracket?.champion(matches,team);
 $("#tourBracket").innerHTML=bracketHtml+(champ&&champ!=="Chưa xác định"?'<div class="public-champion"><span>CHAMPION</span><strong>'+esc(champ)+'</strong></div>':"");
 const relevant=sponsors.filter(s=>!s.tournament_id||s.tournament_id===t.id);
 $("#tourSponsors").innerHTML=relevant.map(s=>'<a class="public-sponsor" href="'+esc(safeHttps(s.website_url))+'" '+(safeHttps(s.website_url)!=="#"?'target="_blank" rel="noopener noreferrer"':"")+'>'+(s.logo_url?'<img src="'+esc(s.logo_url)+'" alt="'+esc(s.name)+'">':'<b>'+esc(s.name)+'</b>')+'<span>'+esc(s.tier||"Partner")+'</span></a>').join("")||'<span class="sponsor-empty">Chưa có nhà tài trợ công khai.</span>';
}
async function load(){[state,sponsors]=await Promise.all([PickleAPI.publicState(),PickleAPI.publicSponsors().catch(()=>[])]);render()}load().catch(console.error);
if(window.io){const socket=io();socket.on("public:state",s=>{state=s;render()})}