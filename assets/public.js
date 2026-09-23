let state={tournaments:[],divisions:[],teams:[],matches:[],audit:[]};
const $=s=>document.querySelector(s);
const team=id=>state.teams.find(t=>t.id===id)?.name||(id==="TBD"||!id?"Chưa xác định":id);
const badge=s=>s==="live"?'<span class="badge live">LIVE</span>':s==="done"?'<span class="badge done">KẾT THÚC</span>':s==="open"?'<span class="badge blue">ĐANG MỞ</span>':'<span class="badge wait">SẮP ĐẤU</span>';
const score=(m,side)=>m.current?.[side==="a"?0:1]??0;
function liveCard(m){return `<div class="hero-score"><div style="font-size:10px;color:#9eb3a6">${m.stage} • Sân ${m.court} • ${m.time}</div><div class="line"><strong>${team(m.a)}</strong><span class="points">${score(m,"a")}</span></div><div class="line"><strong>${team(m.b)}</strong><span class="points">${score(m,"b")}</span></div></div>`}
function render(){
  const live=state.matches.filter(m=>m.status==="live");
  $("#liveCount").textContent=`${live.length} trận`;
  $("#heroLive").innerHTML=live.slice(0,2).map(liveCard).join("")||'<div class="hero-score">Hiện chưa có trận live.</div>';
  $("#publicTours").innerHTML=state.tournaments.map(t=>`<a class="tour-card" href="/tournament.html?id=${encodeURIComponent(t.id)}" style="text-decoration:none;color:inherit"><div class="tour-cover"><strong>${t.format||"Tournament"}</strong>${badge(t.status)}</div><div class="tour-body"><h3>${t.name}</h3><div class="meta"><span>📅 ${t.date}</span><span>📍 ${t.venue}</span><span>👥 ${t.teams} đội</span></div></div></a>`).join("")||'<div class="empty">Chưa có giải công khai.</div>';
  $("#publicMatches").innerHTML=state.matches.filter(m=>m.status!=="done").map(m=>`<article class="public-match"><div class="public-match-top"><span>${m.stage} • ${m.time} • Sân ${m.court}</span>${badge(m.status)}</div><div class="public-team-row"><b>${team(m.a)}</b><b>${m.status==="live"?score(m,"a"):"—"}</b></div><div class="public-team-row"><b>${team(m.b)}</b><b>${m.status==="live"?score(m,"b"):"—"}</b></div></article>`).join("")||'<div class="empty">Chưa có trận.</div>';
  const groups=[...new Set(state.teams.map(t=>t.group).filter(Boolean))];
  $("#publicStandings").innerHTML=groups.map(g=>{const rows=state.teams.filter(t=>t.group===g).sort((a,b)=>b.w-a.w||((b.pf-b.pa)-(a.pf-a.pa))||b.pf-a.pf);return `<div class="public-standings"><div class="panel-head"><h2>Bảng ${g}</h2><span class="badge blue">TOP 2</span></div><div class="standing-row head"><span>#</span><span>Đội</span><span>W</span><span>L</span><span>PF</span><span>PA</span><span>+/-</span></div>${rows.map((t,i)=>`<div class="standing-row"><b>${i+1}</b><span><b>${t.name}</b><small style="display:block;color:#708078">${t.club}</small></span><span>${t.w}</span><span>${t.l}</span><span>${t.pf}</span><span>${t.pa}</span><b>${t.pf-t.pa>0?"+":""}${t.pf-t.pa}</b></div>`).join("")}</div>`}).join("")||'<div class="empty">Chưa có bảng xếp hạng.</div>';
  const semis=state.matches.filter(m=>m.stage.toLowerCase().includes("bán kết")),final=state.matches.find(m=>m.stage.toLowerCase().includes("chung kết"));
  const bm=m=>`<div class="public-bracket-card"><div class="public-bracket-row ${m.winner===m.a?"win":""}"><span>${team(m.a)}</span><b>${m.sets?.filter(s=>s[0]>s[1]).length||""}</b></div><div class="public-bracket-row ${m.winner===m.b?"win":""}"><span>${team(m.b)}</span><b>${m.sets?.filter(s=>s[1]>s[0]).length||""}</b></div></div>`;
  $("#publicBracket").innerHTML=`<div class="public-bracket"><div class="public-round"><small>BÁN KẾT</small>${semis.map(bm).join("")}</div><div class="public-round"><small>CHUNG KẾT</small>${final?bm(final):""}</div><div class="public-round"><small>VÔ ĐỊCH</small><div class="public-bracket-card" style="padding:26px;text-align:center"><div style="font-size:36px">🏆</div><b>${final?.winner?team(final.winner):"Chưa xác định"}</b></div></div></div>`;
}
async function load(){
  try{state=await PickleAPI.publicState();render()}catch(e){console.error(e)}
}
load();
if(window.io){const socket=io();socket.on("public:state",s=>{state=s;render()})}
