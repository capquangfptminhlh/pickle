let players=[],mode="player";const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const initials=name=>(name||"P").split(/\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase();
const avatar=(p,cls="ranking-avatar")=>p.avatar_url
 ? '<img class="'+cls+'" src="'+esc(p.avatar_url)+'" alt="'+esc(p.full_name)+'">'
 : '<span class="'+cls+' ranking-avatar-fallback">'+esc(initials(p.full_name))+'</span>';
const avg=a=>a.length?a.reduce((n,x)=>n+Number(x.rating||0),0)/a.length:0;
function entities(){
  if(mode==="player"){
    const club=$("#rankClub").value;
    return players.filter(p=>!club||p.club_name===club).map(p=>({
      id:p.id,name:p.full_name,sub:p.club_name||"Tự do",rating:Number(p.rating||0),avatar_url:p.avatar_url,link:"player.html?id="+encodeURIComponent(p.id)
    }));
  }
  if(mode==="club"){
    const map=new Map();
    for(const p of players){const name=p.club_name||"Tự do";if(!map.has(name))map.set(name,[]);map.get(name).push(p)}
    return [...map.entries()].map(([name,list])=>({name,sub:list[0]?.club_city||"Chưa cập nhật khu vực",rating:avg(list),count:list.length}));
  }
  const map=new Map();
  for(const p of players){const name=p.club_city||"Chưa cập nhật";if(!map.has(name))map.set(name,[]);map.get(name).push(p)}
  return [...map.entries()].map(([name,list])=>({name,sub:[...new Set(list.map(x=>x.club_name).filter(Boolean))].length+" CLB",rating:avg(list),count:list.length}));
}
function iconFor(e,rank,cls){
  if(mode==="player")return avatar(e,cls);
  const symbol=mode==="club"?"CLB":"KV";
  return '<span class="'+cls+' ranking-avatar-fallback">'+symbol+'</span>';
}
function render(){
  const q=($("#rankSearch").value||"").toLocaleLowerCase("vi");
  const rows=entities().filter(e=>!q||(e.name+" "+e.sub).toLocaleLowerCase("vi").includes(q)).sort((a,b)=>b.rating-a.rating||eName(a).localeCompare(eName(b),"vi"));
  const podium=$("#rankingPodium"),order=[1,0,2];
  if(podium)podium.innerHTML=rows.length?order.filter(i=>rows[i]).map(i=>{
    const e=rows[i],rank=i+1,open=e.link?' href="'+e.link+'"':'';
    return '<a class="podium-player podium-'+rank+'"'+open+'>'+
      '<div class="podium-crown">'+(rank===1?"👑":rank===2?"🥈":"🥉")+'</div>'+
      iconFor(e,rank,"podium-avatar")+
      '<b>'+esc(e.name)+'</b><small>'+esc(e.sub)+'</small>'+
      '<strong>'+Number(e.rating||0).toFixed(3)+'</strong><span>'+((mode==="player")?"điểm":(e.count||0)+" VĐV")+'</span>'+
    '</a>';
  }).join(""):'<div class="app-empty-card"><span>📊</span><b>Chưa có dữ liệu ranking</b><small>Dữ liệu thật sẽ xuất hiện khi có VĐV/CLB phù hợp.</small></div>';
  $("#rankingRows").innerHTML=rows.map((e,i)=>{
    const inner=iconFor(e,i+1,"ranking-avatar")+'<span><b>'+esc(e.name)+'</b><small>'+esc(e.sub)+'</small></span>';
    return '<div class="ranking-app-row"><b class="ranking-app-rank">'+(i+1)+'</b>'+
      (e.link?'<a class="ranking-app-player" href="'+e.link+'">'+inner+'</a>':'<div class="ranking-app-player">'+inner+'</div>')+
      '<strong class="ranking-app-rating">'+Number(e.rating||0).toFixed(3)+'</strong></div>';
  }).join("")||'<div class="app-empty-card"><span>🔎</span><b>Không có kết quả phù hợp</b><small>Thử từ khóa hoặc bộ lọc khác.</small></div>';
}
function eName(e){return String(e.name||"")}
function syncMode(next){
  mode=next;
  $$(".ranking-tabs [data-rank-mode]").forEach(b=>b.classList.toggle("active",b.dataset.rankMode===mode));
  $("#rankClub").hidden=mode!=="player";
  $("#rankSearch").placeholder=mode==="player"?"Tìm VĐV hoặc CLB...":mode==="club"?"Tìm CLB...":"Tìm khu vực...";
  render();
}
async function load(){
  players=(await PickleAPI.publicPlayers()).filter(p=>p.active!==false);
  const clubs=[...new Set(players.map(p=>p.club_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi"));
  $("#rankClub").innerHTML='<option value="">Tất cả CLB</option>'+clubs.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join("");
  render();
}
load().catch(console.error);
$("#rankSearch").oninput=render;$("#rankClub").onchange=render;
$$(".ranking-tabs [data-rank-mode]").forEach(b=>b.onclick=()=>syncMode(b.dataset.rankMode));
if(window.io){const s=io();s.on("public:state",()=>load().catch(()=>{}))}