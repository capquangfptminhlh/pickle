let players=[];const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const initials=name=>(name||"P").split(/\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase();
const avatar=(p,cls="ranking-avatar")=>p.avatar_url
 ? '<img class="'+cls+'" src="'+esc(p.avatar_url)+'" alt="'+esc(p.full_name)+'">'
 : '<span class="'+cls+' ranking-avatar-fallback">'+esc(initials(p.full_name))+'</span>';

function render(){
 const q=($("#rankSearch").value||"").toLocaleLowerCase("vi"),club=$("#rankClub").value;
 const rows=players.filter(p=>(!club||p.club_name===club)&&(!q||(p.full_name+" "+(p.nickname||"")+" "+(p.club_name||"")).toLocaleLowerCase("vi").includes(q))).sort((a,b)=>Number(b.rating||0)-Number(a.rating||0)||a.full_name.localeCompare(b.full_name,"vi"));
 const podium=$("#rankingPodium");
 if(podium){
   const top=rows.slice(0,3),order=[1,0,2];
   podium.innerHTML=top.length?order.filter(i=>top[i]).map(i=>{
     const p=top[i],rank=i+1;
     return '<a class="podium-player podium-'+rank+'" href="player.html?id='+encodeURIComponent(p.id)+'">'+
       '<div class="podium-crown">'+(rank===1?"👑":rank===2?"🥈":"🥉")+'</div>'+
       avatar(p,"podium-avatar")+
       '<b>'+esc(p.full_name)+'</b><small>'+esc(p.club_name||"Tự do")+'</small>'+
       '<strong>'+Number(p.rating||0).toFixed(3)+'</strong><span>điểm</span>'+
     '</a>';
   }).join(""):'<div class="app-empty-card"><span>📊</span><b>Chưa có dữ liệu ranking</b><small>Rating VĐV sẽ xuất hiện tại đây.</small></div>';
 }
 $("#rankingRows").innerHTML=rows.map((p,i)=>
   '<div class="ranking-app-row">'+
     '<b class="ranking-app-rank">'+(i+1)+'</b>'+
     '<a class="ranking-app-player" href="player.html?id='+encodeURIComponent(p.id)+'">'+avatar(p)+
       '<span><b>'+esc(p.full_name)+'</b><small>'+esc(p.club_name||p.nickname||"Tự do")+'</small></span></a>'+
     '<strong class="ranking-app-rating">'+Number(p.rating||0).toFixed(3)+'</strong>'+
   '</div>'
 ).join("")||'<div class="app-empty-card"><span>🔎</span><b>Không có VĐV phù hợp</b><small>Thử từ khóa hoặc CLB khác.</small></div>';
}
async function load(){
 players=await PickleAPI.publicPlayers();
 const clubs=[...new Set(players.map(p=>p.club_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi"));
 $("#rankClub").innerHTML='<option value="">Tất cả CLB</option>'+clubs.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join("");
 render();
}
load().catch(console.error);
$("#rankSearch").oninput=render;$("#rankClub").onchange=render;
if(window.io){const s=io();s.on("public:state",()=>load().catch(()=>{}))}