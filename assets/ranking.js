let players=[];const $=s=>document.querySelector(s);
function render(){
 const q=($("#rankSearch").value||"").toLowerCase(),club=$("#rankClub").value;
 const rows=players.filter(p=>(!club||p.club_name===club)&&(!q||(p.full_name+" "+(p.nickname||"")+" "+(p.club_name||"")).toLowerCase().includes(q))).sort((a,b)=>Number(b.rating||0)-Number(a.rating||0)||a.full_name.localeCompare(b.full_name,"vi"));
 $("#rankingRows").innerHTML=rows.map((p,i)=>`<div class="standing-row" style="grid-template-columns:60px 1.8fr 1fr 1fr"><b>${i+1}</b><a href="player.html?id=${encodeURIComponent(p.id)}" style="text-decoration:none;color:inherit"><b>${p.full_name}</b>${p.nickname?`<small style="display:block;color:#708078">${p.nickname}</small>`:""}</a><span>${p.club_name||"Tự do"}</span><b>${Number(p.rating||0).toFixed(3)}</b></div>`).join("")||'<div class="empty">Không có VĐV phù hợp.</div>';
}
async function load(){
 players=await PickleAPI.publicPlayers();
 const clubs=[...new Set(players.map(p=>p.club_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi"));
 $("#rankClub").innerHTML='<option value="">Tất cả CLB</option>'+clubs.map(c=>`<option value="${c}">${c}</option>`).join("");
 render();
}
load().catch(console.error);
$("#rankSearch").oninput=render;$("#rankClub").onchange=render;
if(window.io){const s=io();s.on("public:state",()=>load().catch(()=>{}))}
