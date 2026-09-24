const $=s=>document.querySelector(s);
const id=new URLSearchParams(location.search).get('id');
const esc=s=>String(s??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[m]));
const fmtDate=v=>v?new Date(v).toLocaleDateString('vi-VN'):'—';
const initials=name=>(name||'P').split(/\s+/).slice(-2).map(x=>x[0]).join('').toUpperCase();
function avatarHtml(url,name,cls='mini-avatar'){return url?'<img class="'+cls+'" src="'+esc(url)+'" alt="'+esc(name)+'">':'<span class="'+cls+' avatar-fallback">'+esc(initials(name))+'</span>';}
function scoreLabel(m){return !m.sets?.length?'—':m.sets.map(s=>s.join('–')).join(' / ');}
function render(data){
  const p=data.profile,s=data.stats;
  document.title=p.fullName+' | Pickle Tour';
  $('#playerName').textContent=p.fullName;
  $('#playerMeta').textContent=[p.nickname?'"'+p.nickname+'"':null,p.clubName,p.clubCity].filter(Boolean).join(' • ')||'VĐV tự do';
  $('#playerRating').textContent=Number(p.rating||0).toFixed(3);
  const av=$('#playerAvatar');
  if(p.avatarUrl){av.innerHTML='<img src="'+esc(p.avatarUrl)+'" alt="'+esc(p.fullName)+'">';}else{av.textContent=initials(p.fullName);}
  $('#playerTags').innerHTML=(p.dominantHand?'<span class="badge blue">'+(p.dominantHand==='left'?'Tay trái':'Tay phải')+'</span>':'')+(p.gender?'<span class="badge done">'+(p.gender==='male'?'Nam':p.gender==='female'?'Nữ':'Khác')+'</span>':'');
  $('#playerStats').innerHTML=[['Trận',s.matches],['Thắng',s.wins],['Thua',s.losses],['Win rate',s.winRate+'%'],['Điểm ghi',s.pointsFor],['Hiệu số',(s.diff>0?'+':'')+s.diff]].map(x=>'<div class="player-stat"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join('');
  $('#matchHistory').innerHTML=data.matches.length?data.matches.map(m=>'<article class="player-match '+(m.won?'won':m.lost?'lost':'')+'"><div class="player-match-top"><div><b>'+esc(m.tournamentName)+'</b><small>'+esc(m.divisionName)+' • '+esc(m.stage)+'</small></div><span class="badge '+(m.won?'live':m.lost?'done':'wait')+'">'+(m.won?'THẮNG':m.lost?'THUA':m.status==='live'?'LIVE':'SẮP ĐẤU')+'</span></div><div class="player-score-line"><span>'+esc(m.teamAName)+'</span><b>'+(m.mySide==='A'?'Bạn':'')+'</b></div><div class="player-score-line"><span>'+esc(m.teamBName)+'</span><b>'+(m.mySide==='B'?'Bạn':'')+'</b></div><div class="player-match-score"><strong>'+esc(scoreLabel(m))+'</strong><span>'+m.myPoints+' – '+m.oppPoints+' điểm</span></div></article>').join(''):'<div class="empty">Chưa có lịch sử trận.</div>';
  $('#ratingHistory').innerHTML=data.ratingHistory.length?data.ratingHistory.map(r=>'<div class="rating-event"><div><b>'+Number(r.after_rating||0).toFixed(3)+'</b><small>'+fmtDate(r.created_at)+' • '+esc(r.reason||'Điều chỉnh rating')+'</small></div><span class="'+(Number(r.delta)>=0?'rating-up':'rating-down')+'">'+(Number(r.delta)>=0?'+':'')+Number(r.delta||0).toFixed(3)+'</span></div>').join(''):'<div class="empty">Chưa có lịch sử rating.</div>';
  $('#partners').innerHTML=data.partners.length?data.partners.map(x=>'<a class="partner-row" href="player.html?id='+encodeURIComponent(x.id)+'">'+avatarHtml(x.avatar_url,x.full_name)+'<span><b>'+esc(x.full_name)+'</b><small>'+esc(x.club_name||'Tự do')+'</small></span><strong>'+Number(x.rating||0).toFixed(3)+'</strong></a>').join(''):'<div class="empty">Chưa có partner.</div>';
  const seen=new Set();const teams=data.teams.filter(t=>!seen.has(t.tournament_id)&&(seen.add(t.tournament_id),true));
  $('#tournaments').innerHTML=teams.length?teams.map(t=>'<a class="tournament-row" href="tournament.html?id='+encodeURIComponent(t.tournament_id)+'"><div><b>'+esc(t.tournament_name)+'</b><small>'+fmtDate(t.start_at)+' • '+esc(t.division_name)+'</small></div><span>›</span></a>').join(''):'<div class="empty">Chưa có giải.</div>';
}
async function load(){if(!id){$('#playerName').textContent='Thiếu mã VĐV';return}try{render(await PickleAPI.publicPlayer(id))}catch(e){$('#playerName').textContent='Không tìm thấy VĐV';$('#playerMeta').textContent='Hồ sơ không tồn tại hoặc đã ẩn.'}}
load();
if(window.io){const socket=io();socket.on('public:state',()=>load().catch(()=>{}));}