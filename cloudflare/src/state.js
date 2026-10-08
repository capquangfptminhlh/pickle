import {bool} from "./util.js";
import {rankGroupStandings} from "../../shared/standings.js";

async function rows(env,sql,...args){
  const r=await env.DB.prepare(sql).bind(...args).all();
  return r.results||[];
}
function fmtTime(value){
  if(!value)return "—";
  try{return new Date(value).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Ho_Chi_Minh"})}catch{return "—"}
}
function fmtDate(value){
  if(!value)return "Chưa chốt";
  try{return new Date(value).toLocaleDateString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}catch{return "Chưa chốt"}
}
function publicStatus(s){return ["scheduled","ready"].includes(s)?"wait":s==="completed"?"done":s}

export async function loadState(env,{publicOnly=false}={}){
  const tournamentsRaw=await rows(env,
    publicOnly
      ?"SELECT * FROM tournaments WHERE public_visible=1 ORDER BY is_featured DESC, featured_rank DESC, start_at DESC"
      :"SELECT * FROM tournaments ORDER BY is_featured DESC, featured_rank DESC, start_at DESC"
  );
  const tournaments=tournamentsRaw.map(t=>({
    id:t.id,name:t.name,date:fmtDate(t.start_at),startAt:t.start_at,endAt:t.end_at,
    venue:t.venue_name||"Chưa chốt",format:"Tournament",
    status:t.status==="registration"?"open":t.status,
    publicVisible:bool(t.public_visible),teams:0,
    isFeatured:bool(t.is_featured),featuredRank:Number(t.featured_rank||0),
    sponsorPackage:t.sponsor_package||"free",posterUrl:t.poster_url||null,
    prizePool:t.prize_pool||null,entryFee:t.entry_fee||null,
    contactName:t.contact_name||null,contactPhone:t.contact_phone||null
  }));
  const tournamentIds=new Set(tournaments.map(t=>t.id));
  if(!tournamentIds.size)return {tournaments:[],divisions:[],courts:[],teams:[],players:[],teamPlayers:{},matches:[],audit:[]};

  const divisionsRaw=(await rows(env,"SELECT * FROM divisions ORDER BY rowid"))
    .filter(d=>tournamentIds.has(d.tournament_id)&&(publicOnly?bool(d.active):true));
  const divisionIds=new Set(divisionsRaw.map(d=>d.id));
  for(const t of tournaments){
    const names=divisionsRaw.filter(d=>d.tournament_id===t.id).map(d=>d.name);
    t.format=names.join(" • ")||"Tournament";
  }

  const teamsRaw=(await rows(env,
    "SELECT t.*,c.name AS club_name FROM teams t LEFT JOIN clubs c ON c.id=t.club_id ORDER BY t.group_code,t.seed,t.name"
  )).filter(t=>divisionIds.has(t.division_id)&&(publicOnly?t.status==="active":true));
  const teamIds=new Set(teamsRaw.map(t=>t.id));

  const rosterRaw=(await rows(env,
    "SELECT tp.team_id,p.id,p.full_name,p.nickname,p.gender,p.rating,p.skill_level,p.avatar_url,p.club_id,p.phone,p.active,c.name AS club_name FROM team_players tp JOIN players p ON p.id=tp.player_id LEFT JOIN clubs c ON c.id=p.club_id ORDER BY tp.team_id,p.full_name"
  )).filter(r=>teamIds.has(r.team_id)&&(publicOnly?bool(r.active):true));
  const teamPlayers={},playerMap=new Map();
  for(const r of rosterRaw){
    if(!teamPlayers[r.team_id])teamPlayers[r.team_id]=[];
    teamPlayers[r.team_id].push(r.id);
    if(!playerMap.has(r.id))playerMap.set(r.id,{
      id:r.id,full_name:r.full_name,nickname:r.nickname||"",gender:r.gender||"other",
      rating:Number(r.rating||0),skillLevel:r.skill_level||"B",avatar_url:r.avatar_url||"",club_id:r.club_id||null,
      club_name:r.club_name||"",phone:publicOnly?undefined:(r.phone||""),active:bool(r.active)
    });
  }
  if(!publicOnly){
    const allPlayers=await rows(env,
      "SELECT p.*,c.name AS club_name FROM players p LEFT JOIN clubs c ON c.id=p.club_id ORDER BY p.full_name"
    );
    for(const p of allPlayers){
      if(!playerMap.has(p.id))playerMap.set(p.id,{
        id:p.id,full_name:p.full_name,nickname:p.nickname||"",gender:p.gender||"other",
        rating:Number(p.rating||0),skillLevel:p.skill_level||"B",avatar_url:p.avatar_url||"",club_id:p.club_id||null,
        club_name:p.club_name||"",phone:p.phone||"",active:bool(p.active)
      });
    }
  }
  const players=[...playerMap.values()];

  const courtsRaw=(await rows(env,"SELECT * FROM courts ORDER BY sort_order,name"))
    .filter(c=>tournamentIds.has(c.tournament_id)&&(publicOnly?bool(c.active):true));
  const courtIndex={};
  courtsRaw.forEach((c,i)=>courtIndex[c.id]=c.sort_order||i+1);

  const matchesRaw=(await rows(env,
    "SELECT m.*,c.name AS court_name FROM matches m LEFT JOIN courts c ON c.id=m.court_id ORDER BY m.scheduled_at,m.created_at"
  )).filter(m=>divisionIds.has(m.division_id)&&(publicOnly?m.status!=="cancelled":true));
  const matchIds=new Set(matchesRaw.map(m=>m.id));
  const setsRaw=(await rows(env,"SELECT * FROM match_sets ORDER BY match_id,set_no")).filter(s=>matchIds.has(s.match_id));
  const setMap=new Map();
  for(const s of setsRaw){
    if(!setMap.has(s.match_id))setMap.set(s.match_id,[]);
    setMap.get(s.match_id).push([Number(s.score_a||0),Number(s.score_b||0)]);
  }

  const stats=new Map(teamsRaw.map(t=>[t.id,{w:0,l:0,sw:0,sl:0,pf:0,pa:0}]));
  const activeTeamIds=new Set(teamsRaw.filter(t=>t.status==="active").map(t=>t.id));
  const groupMatch=m=>!m.bracket_slot&&(String(m.stage||"").startsWith("Bảng")||/bảng|group|vòng bảng/i.test(String(m.stage||""))||!/chung kết|bán kết|tứ kết/i.test(String(m.stage||"")));
  for(const m of matchesRaw.filter(x=>x.status==="completed"&&groupMatch(x)&&x.winner_team_id&&activeTeamIds.has(x.team_a_id)&&activeTeamIds.has(x.team_b_id))){
    const ms=setMap.get(m.id)||[];let ap=0,bp=0,asw=0,bsw=0;
    for(const [a,b] of ms){ap+=a;bp+=b;if(a>b)asw++;else if(b>a)bsw++}
    const sa=stats.get(m.team_a_id),sb=stats.get(m.team_b_id);
    if(sa){sa.pf+=ap;sa.pa+=bp;sa.sw+=asw;sa.sl+=bsw;m.winner_team_id===m.team_a_id?sa.w++:sa.l++}
    if(sb){sb.pf+=bp;sb.pa+=ap;sb.sw+=bsw;sb.sl+=asw;m.winner_team_id===m.team_b_id?sb.w++:sb.l++}
  }
  const teams=teamsRaw.map(t=>{
    const s=stats.get(t.id)||{w:0,l:0,sw:0,sl:0,pf:0,pa:0};
    return {id:t.id,divisionId:t.division_id,name:t.name,club:t.club_name||"Tự do",clubId:t.club_id||null,
      group:t.group_code||"",seed:t.seed,status:t.status,...s,diffSet:s.sw-s.sl,diffPts:s.pf-s.pa};
  });

  const matches=matchesRaw.map(m=>({
    id:m.id,divisionId:m.division_id,stage:m.stage,court:courtIndex[m.court_id]||m.court_name||"—",
    time:fmtTime(m.scheduled_at),a:m.team_a_id||"TBD",b:m.team_b_id||"TBD",
    status:publicStatus(m.status),sets:setMap.get(m.id)||[],
    current:[Number(m.current_score_a||0),Number(m.current_score_b||0)],
    winner:m.winner_team_id||null,version:Number(m.version||1),refereeId:m.referee_user_id||null,
    courtId:m.court_id||null,resultReason:m.result_reason||null,resultNote:m.result_note||null,
    bracketSlot:m.bracket_slot||null,scheduledAt:m.scheduled_at||null,startedAt:m.started_at||null,completedAt:m.completed_at||null,
    courtState:m.status==="completed"?"done":(m.court_state||"scheduled"),servingSide:m.serving_side||null,serverNumber:Number(m.server_number||2),
    timeouts:{A:Number(m.timeout_a||0),B:Number(m.timeout_b||0)},medicalTimeouts:{A:Number(m.medical_timeout_a||0),B:Number(m.medical_timeout_b||0)},
    calledAt:m.called_at||null,onDeckAt:m.on_deck_at||null,warmupAt:m.warmup_at||null
  }));

  for(const division of divisionsRaw){
    const groupNames=[...new Set(teams.filter(t=>t.divisionId===division.id&&t.status==="active").map(t=>t.group||"A"))];
    for(const group of groupNames){
      const ranked=rankGroupStandings(
        teams.filter(t=>t.divisionId===division.id&&t.status==="active"&&(t.group||"A")===group),
        matches.filter(m=>m.divisionId===division.id)
      );
      ranked.forEach((team,index)=>{team.standingRank=index+1});
    }
  }

  let audit=[];
  if(!publicOnly){
    audit=(await rows(env,
      "SELECT a.*,u.display_name FROM audit_logs a LEFT JOIN app_users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 100"
    )).map(a=>({time:fmtTime(a.created_at),user:a.display_name||"System",action:a.action,detail:a.reason||a.entity_type}));
  }

  for(const t of tournaments){
    const ids=new Set(divisionsRaw.filter(d=>d.tournament_id===t.id).map(d=>d.id));
    t.teams=teamsRaw.filter(x=>ids.has(x.division_id)).length;
  }

  return {
    tournaments,
    divisions:divisionsRaw.map(d=>({
      id:d.id,tournamentId:d.tournament_id,name:d.name,eventType:d.event_type,format:d.format,
      bestOf:Number(d.best_of||3),pointsToWin:Number(d.points_to_win||11),winByTwo:bool(d.win_by_two),
      advanceCount:Number(d.advance_count||2),tieBreakMode:d.tie_break_mode||"head_to_head",scoringMode:d.scoring_mode||"side_out",
      minimumRestMinutes:Number(d.minimum_rest_minutes??15),matchSlotMinutes:Number(d.match_slot_minutes??20),
      relaySegmentPoints:Number(d.relay_segment_points||0),relayTeamSize:Number(d.relay_team_size||0),finalPointOnServe:bool(d.final_point_on_serve),thirdPlaceMatch:bool(d.third_place_match),active:bool(d.active)
    })),
    courts:courtsRaw.map(c=>({id:c.id,tournamentId:c.tournament_id,name:c.name,sortOrder:Number(c.sort_order||0),active:bool(c.active)})),
    teams,players,teamPlayers,matches,audit
  };
}

export async function loadAdminState(env,user){
  if(user.role==="super_admin")return loadState(env);
  const state=await loadState(env);
  if(user.role==="organizer"){
    const owned=(await rows(env,
      "SELECT id FROM tournaments WHERE owner_user_id=? OR (? IS NOT NULL AND id=?)",
      user.id,user.tournamentScope||null,user.tournamentScope||null
    )).map(x=>x.id);
    return filterState(state,new Set(owned));
  }
  if(user.role==="referee"){
    const allowedDivisions=new Set(state.divisions.filter(d=>!user.tournamentScope||d.tournamentId===user.tournamentScope).map(d=>d.id));
    const matches=state.matches.filter(m=>m.refereeId===user.id&&allowedDivisions.has(m.divisionId));
    const divisionIds=new Set(matches.map(m=>m.divisionId));
    const teamIds=new Set(matches.flatMap(m=>[m.a,m.b]).filter(x=>x&&x!=="TBD"));
    const tournamentIds=new Set(state.divisions.filter(d=>divisionIds.has(d.id)).map(d=>d.tournamentId));
    const teamPlayers={},playerIds=new Set();
    for(const id of teamIds){
      const ids=state.teamPlayers[id]||[];teamPlayers[id]=ids;ids.forEach(x=>playerIds.add(x));
    }
    return {
      tournaments:state.tournaments.filter(t=>tournamentIds.has(t.id)),
      divisions:state.divisions.filter(d=>divisionIds.has(d.id)),
      courts:state.courts.filter(c=>tournamentIds.has(c.tournamentId)),
      teams:state.teams.filter(t=>teamIds.has(t.id)),
      players:state.players.filter(p=>playerIds.has(p.id)).map(p=>({...p,phone:""})),
      teamPlayers,matches,audit:[]
    };
  }
  return loadState(env,{publicOnly:true});
}

function filterState(state,allowed){
  const divisions=state.divisions.filter(d=>allowed.has(d.tournamentId));
  const divisionIds=new Set(divisions.map(d=>d.id));
  const teams=state.teams.filter(t=>divisionIds.has(t.divisionId));
  const teamIds=new Set(teams.map(t=>t.id));
  const playerIds=new Set(),teamPlayers={};
  for(const tid of teamIds){
    const ids=state.teamPlayers[tid]||[];teamPlayers[tid]=ids;ids.forEach(id=>playerIds.add(id));
  }
  return {
    tournaments:state.tournaments.filter(t=>allowed.has(t.id)),
    divisions,courts:state.courts.filter(c=>allowed.has(c.tournamentId)),teams,
    players:state.players.filter(p=>playerIds.has(p.id)),teamPlayers,
    matches:state.matches.filter(m=>divisionIds.has(m.divisionId)),audit:[]
  };
}

export async function listPublicPlayers(env){
  const rs=await rows(env,
    "SELECT p.id,p.full_name,p.nickname,p.gender,p.rating,p.skill_level,p.avatar_url,c.name AS club_name,c.city AS club_city FROM players p LEFT JOIN clubs c ON c.id=p.club_id WHERE p.active=1 ORDER BY p.rating DESC,p.full_name"
  );
  return rs.map(p=>({
    id:p.id,full_name:p.full_name,nickname:p.nickname||"",gender:p.gender||"other",
    rating:Number(p.rating||0),skillLevel:p.skill_level||"B",avatar_url:p.avatar_url||"",club_name:p.club_name||"",club_city:p.club_city||""
  }));
}

export async function loadPublicPlayer(env,id){
  const p=await env.DB.prepare(
    "SELECT p.*,c.name AS club_name,c.city AS club_city FROM players p LEFT JOIN clubs c ON c.id=p.club_id WHERE p.id=? AND p.active=1"
  ).bind(id).first();
  if(!p)return null;
  const teamRows=await rows(env,
    "SELECT t.id,t.id AS team_id,t.name AS team_name,d.name AS division_name,tr.id AS tournament_id,tr.name AS tournament_name,tr.start_at FROM team_players tp JOIN teams t ON t.id=tp.team_id JOIN divisions d ON d.id=t.division_id JOIN tournaments tr ON tr.id=d.tournament_id WHERE tp.player_id=? AND tr.public_visible=1 AND d.active=1 AND t.status='active' ORDER BY tr.start_at DESC",id
  );
  const teamIds=teamRows.map(x=>x.team_id);
  const visibleMatch=" JOIN divisions d ON d.id=m.division_id JOIN tournaments tr ON tr.id=d.tournament_id ";
  const membership=" WHERE tr.public_visible=1 AND d.active=1 AND m.status<>'cancelled' AND EXISTS (SELECT 1 FROM team_players tp JOIN teams t ON t.id=tp.team_id WHERE tp.player_id=? AND t.status='active' AND t.division_id=m.division_id AND (t.id=m.team_a_id OR t.id=m.team_b_id)) ";
  const matchRows=teamIds.length?await rows(env,
    "SELECT m.*,d.name AS division_name,tr.name AS tournament_name,tr.id AS tournament_id,ta.name AS team_a_name,tb.name AS team_b_name FROM matches m"+visibleMatch+"LEFT JOIN teams ta ON ta.id=m.team_a_id LEFT JOIN teams tb ON tb.id=m.team_b_id"+membership+"ORDER BY COALESCE(m.completed_at,m.scheduled_at,m.created_at) DESC",id):[];
  const setMap=new Map();
  const setRows=teamIds.length?await rows(env,"SELECT s.match_id,s.score_a,s.score_b FROM match_sets s JOIN matches m ON m.id=s.match_id"+visibleMatch+membership+"ORDER BY s.match_id,s.set_no",id):[];
  for(const s of setRows){
    if(!setMap.has(s.match_id))setMap.set(s.match_id,[]);
    setMap.get(s.match_id).push([Number(s.score_a),Number(s.score_b)]);
  }
  let wins=0,losses=0,pointsFor=0,pointsAgainst=0;
  const matches=matchRows.map(m=>{
    const mine=teamIds.includes(m.team_a_id)?m.team_a_id:m.team_b_id,side=mine===m.team_a_id?"A":"B",sets=setMap.get(m.id)||[];
    const won=m.status==="completed"&&m.winner_team_id===mine,lost=Boolean(m.status==="completed"&&m.winner_team_id&&m.winner_team_id!==mine);
    if(won)wins++;if(lost)losses++;
    const myPoints=sets.reduce((n,s)=>n+s[side==="A"?0:1],0),oppPoints=sets.reduce((n,s)=>n+s[side==="A"?1:0],0);
    pointsFor+=myPoints;pointsAgainst+=oppPoints;
    return {id:m.id,tournamentId:m.tournament_id,tournamentName:m.tournament_name,divisionName:m.division_name,stage:m.stage,status:publicStatus(m.status),scheduledAt:m.scheduled_at,completedAt:m.completed_at,
      teamAId:m.team_a_id,teamBId:m.team_b_id,teamAName:m.team_a_name||"TBD",teamBName:m.team_b_name||"TBD",myTeamId:mine,mySide:side,winnerTeamId:m.winner_team_id,won,lost,sets,myPoints,oppPoints};
  });
  let partners=[];
  if(teamIds.length){
    partners=await rows(env,"SELECT DISTINCT p.id,p.full_name,p.nickname,p.avatar_url,p.rating,c.name AS club_name FROM team_players tp JOIN players p ON p.id=tp.player_id LEFT JOIN clubs c ON c.id=p.club_id JOIN teams t ON t.id=tp.team_id JOIN divisions d ON d.id=t.division_id JOIN tournaments tr ON tr.id=d.tournament_id WHERE p.id<>? AND p.active=1 AND t.status='active' AND d.active=1 AND tr.public_visible=1 AND EXISTS(SELECT 1 FROM team_players mine WHERE mine.team_id=tp.team_id AND mine.player_id=?) ORDER BY p.full_name",id,id);
  }
  const ratingHistory=await rows(env,"SELECT before_rating,delta,after_rating,reason,created_at FROM rating_history WHERE player_id=? ORDER BY created_at DESC LIMIT 100",id);
  return {
    profile:{id:p.id,fullName:p.full_name,full_name:p.full_name,nickname:p.nickname||"",gender:p.gender||"other",rating:Number(p.rating||0),skillLevel:p.skill_level||"B",avatarUrl:p.avatar_url||"",avatar_url:p.avatar_url||"",clubName:p.club_name||"",club_name:p.club_name||"",clubCity:p.club_city||"",club_city:p.club_city||""},
    stats:{wins,losses,matches:wins+losses,winRate:wins+losses?Math.round(wins*1000/(wins+losses))/10:0,pointsFor,pointsAgainst,diff:pointsFor-pointsAgainst},
    teams:teamRows,partners:partners.map(x=>({...x,fullName:x.full_name,avatarUrl:x.avatar_url||""})),matches:matches.slice(0,100),ratingHistory
  };
}
