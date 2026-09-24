let players=[];const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const initials=name=>(name||"P").split(/\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase();
const avatar=p=>p.avatar_url
 ? `<img class="ranking-avatar" src="${esc(p.avatar_url)}" alt="${esc(p.full_name)}">`
 : `<span class="ranking-avatar ranking-avatar-fallback">${esc(initials(p.full_name))}</span>`;

function render(){
 const q=($("#rankSearch").value||"").toLowerCase(),club=$("#rankClub").value;
 const rows=players.filter(p=>(!club||p.club_name===club)&&(!q||(p.full_name+" "+(p.nickname||"")+" "+(p.club_name||"")).toLowerCase().includes(q))).sort((a,b)=>Number(b.rating||0)-Number(a.rating||0)||a.full_name.localeCompare(b.full_name,"vi"));
 $("#rankingRows").innerHTML=rows.map((p,i)=>`
   <div class="standing-row ranking-row">
     <b class="ranking-number">${i+1}</b>
     <a class="ranking-player-link" href="player.html?id=${encodeURIComponent(p.id)}">
       ${avatar(p)}
       <span class="ranking-player-copy">
         <b>${esc(p.full_name)}</b>
         <small>${esc(p.nickname||p.club_name||"VĐV")}</small>
       </span>
     </a>
     <span class="ranking-club">${esc(p.club_name||"Tự do")}</span>
     <b class="ranking-rating">${Number(p.rating||0).toFixed(3)}</b>
   </div>`).join("")||'<div class="empty">Không có VĐV phù hợp.</div>';
}
async function load(){
 players=await PickleAPI.publicPlayers();
 const clubs=[...new Set(players.map(p=>p.club_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi"));
 $("#rankClub").innerHTML='<option value="">Tất cả CLB</option>'+clubs.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
 render();
}
load().catch(console.error);
$("#rankSearch").oninput=render;$("#rankClub").onchange=render;
if(window.io){const s=io();s.on("public:state",()=>load().catch(()=>{}))}
