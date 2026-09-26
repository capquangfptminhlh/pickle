let players=[],mode="player";const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const initials=name=>(name||"P").split(/\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase();
const avatar=(p,cls="ranking-avatar")=>p.avatar_url
 ? '<img class="'+cls+'" src="'+esc(p.avatar_url)+'" alt="'+esc(p.full_name)+'">'
 : '<span class="'+cls+' ranking-avatar-fallback">'+esc(initials(p.full_name))+'</span>';
const avg=arr=>arr.length?arr.reduce((n,p)=>n+Number(p.rating||0),0)/arr.length:0;
function aggregates(key,labelFallback){
 const map=new Map();
 for(const p of players){
   const label=(p[key]||"").trim()||labelFallback;
   if(!map.has(label))map.set(label,[]);
   map.get(label).push(p);
 }
 return [...map.entries()].map(([name,members])=>({id:name,name,members:members.length,rating:avg(members),city:key==="club_name"?(members.find(x=>x.club_city)?.club_city||""):""}))
   .sort((a,b)=>b.rating-a.rating||b.members-a.members||a.name.localeCompare(b.name,"vi"));
}
function currentRows(){
 const q=($("#rankSearch").value||"").trim().toLocaleLowerCase("vi");
 const club=$("#rankClub").value;
 if(mode==="club")return aggregates("club_name","Tự do").filter(x=>!q||x.name.toLocaleLowerCase("vi").includes(q));
 if(mode==="area")return aggregates("club_city","Chưa cập nhật khu vực").filter(x=>!q||x.name.toLocaleLowerCase("vi").includes(q));
 return players
   .filter(p=>(!club||p.club_name===club)&&(!q||(p.full_name+" "+(p.nickname||"")+" "+(p.club_name||"")+" "+(p.club_city||"")).toLocaleLowerCase("vi").includes(q)))
   .sort((a,b)=>Number(b.rating||0)-Number(a.rating||0)||a.full_name.localeCompare(b.full_name,"vi"));
}
function podiumCard(item,index){
 const rank=index+1,crown=rank===1?"👑":rank===2?"🥈":"🥉";
 if(mode==="player")return '<a class="podium-player podium-'+rank+'" href="player.html?id='+encodeURIComponent(item.id)+'"><div class="podium-crown">'+crown+'</div>'+avatar(item,"podium-avatar")+'<b>'+esc(item.full_name)+'</b><small>'+esc(item.club_name||"Tự do")+'</small><strong>'+Number(item.rating||0).toFixed(3)+'</strong><span>điểm</span></a>';
 return '<div class="podium-player podium-'+rank+'"><div class="podium-crown">'+crown+'</div><span class="podium-avatar ranking-avatar-fallback">'+esc(initials(item.name))+'</span><b>'+esc(item.name)+'</b><small>'+item.members+' VĐV'+(item.city?' • '+esc(item.city):'')+'</small><strong>'+Number(item.rating||0).toFixed(3)+'</strong><span>rating TB</span></div>';
}
function render(){
 const rows=currentRows();
 $$(".ranking-tabs button").forEach(b=>b.classList.toggle("active",b.dataset.rankMode===mode));
 $("#rankClub").hidden=mode!=="player";
 $("#rankSearch").placeholder=mode==="player"?"Tìm VĐV hoặc CLB...":mode==="club"?"Tìm CLB...":"Tìm khu vực...";
 const head=$(".ranking-list-head");if(head)head.innerHTML='<span>Hạng</span><span>'+(mode==="player"?"VĐV":mode==="club"?"CLB":"Khu vực")+'</span><span>Rating</span>';
 const top=rows.slice(0,3),order=[1,0,2];
 $("#rankingPodium").innerHTML=top.length?order.filter(i=>top[i]).map(i=>podiumCard(top[i],i)).join(""):'<div class="app-empty-card"><span>📊</span><b>Chưa có dữ liệu ranking</b><small>Dữ liệu thật sẽ xuất hiện khi có VĐV được công khai.</small></div>';
 $("#rankingRows").innerHTML=rows.map((item,i)=>{
   if(mode==="player")return '<div class="ranking-app-row"><b class="ranking-app-rank">'+(i+1)+'</b><a class="ranking-app-player" href="player.html?id='+encodeURIComponent(item.id)+'">'+avatar(item)+'<span><b>'+esc(item.full_name)+'</b><small>'+esc(item.club_name||item.nickname||"Tự do")+(item.club_city?' • '+esc(item.club_city):'')+'</small></span></a><strong class="ranking-app-rating">'+Number(item.rating||0).toFixed(3)+'</strong></div>';
   return '<div class="ranking-app-row"><b class="ranking-app-rank">'+(i+1)+'</b><div class="ranking-app-player"><span class="ranking-avatar ranking-avatar-fallback">'+esc(initials(item.name))+'</span><span><b>'+esc(item.name)+'</b><small>'+item.members+' VĐV'+(item.city?' • '+esc(item.city):'')+'</small></span></div><strong class="ranking-app-rating">'+Number(item.rating||0).toFixed(3)+'</strong></div>';
 }).join("")||'<div class="app-empty-card"><span>🔎</span><b>Không có dữ liệu phù hợp</b><small>Thử từ khóa khác.</small></div>';
}
async function load(){
 players=await PickleAPI.publicPlayers();
 const clubs=[...new Set(players.map(p=>p.club_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi"));
 $("#rankClub").innerHTML='<option value="">Tất cả CLB</option>'+clubs.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join("");
 render();
}
$$(".ranking-tabs button").forEach(b=>b.onclick=()=>{mode=b.dataset.rankMode||"player";$("#rankSearch").value="";$("#rankClub").value="";render()});
$("#rankSearch").oninput=render;$("#rankClub").onchange=render;
load().catch(console.error);
if(window.io){const s=io();s.on("public:state",()=>load().catch(()=>{}))}