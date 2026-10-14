let players=[],mode="player",hasRendered=false,previousLeader=null,committedKeys=new Set();const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const initials=name=>(name||"P").split(/\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase();
const avatar=(p,cls="ranking-avatar")=>p.avatar_url
 ? '<img class="'+cls+'" src="'+esc(p.avatar_url)+'" alt="'+esc(p.full_name)+'"'+(cls==="podium-avatar"?"":' loading="lazy"')+' decoding="async">'
 : '<span class="'+cls+' ranking-avatar-fallback">'+esc(initials(p.full_name))+'</span>';
const avg=arr=>arr.length?arr.reduce((n,p)=>n+Number(p.rating||0),0)/arr.length:0;
const fmtRating=v=>{const n=Number(v||0),r=Math.round(n*100)/100;return r%1===0?r.toFixed(1):r.toString()};
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
 const gender=$("#rankGender")?.value;
 if(mode==="club")return aggregates("club_name","Tự do").filter(x=>!q||x.name.toLocaleLowerCase("vi").includes(q));
 if(mode==="area")return aggregates("club_city","Chưa cập nhật khu vực").filter(x=>!q||x.name.toLocaleLowerCase("vi").includes(q));
 return players
   .filter(p=>(!club||p.club_name===club)&&(!gender||p.gender===gender)&&(!q||(p.full_name+" "+(p.nickname||"")+" "+(p.club_name||"")+" "+(p.club_city||"")).toLocaleLowerCase("vi").includes(q)))
   .sort((a,b)=>Number(b.rating||0)-Number(a.rating||0)||a.full_name.localeCompare(b.full_name,"vi"));
}
// Competition ranking ("1-1-3"): equal ratings share a place, so ties are
// never broken by name order.
const ranksOf=rows=>rows.map(r=>1+rows.filter(x=>Number(x.rating||0)>Number(r.rating||0)).length);
const tier=p=>p.skillLevel||p.skill_level||"";
const itemKey=item=>mode+":"+String(item.id||item.name||"");
function podiumCard(item,index,rank=index+1){
 const crown=rank===1?"👑":rank===2?"🥈":"🥉";
 const gTag=item.gender==="female"?" • Nữ":item.gender==="male"?" • Nam":"";
 const key=esc(itemKey(item));
 if(mode==="player")return '<a data-motion-key="'+key+'" class="podium-player podium-'+(index+1)+'" href="player.html?id='+encodeURIComponent(item.id)+'"><div class="podium-crown">'+crown+'</div>'+avatar(item,"podium-avatar")+'<b>'+esc(item.full_name)+'</b><small>'+esc(item.club_name||"Tự do")+gTag+(tier(item)?' • Trình '+esc(tier(item)):'')+'</small><strong>'+fmtRating(item.rating)+'</strong><span>điểm</span></a>';
 return '<div data-motion-key="'+key+'" class="podium-player podium-'+(index+1)+'"><div class="podium-crown">'+crown+'</div><span class="podium-avatar ranking-avatar-fallback">'+esc(initials(item.name))+'</span><b>'+esc(item.name)+'</b><small>'+item.members+' VĐV'+(item.city?' • '+esc(item.city):'')+'</small><strong>'+fmtRating(item.rating)+'</strong><span>rating TB</span></div>';
}
function render(confirmed=false){
 const rows=currentRows();
 const rowHost=$("#rankingRows"),oldRows=[...rowHost.querySelectorAll("[data-motion-key]")],before=new Map(oldRows.map(el=>[el.dataset.motionKey,el.getBoundingClientRect()]));
 const oldOrder=oldRows.map(el=>el.dataset.motionKey),oldRatings=new Map(oldRows.map(el=>[el.dataset.motionKey,Number.parseFloat(el.querySelector(".ranking-app-rating")?.textContent)||0]));
 const keys=rows.map(itemKey),leader=keys[0]||null;
 $$(".ranking-tabs button").forEach(b=>{const active=b.dataset.rankMode===mode;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active))});
 $("#rankClub").hidden=mode!=="player";
 if($("#rankGender"))$("#rankGender").hidden=mode!=="player";
 $("#rankSearch").placeholder=mode==="player"?"Tìm VĐV hoặc CLB...":mode==="club"?"Tìm CLB...":"Tìm khu vực...";
 const head=$(".ranking-list-head");if(head)head.innerHTML='<span>Hạng</span><span>'+(mode==="player"?"VĐV":mode==="club"?"CLB":"Khu vực")+'</span><span>Rating</span>';
 const ranks=ranksOf(rows),top=rows.slice(0,3),order=[1,0,2];
 // A podium only makes sense when places 1-3 are actually separated.
 const tiedTop=top.length>1&&ranks[1]===ranks[0]||top.length>2&&ranks[2]===ranks[1];
 $("#rankingPodium").innerHTML=!top.length
   ?'<div class="app-empty-card"><b>Chưa có dữ liệu ranking</b><small>Dữ liệu thật sẽ xuất hiện khi có VĐV được công khai.</small></div>'
   :tiedTop
     ?'<div class="app-empty-card ranking-tie-note"><b>Chưa phân định Top 3</b><small>Các VĐV dẫn đầu đang bằng điểm. Thứ hạng sẽ tách ra khi có kết quả thi đấu.</small></div>'
     :order.filter(i=>top[i]).map(i=>podiumCard(top[i],i,ranks[i])).join("");
 $("#rankingRows").innerHTML=rows.map((item,i)=>{
   const gTag=item.gender==="female"?" • Nữ":item.gender==="male"?" • Nam":"";
   if(mode==="player")return '<div data-motion-key="'+esc(keys[i])+'" class="ranking-app-row"><b class="ranking-app-rank">'+ranks[i]+'</b><a class="ranking-app-player" href="player.html?id='+encodeURIComponent(item.id)+'">'+avatar(item)+'<span><b>'+esc(item.full_name)+'</b><small>'+esc(item.club_name||item.nickname||"Tự do")+gTag+(tier(item)?' • Trình '+esc(tier(item)):'')+(item.club_city?' • '+esc(item.club_city):'')+'</small></span></a><strong class="ranking-app-rating">'+fmtRating(item.rating)+'</strong></div>';
   return '<div data-motion-key="'+esc(keys[i])+'" class="ranking-app-row"><b class="ranking-app-rank">'+ranks[i]+'</b><div class="ranking-app-player"><span class="ranking-avatar ranking-avatar-fallback">'+esc(initials(item.name))+'</span><span><b>'+esc(item.name)+'</b><small>'+item.members+' VĐV'+(item.city?' • '+esc(item.city):'')+'</small></span></div><strong class="ranking-app-rating">'+fmtRating(item.rating)+'</strong></div>';
 }).join("")||'<div class="app-empty-card"><b>Không có dữ liệu phù hợp</b><small>Thử từ khóa khác.</small></div>';
 const rendered=[...rowHost.querySelectorAll("[data-motion-key]")],afterOrder=rendered.map(el=>el.dataset.motionKey);
 const common=key=>oldOrder.includes(key)&&afterOrder.includes(key);
 const beforeCommon=oldOrder.filter(common),afterCommon=afterOrder.filter(common);
 if(hasRendered&&confirmed&&beforeCommon.length>1&&beforeCommon.some((key,i)=>key!==afterCommon[i])){
   const positions=new Map(rendered.map(el=>[el,before.get(el.dataset.motionKey)]));
   window.PickleMotion?.flip?.(positions,rendered,"ranking-order");
 }
 const newRows=rendered.filter(el=>!committedKeys.has(el.dataset.motionKey));rendered.forEach(el=>{el.dataset.motionReady="1";el.dataset.motionEntered="1"});
 if(newRows.length)window.PickleMotion?.entrance?.(newRows,{key:"ranking-rows-"+mode+"-"+newRows.map(el=>el.dataset.motionKey).join("|")});
 for(const row of rendered){
   const key=row.dataset.motionKey,rating=Number(rows.find(item=>itemKey(item)===key)?.rating||0),old=oldRatings.get(key);
   if(confirmed&&old!==undefined&&old!==rating){
     const value=row.querySelector(".ranking-app-rating");
     window.PickleMotion?.count?.(value,old,rating);
     setTimeout(()=>{if(value?.isConnected)value.textContent=fmtRating(rating)},520);
   }
   committedKeys.add(key);
 }
 if(hasRendered&&confirmed&&leader&&previousLeader&&leader!==previousLeader){
   const leaderRow=rendered.find(el=>el.dataset.motionKey===leader);
   const leaderPodium=[...document.querySelectorAll("#rankingPodium [data-motion-key]")].find(el=>el.dataset.motionKey===leader);
   const promotionTarget=leaderPodium||leaderRow;
   if(promotionTarget){promotionTarget.dataset.motionState="leader";setTimeout(()=>{if(promotionTarget.dataset.motionState==="leader")delete promotionTarget.dataset.motionState},1000)}
 }
 previousLeader=leader;hasRendered=true;
}
async function load(){
 try{
  players=await PickleAPI.publicPlayers();
 }catch(e){
  players=[];
 }
 if(!players||!players.length){
  const localState=JSON.parse(localStorage.getItem("pickle-local-state-v1")||"null");
  if(localState?.players?.length){
   players=localState.players;
  }
 }
 const clubs=[...new Set(players.map(p=>p.club_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi"));
 $("#rankClub").innerHTML='<option value="">Tất cả CLB</option>'+clubs.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join("");
 render(true);
}
$$(".ranking-tabs button").forEach(b=>b.onclick=()=>{mode=b.dataset.rankMode||"player";$("#rankSearch").value="";$("#rankClub").value="";if($("#rankGender"))$("#rankGender").value="";render()});
$("#rankSearch").oninput=render;$("#rankClub").onchange=render;
if($("#rankGender"))$("#rankGender").onchange=render;
load().catch(console.error);
if(window.io){const s=io();s.on("public:state",()=>load().catch(()=>{}))}
