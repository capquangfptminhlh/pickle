let state=null;const $=s=>document.querySelector(s);const id=new URLSearchParams(location.search).get("id");
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const team=x=>state?.teams.find(t=>t.id===x)?.name||"Chưa xác định";
const badge=s=>s==="live"?'<span class="badge live">LIVE</span>':s==="done"?'<span class="badge done">KẾT THÚC</span>':'<span class="badge wait">SẮP ĐẤU</span>';
function render(){
 if(!state)return;const t=state.tournaments.find(x=>x.id===id)||state.tournaments[0];
 if(!t){$("#tourName").textContent="Không tìm thấy giải";$("#tourMeta").textContent="Giải không tồn tại hoặc chưa được công khai.";return}
 document.title=t.name+" | Pickle Tour";$("#tourName").textContent=t.name;$("#tourMeta").textContent=[t.date,t.venue,(t.teams??0)+" đội/cặp"].filter(Boolean).join(" • ");
 const divs=state.divisions.filter(d=>d.tournamentId===t.id),dids=new Set(divs.map(d=>d.id));
 const teams=state.teams.filter(x=>dids.has(x.divisionId)),matches=state.matches.filter(x=>dids.has(x.divisionId));
 $("#tourMatches").innerHTML=matches.map(m=>'<article class="public-match"><div class="public-match-top"><span>'+esc(m.stage)+' • '+esc(m.time)+' • Sân '+esc(m.court)+'</span>'+badge(m.status)+'</div><div class="public-team-row"><b>'+esc(team(m.a))+'</b><b>'+(m.status==="live"?(m.current?.[0]??0):(m.sets?.filter(s=>s[0]>s[1]).length||"—"))+'</b></div><div class="public-team-row"><b>'+esc(team(m.b))+'</b><b>'+(m.status==="live"?(m.current?.[1]??0):(m.sets?.filter(s=>s[1]>s[0]).length||"—"))+'</b></div></article>').join("")||'<div class="app-empty-card"><span>🏓</span><b>Chưa có lịch đấu</b><small>Lịch thi đấu sẽ xuất hiện khi BTC xếp trận.</small></div>';
 const groups=[...new Set(teams.map(t=>t.group).filter(Boolean))];
 $("#tourStandings").innerHTML=groups.map(g=>{const rows=teams.filter(t=>t.group===g).sort((a,b)=>b.w-a.w||((b.pf-b.pa)-(a.pf-a.pa))||b.pf-a.pf);return '<div class="public-standings"><div class="panel-head"><div><span class="eyebrow">BẢNG '+esc(g)+'</span><h2>Xếp hạng</h2></div></div><div class="standing-row head"><span>#</span><span>Đội</span><span>W</span><span>L</span><span>PF</span><span>PA</span><span>+/-</span></div>'+rows.map((r,i)=>'<div class="standing-row"><b>'+(i+1)+'</b><span><b>'+esc(r.name)+'</b><small class="muted-block">'+esc(r.club)+'</small></span><span>'+r.w+'</span><span>'+r.l+'</span><span>'+r.pf+'</span><span>'+r.pa+'</span><b>'+((r.pf-r.pa)>0?"+":"")+(r.pf-r.pa)+'</b></div>').join("")+'</div>'}).join("")||'<div class="app-empty-card"><span>📊</span><b>Chưa có bảng xếp hạng</b><small>Kết quả vòng bảng sẽ tự cập nhật.</small></div>';
 const bracketHtml=window.PickleBracket?.render(matches,team,{admin:false})||'<div class="app-empty-card"><span>🏆</span><b>Chưa có bracket</b><small>BTC chưa khởi tạo vòng loại trực tiếp.</small></div>';
 const champ=window.PickleBracket?.champion(matches,team);
 $("#tourBracket").innerHTML=bracketHtml+(champ&&champ!=="Chưa xác định"?'<div class="public-champion"><span>CHAMPION</span><strong>'+esc(champ)+'</strong></div>':"");
}
async function load(){state=await PickleAPI.publicState();render()}load().catch(console.error);
if(window.io){const socket=io();socket.on("public:state",s=>{state=s;render()})}