let state=null;const $=s=>document.querySelector(s);const id=new URLSearchParams(location.search).get("id");
const team=x=>state?.teams.find(t=>t.id===x)?.name||(x?"Chưa xác định":"Chưa xác định");
const badge=s=>s==="live"?'<span class="badge live">LIVE</span>':s==="done"?'<span class="badge done">KẾT THÚC</span>':'<span class="badge wait">SẮP ĐẤU</span>';
function render(){
 if(!state)return;const t=state.tournaments.find(x=>x.id===id)||state.tournaments[0];if(!t){$("#tourName").textContent="Không tìm thấy giải";return}
 document.title=t.name+" | Pickle Tour";$("#tourName").textContent=t.name;$("#tourMeta").textContent=`${t.date} • ${t.venue} • ${t.teams} đội`;
 const divs=state.divisions.filter(d=>d.tournamentId===t.id),dids=new Set(divs.map(d=>d.id));
 const teams=state.teams.filter(x=>dids.has(x.divisionId)),matches=state.matches.filter(x=>dids.has(x.divisionId));
 $("#tourMatches").innerHTML=matches.map(m=>`<article class="public-match"><div class="public-match-top"><span>${m.stage} • ${m.time} • Sân ${m.court}</span>${badge(m.status)}</div><div class="public-team-row"><b>${team(m.a)}</b><b>${m.status==="live"?m.current[0]:m.sets?.filter(s=>s[0]>s[1]).length||"—"}</b></div><div class="public-team-row"><b>${team(m.b)}</b><b>${m.status==="live"?m.current[1]:m.sets?.filter(s=>s[1]>s[0]).length||"—"}</b></div></article>`).join("")||'<div class="empty">Chưa có lịch đấu.</div>';
 const groups=[...new Set(teams.map(t=>t.group).filter(Boolean))];
 $("#tourStandings").innerHTML=groups.map(g=>{const rows=teams.filter(t=>t.group===g).sort((a,b)=>b.w-a.w||((b.pf-b.pa)-(a.pf-a.pa))||b.pf-a.pf);return `<div class="public-standings"><div class="panel-head"><h2>Bảng ${g}</h2></div><div class="standing-row head"><span>#</span><span>Đội</span><span>W</span><span>L</span><span>PF</span><span>PA</span><span>+/-</span></div>${rows.map((r,i)=>`<div class="standing-row"><b>${i+1}</b><span><b>${r.name}</b><small style="display:block;color:#708078">${r.club}</small></span><span>${r.w}</span><span>${r.l}</span><span>${r.pf}</span><span>${r.pa}</span><b>${r.pf-r.pa>0?"+":""}${r.pf-r.pa}</b></div>`).join("")}</div>`}).join("")||'<div class="empty">Chưa có BXH.</div>';
 const bracketHtml=window.PickleBracket?.render(matches,team,{admin:false})||'<div class="empty">Chưa có bracket.</div>';
 const champ=window.PickleBracket?.champion(matches,team)||"Chưa xác định";
 $("#tourBracket").innerHTML=bracketHtml+'<div class="public-champion"><span>CHAMPION</span><strong>'+champ+'</strong></div>';
}
async function load(){state=await PickleAPI.publicState();render()}load().catch(console.error);
if(window.io){const socket=io();socket.on("public:state",s=>{state=s;render()})}
