const rows=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results||[];
const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const error=(code,status)=>Object.assign(new Error(code),{status,code});
const minute=60000;
const restMinutes=value=>Math.max(0,Number.isFinite(Number(value))?Number(value):15);
const slotMinutes=value=>Math.max(5,Number.isFinite(Number(value))?Number(value):20);
const timestamp=value=>{const ms=Date.parse(value||'');return Number.isFinite(ms)?ms:null};

// Capture every input before the planning reads, then compare it again inside
// the write transaction. The draw signature alone omits schedule times, queue
// states, timing rules and player membership, all of which affect this plan.
const tournamentStateSql=`SELECT json_object(
  'tournament',json_array(t.id,t.start_at),
  'divisions',json((SELECT json_group_array(json_array(id,minimum_rest_minutes,match_slot_minutes,active))
    FROM (SELECT * FROM divisions WHERE tournament_id=t.id ORDER BY id))),
  'courts',json((SELECT json_group_array(json_array(id,name,sort_order,active))
    FROM (SELECT * FROM courts WHERE tournament_id=t.id ORDER BY id))),
  'teams',json((SELECT json_group_array(json_array(id,division_id,status))
    FROM (SELECT a.* FROM teams a JOIN divisions d ON d.id=a.division_id WHERE d.tournament_id=t.id ORDER BY a.id))),
  'rosters',json((SELECT json_group_array(json_array(team_id,player_id,slot_no))
    FROM (SELECT p.* FROM team_players p JOIN teams a ON a.id=p.team_id JOIN divisions d ON d.id=a.division_id
      WHERE d.tournament_id=t.id ORDER BY p.team_id,p.player_id))),
  'matches',json((SELECT json_group_array(json_array(id,division_id,version,status,court_id,scheduled_at,court_state,
      team_a_id,team_b_id,winner_team_id,current_score_a,current_score_b,started_at,completed_at,called_at,on_deck_at,warmup_at,created_at))
    FROM (SELECT m.* FROM matches m JOIN divisions d ON d.id=m.division_id WHERE d.tournament_id=t.id ORDER BY m.id))),
  'sets',json((SELECT json_group_array(json_array(id,match_id,set_no,score_a,score_b,completed))
    FROM (SELECT s.* FROM match_sets s JOIN matches m ON m.id=s.match_id JOIN divisions d ON d.id=m.division_id
      WHERE d.tournament_id=t.id ORDER BY s.id))),
  'events',json((SELECT json_group_array(json_array(id,match_id,undone_at))
    FROM (SELECT e.* FROM score_events e JOIN matches m ON m.id=e.match_id JOIN divisions d ON d.id=m.division_id
      WHERE d.tournament_id=t.id ORDER BY e.id)))
) AS signature FROM tournaments t WHERE t.id=?`;

function pendingMatch(m,divisionId){
  return m.division_id===divisionId&&['scheduled','ready'].includes(m.status)&&m.court_state==='scheduled'
    &&m.team_a_id&&m.team_b_id&&!m.started_at&&!m.completed_at&&!m.winner_team_id
    &&!m.current_score_a&&!m.current_score_b&&!m.has_sets&&!m.has_events;
}

function participantKeys(m,rosters){
  const keys=new Set();
  for(const team of [m.team_a_id,m.team_b_id])if(team){
    keys.add('team:'+team);
    for(const player of rosters.get(team)||[])keys.add('player:'+player);
  }
  return [...keys];
}

function addInterval(map,key,interval){
  if(!key)return;
  const intervals=map.get(key)||[];
  // Keep each resource sorted so future reservations do not force all new
  // matches behind the latest booking. Binary insertion also keeps plans cheap.
  let lo=0,hi=intervals.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(intervals[mid].start<=interval.start)lo=mid+1;else hi=mid}
  intervals.splice(lo,0,interval);map.set(key,intervals);
}

function earliestStart(base,duration,rest,keys,courtId,courtIntervals,participantIntervals){
  const constraints=(courtIntervals.get(courtId)||[]).map(interval=>({...interval,gap:0}));
  const seen=new Set();
  for(const key of keys)for(const interval of participantIntervals.get(key)||[]){
    // A doubles/relay participant may appear through multiple roster keys.
    if(seen.has(interval))continue;seen.add(interval);
    constraints.push({...interval,gap:Math.max(rest,interval.rest)});
  }
  // Compare forbidden candidate-start intervals, including rest before a
  // future match. Sorting by raw match starts can miss a long court booking
  // after a later participant constraint moves the candidate into that booking.
  constraints.sort((a,b)=>(a.start-a.gap)-(b.start-b.gap)||a.end-b.end);
  let start=base;
  for(const interval of constraints){
    if(start>=interval.end+interval.gap)continue;
    if(start+duration+interval.gap<=interval.start)break;
    start=interval.end+interval.gap;
  }
  return start;
}

function reservation(m,base){
  const duration=slotMinutes(m.match_slot_minutes)*minute;
  const finish=timestamp(m.completed_at);
  const actualStart=timestamp(m.started_at);
  const scheduledStart=timestamp(m.scheduled_at),warmupStart=timestamp(m.warmup_at);
  const warming=m.court_state==='warming_up';
  const queued=['called','on_deck','warming_up','live'].includes(m.court_state)||m.status==='live';
  if(['cancelled','walkover'].includes(m.status)&&actualStart===null)return null;
  let start=actualStart??(warming?warmupStart:null)??scheduledStart;
  if(start===null&&finish!==null)start=finish-duration;
  if(start===null&&queued)start=timestamp(m.warmup_at)??timestamp(m.called_at)??timestamp(m.on_deck_at)??base;
  if(start===null)return null; // Uncalled, untimed queue entries are not bookings.
  // Live play and warmup retain physical occupancy even when the original
  // planned slot elapsed. Warmup begins at its actual timestamp, while a later
  // planned start remains reserved. Release times are estimates; activation
  // must still require the physical occupant to finish or leave the court.
  const live=m.status==='live'||m.court_state==='live';
  let estimatedEnd=start+duration;
  if(warming)estimatedEnd=Math.max(estimatedEnd,(scheduledStart??start)+duration,(warmupStart??start)+duration);
  const end=finish??(live||warming?Math.max(estimatedEnd,base+duration):estimatedEnd);
  if(warming&&finish===null)start=Math.min(start,base);
  return {start:Math.min(start,end),end,rest:restMinutes(m.minimum_rest_minutes)*minute};
}

export async function scheduleDivisionCourts(env,user,divisionId,tournamentId){
  const state=await one(env,tournamentStateSql,tournamentId);
  if(!state)throw error('NOT_FOUND',404);
  const [division,tournament,courts,matches,members]=await Promise.all([
    one(env,'SELECT * FROM divisions WHERE id=? AND tournament_id=?',divisionId,tournamentId),
    one(env,'SELECT start_at FROM tournaments WHERE id=?',tournamentId),
    rows(env,'SELECT id FROM courts WHERE tournament_id=? AND active=1 ORDER BY sort_order,name,id',tournamentId),
    rows(env,`SELECT m.*,d.minimum_rest_minutes,d.match_slot_minutes,
      EXISTS(SELECT 1 FROM match_sets s WHERE s.match_id=m.id) AS has_sets,
      EXISTS(SELECT 1 FROM score_events e WHERE e.match_id=m.id) AS has_events
      FROM matches m JOIN divisions d ON d.id=m.division_id WHERE d.tournament_id=? ORDER BY m.created_at,m.id`,tournamentId),
    rows(env,`SELECT p.team_id,p.player_id FROM team_players p JOIN teams a ON a.id=p.team_id
      JOIN divisions d ON d.id=a.division_id WHERE d.tournament_id=? ORDER BY p.team_id,p.player_id`,tournamentId)
  ]);
  if(!division)throw error('NOT_FOUND',404);
  if(!courts.length)throw error('NO_COURTS',400);
  const minRest=restMinutes(division.minimum_rest_minutes),slot=slotMinutes(division.match_slot_minutes);
  // Replanning during an event must not place remaining matches in elapsed
  // slots. Retain a future tournament start, otherwise plan from this request.
  const planningTime=Date.now();
  const base=Math.max(timestamp(tournament.start_at)??planningTime,planningTime),duration=slot*minute,rest=minRest*minute;
  const rosters=new Map();
  for(const member of members){const players=rosters.get(member.team_id)||[];players.push(member.player_id);rosters.set(member.team_id,players)}
  const pending=matches.filter(m=>pendingMatch(m,divisionId)),pendingIds=new Set(pending.map(m=>m.id));
  const courtIntervals=new Map(),participantIntervals=new Map();
  for(const m of matches){
    if(pendingIds.has(m.id))continue;
    const interval=reservation(m,base);if(!interval)continue;
    addInterval(courtIntervals,m.court_id,interval);
    for(const key of participantKeys(m,rosters))addInterval(participantIntervals,key,interval);
  }
  const remaining=pending.map(m=>({match:m,keys:participantKeys(m,rosters)})),plan=[];
  while(remaining.length){
    let best=null;
    for(let index=0;index<remaining.length;index++){
      const candidate=remaining[index];
      for(const court of courts){
        const start=earliestStart(base,duration,rest,candidate.keys,court.id,courtIntervals,participantIntervals);
        // Equal starts retain the SQL match/court order, including ID ties.
        if(!best||start<best.start)best={index,start,courtId:court.id,candidate};
      }
    }
    remaining.splice(best.index,1);
    const interval={start:best.start,end:best.start+duration,rest};
    addInterval(courtIntervals,best.courtId,interval);
    for(const key of best.candidate.keys)addInterval(participantIntervals,key,interval);
    plan.push({id:best.candidate.match.id,courtId:best.courtId,scheduledAt:new Date(best.start).toISOString()});
  }
  const after={minRestMinutes:minRest,matchSlotMinutes:slot,courts:courts.length,matches:plan.length,assignments:plan};
  try{
    await env.DB.batch([
      // Reuse the existing transactional assertion trigger. A stale tournament
      // signature deliberately fails its division-signature comparison, before
      // any assignment or audit is written. No schema migration is needed.
      env.DB.prepare(`INSERT INTO division_draw_reset_guards(division_id,expected_signature) VALUES(?,
        CASE WHEN ? IS (${tournamentStateSql}) THEN
          (SELECT signature FROM division_draw_reset_state WHERE division_id=?)
        ELSE 'COURT_SCHEDULE_CONFLICT' END)`).bind(divisionId,state.signature,tournamentId,divisionId),
      ...plan.map(item=>env.DB.prepare('UPDATE matches SET court_id=?,scheduled_at=?,version=version+1 WHERE id=?')
        .bind(item.courtId,item.scheduledAt,item.id)),
      env.DB.prepare("INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) VALUES(?,'division',?,'AUTO_SCHEDULE',?,?)")
        .bind(user.id,divisionId,JSON.stringify(pending.map(m=>({id:m.id,courtId:m.court_id,scheduledAt:m.scheduled_at,version:m.version}))),JSON.stringify(after)),
      env.DB.prepare('DELETE FROM division_draw_reset_guards WHERE division_id=?').bind(divisionId)
    ]);
  }catch(cause){
    if(String(cause?.message).includes('DRAW_RESET_CONFLICT'))throw error('COURT_SCHEDULE_CONFLICT',409);
    throw cause;
  }
  return {ok:true,updated:plan.length,assigned:plan.length,courts:courts.length,minRestMinutes:minRest,matchSlotMinutes:slot};
}
