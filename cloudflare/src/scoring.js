import {authenticate,canManageTournament} from "./auth.js";
import {bodyJson,ok,fail,nowIso,uid,safeJsonParse} from "./util.js";
import {broadcast} from "./realtime.js";
import {validateSet,validateSeries} from "../../shared/scoring-rules.js";

const legacyScoringFields=["status","current_score_a","current_score_b","winner_team_id","result_reason","result_note","started_at","completed_at"];
const scoringFields=[...legacyScoringFields,"court_state","serving_side","server_number","timeout_a","timeout_b","medical_timeout_a","medical_timeout_b"];
const actions=new Set(["point","rally","service","timeout","finish-set","quick-score","finish","special-result","undo"]);
const error=(code,status=400)=>Object.assign(new Error(code),{status});
const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const rows=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results||[];
const statement=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const pairs=sets=>sets.map(s=>[s.score_a,s.score_b]);
const snapshot=(match,sets)=>({match:{...match},sets:sets.map(s=>({...s}))});
const series=(m,sets,requireComplete)=>validateSeries(pairs(sets),Number(m.best_of),Number(m.points_to_win),Boolean(m.win_by_two),{requireComplete});

async function authorize(env,user,m){
  if(user.role==="referee")return m.referee_user_id===user.id&&(!user.tournamentScope||user.tournamentScope===m.tournament_id);
  return canManageTournament(env,user,m.tournament_id);
}
function assertPlayable(m){
  if(m.status==="completed"||m.status==="walkover"||m.winner_team_id)throw error("MATCH_COMPLETED",409);
  assertUndoable(m);
}
function assertUndoable(m){
  if(m.status==="cancelled")throw error("MATCH_CANCELLED",409);
  if(!m.team_a_id||!m.team_b_id||m.team_a_id==="TBD"||m.team_b_id==="TBD"||m.team_a_id===m.team_b_id)throw error("MATCH_TEAMS_REQUIRED",409);
}
function locked(m,sets){
  return Boolean(m.started_at||["live","completed","walkover","cancelled"].includes(m.status)||m.winner_team_id||m.current_score_a||m.current_score_b||sets.length);
}
function setRow(id,no,a,b){return {id:uid(),match_id:id,set_no:no,score_a:a,score_b:b,completed:1}}
function complete(m,winner,at){
  m.status="completed";m.court_state="done";m.winner_team_id=winner;m.completed_at=at;
  m.current_score_a=0;m.current_score_b=0;m.result_reason=null;m.result_note=null;
}
function initialServerNumber(m){return ["doubles","mixed_doubles","team"].includes(String(m.event_type||""))?2:1}
function ensureServeState(m){
  if(!["A","B"].includes(m.serving_side))m.serving_side="A";
  if(![1,2].includes(Number(m.server_number)))m.server_number=initialServerNumber(m);
  if(!["doubles","mixed_doubles","team"].includes(String(m.event_type||"")))m.server_number=1;
}
function view(m,sets){
  return {id:m.id,divisionId:m.division_id,stage:m.stage,a:m.team_a_id||"TBD",b:m.team_b_id||"TBD",courtId:m.court_id||null,refereeId:m.referee_user_id||null,
    status:["scheduled","ready"].includes(m.status)?"wait":m.status==="completed"?"done":m.status,current:[m.current_score_a,m.current_score_b],sets:pairs(sets),winner:m.winner_team_id||null,
    version:m.version,bracketSlot:m.bracket_slot||null,resultReason:m.result_reason||null,resultNote:m.result_note||null,startedAt:m.started_at||null,completedAt:m.completed_at||null,
    courtState:m.status==="completed"?"done":(m.court_state||"scheduled"),servingSide:m.serving_side||null,serverNumber:Number(m.server_number||initialServerNumber(m)),
    timeouts:{A:Number(m.timeout_a||0),B:Number(m.timeout_b||0)},medicalTimeouts:{A:Number(m.medical_timeout_a||0),B:Number(m.medical_timeout_b||0)}};
}

async function bracketChanges(env,m,winner,restore=null){
  const slots=restore||[
    {id:m.next_match_id,side:m.next_match_side,teamAfter:winner},
    {id:m.loser_next_match_id,side:m.loser_next_match_side,teamAfter:winner===m.team_a_id?m.team_b_id:m.team_a_id}
  ].filter(s=>s.id&&s.side);
  const changes=[],guards=new Map();
  for(const slot of slots){
    if(!["A","B"].includes(slot.side)||slot.id===m.id)throw error("INVALID_BRACKET_LINK",409);
    const target=await one(env,"SELECT * FROM matches WHERE id=?",slot.id);
    if(!target||target.division_id!==m.division_id)throw error("INVALID_BRACKET_LINK",409);
    const sets=await rows(env,"SELECT id FROM match_sets WHERE match_id=?",slot.id);
    const events=await one(env,"SELECT id FROM score_events WHERE match_id=? LIMIT 1",slot.id);
    if(locked(target,sets)||events)throw error("DOWNSTREAM_MATCH_LOCKED",409);
    const column=slot.side==="A"?"team_a_id":"team_b_id";
    const current=target[column]||null;
    if(restore){
      if(current!==(slot.teamAfter||null))throw error("VERSION_CONFLICT",409);
      changes.push({...slot,teamAfter:slot.teamBefore||null,teamBefore:current,version:target.version});
    }else{
      if(current&&current!==slot.teamAfter)throw error("BRACKET_SLOT_OCCUPIED",409);
      changes.push({...slot,teamBefore:current,version:target.version});
    }
    guards.set(target.id,{id:target.id,version:target.version,requireUnstarted:true});
  }
  return {changes,guards:[...guards.values()]};
}

// Old events are accepted only where the stored data determines the prior state.
// Missing quick-score sets or ambiguous match-finish history cannot be invented.
async function legacyBefore(env,m,sets,event,payload){
  const before=snapshot(m,sets),p=payload.before;
  const previous=await one(env,"SELECT * FROM score_events WHERE match_id=? AND id<? AND event_type<>'UNDO' AND undone_at IS NULL ORDER BY id DESC LIMIT 1",m.id,event.id);
  const previousPayload=safeJsonParse(previous?.payload,{});
  const wasLive=previous&&["POINT","SET_FINISH"].includes(previous.event_type);
  if(event.event_type==="POINT"&&p){
    if(Array.isArray(p)){
      if(!wasLive)throw error("UNDO_HISTORY_UNAVAILABLE",409);
      before.match.current_score_a=p[0];before.match.current_score_b=p[1];before.match.status="live";
    }else if(Number.isSafeInteger(p.current_score_a)&&Number.isSafeInteger(p.current_score_b)&&p.status){
      before.match.current_score_a=p.current_score_a;before.match.current_score_b=p.current_score_b;before.match.status=p.status;
    }else throw error("UNDO_HISTORY_UNAVAILABLE",409);
  }else if((event.event_type==="SET_FINISH"||event.event_type==="MATCH_FINISH")&&(payload.setNo||payload.addedSetNo)&&Array.isArray(payload.set)){
    if(!wasLive)throw error("UNDO_HISTORY_UNAVAILABLE",409);
    const no=payload.setNo||payload.addedSetNo;
    if(!sets.some(s=>s.set_no===no&&s.score_a===payload.set[0]&&s.score_b===payload.set[1]))throw error("UNDO_HISTORY_UNAVAILABLE",409);
    before.sets=before.sets.filter(s=>s.set_no!==no);
    before.match.current_score_a=payload.set[0];before.match.current_score_b=payload.set[1];before.match.status="live";
    before.match.winner_team_id=null;before.match.completed_at=null;
  }else if(event.event_type==="SET_FINISH"&&payload.addedSetNo&&p){
    if(!sets.some(s=>s.set_no===payload.addedSetNo&&s.score_a===p.scoreA&&s.score_b===p.scoreB))throw error("UNDO_HISTORY_UNAVAILABLE",409);
    before.sets=before.sets.filter(s=>s.set_no!==payload.addedSetNo);
    before.match.current_score_a=p.scoreA;before.match.current_score_b=p.scoreB;
  }else if(event.event_type==="MATCH_FINISH"&&!payload.sets&&!payload.quickScore&&wasLive&&!payload.reason){
    let priorScores=null;
    if(previous.event_type==="POINT"&&Array.isArray(previousPayload.after))priorScores=previousPayload.after;
    if(previous.event_type==="SET_FINISH")priorScores=[0,0];
    if(!priorScores)throw error("UNDO_HISTORY_UNAVAILABLE",409);
    before.match.current_score_a=priorScores[0];before.match.current_score_b=priorScores[1];before.match.status="live";
    before.match.winner_team_id=null;before.match.completed_at=null;
  }else throw error("UNDO_HISTORY_UNAVAILABLE",409);
  return before;
}

async function undoPlan(env,m,sets){
  assertUndoable(m);
  const event=await one(env,"SELECT * FROM score_events WHERE match_id=? AND event_type<>'UNDO' AND undone_at IS NULL ORDER BY id DESC LIMIT 1",m.id);
  if(!event)throw error("NOTHING_TO_UNDO");
  const payload=safeJsonParse(event.payload,{});
  const before=payload.before?.match&&Array.isArray(payload.before.sets)?payload.before:await legacyBefore(env,m,sets,event,payload);
  for(const field of legacyScoringFields)if(!(field in before.match))throw error("UNDO_HISTORY_UNAVAILABLE",409);
  for(const field of scoringFields)if(!(field in before.match))before.match[field]=m[field]??null;
  const after=snapshot(m,before.sets);
  for(const field of scoringFields)after.match[field]=before.match[field];
  // Participation history remains durable even after reversing the first point.
  after.match.started_at=m.started_at||before.match.started_at||null;
  let bracket={changes:[],guards:[]};
  if(m.winner_team_id!==after.match.winner_team_id){
    if(Array.isArray(payload.downstream))bracket=await bracketChanges(env,m,m.winner_team_id,payload.downstream);
    else if(m.next_match_id||m.loser_next_match_id)throw error("UNDO_HISTORY_UNAVAILABLE",409);
  }
  return {after,eventType:"UNDO",payload:{undoEventId:event.id},undoEvent:event,bracket};
}

async function mutationPlan(env,m,sets,action,body,at){
  assertPlayable(m);
  const after=snapshot(m,sets);let eventType="POINT",payload={},done=false;
  const next=after.match;
  if(action==="point"){
    const delta=Number(body.delta);
    if(!["A","B"].includes(body.side)||![1,-1].includes(delta))throw error("BAD_SCORE_ACTION");
    if(![m.current_score_a,m.current_score_b].every(s=>Number.isSafeInteger(s)&&s>=0))throw error("INVALID_CURRENT_SCORE",409);
    if(!series(m,sets,false).valid||series(m,sets,false).winner)throw error("MATCH_NOT_PLAYABLE",409);
    const column=body.side==="A"?"current_score_a":"current_score_b";
    next[column]=Math.max(0,next[column]+delta);next.status="live";next.court_state="live";next.started_at=m.started_at||at;
    if(!Number.isSafeInteger(next[column]))throw error("INVALID_CURRENT_SCORE",409);
    payload={side:body.side,delta,manual:true};
  }else if(action==="rally"){
    const side=String(body.side||"").toUpperCase();
    if(!["A","B"].includes(side))throw error("BAD_SCORE_ACTION");
    if(![m.current_score_a,m.current_score_b].every(s=>Number.isSafeInteger(s)&&s>=0))throw error("INVALID_CURRENT_SCORE",409);
    if(!series(m,sets,false).valid||series(m,sets,false).winner)throw error("MATCH_NOT_PLAYABLE",409);
    ensureServeState(next);
    const serveBefore=next.serving_side,serverBefore=Number(next.server_number);
    let scored=false,sideOut=false;
    if(String(m.scoring_mode||"side_out")==="rally"){
      const column=side==="A"?"current_score_a":"current_score_b";
      next[column]+=1;next.serving_side=side;next.server_number=1;scored=true;
    }else if(side===next.serving_side){
      const column=side==="A"?"current_score_a":"current_score_b";
      next[column]+=1;scored=true;
    }else if(["doubles","mixed_doubles","team"].includes(String(m.event_type||""))&&Number(next.server_number)===1){
      next.server_number=2;
    }else{
      next.serving_side=side;next.server_number=1;sideOut=true;
    }
    next.status="live";next.court_state="live";next.started_at=m.started_at||at;
    payload={side,scored,sideOut,serveBefore,serverBefore,serveAfter:next.serving_side,serverAfter:Number(next.server_number),mode:m.scoring_mode||"side_out"};
  }else if(action==="service"){
    const side=String(body.side||"").toUpperCase();
    if(!["A","B"].includes(side))throw error("INVALID_SERVICE");
    next.serving_side=side;
    next.server_number=["doubles","mixed_doubles","team"].includes(String(m.event_type||""))?Number(body.serverNumber||1):1;
    if(![1,2].includes(Number(next.server_number)))throw error("INVALID_SERVICE");
    eventType="CORRECTION";payload={service:true,side,serverNumber:Number(next.server_number)};
  }else if(action==="timeout"){
    const side=String(body.side||"").toUpperCase(),kind=String(body.kind||"standard");
    if(!["A","B"].includes(side)||!["standard","medical"].includes(kind))throw error("INVALID_TIMEOUT");
    const column=(kind==="medical"?"medical_timeout_":"timeout_")+side.toLowerCase();
    const limit=kind==="medical"?1:2,current=Number(next[column]||0);
    if(current>=limit)throw error(kind==="medical"?"MEDICAL_TIMEOUT_LIMIT":"TIMEOUT_LIMIT",409);
    next[column]=current+1;eventType="CORRECTION";payload={timeout:true,side,kind,count:next[column]};
  }else if(action==="quick-score"){
    if(!Array.isArray(body.sets)||!body.sets.length)throw error("NO_SETS_PROVIDED");
    const result=validateSeries(body.sets,Number(m.best_of),Number(m.points_to_win),Boolean(m.win_by_two));
    if(!result.valid)throw error(result.error);
    after.sets=body.sets.map((s,i)=>setRow(m.id,i+1,...s));
    complete(next,result.winner==="A"?m.team_a_id:m.team_b_id,at);done=true;eventType="MATCH_FINISH";payload={quickScore:true};
  }else if(action==="finish-set"||action==="finish"){
    if(action==="finish-set"||m.current_score_a!==0||m.current_score_b!==0){
      if(!validateSet(m.current_score_a,m.current_score_b,Number(m.points_to_win),Boolean(m.win_by_two)))throw error("INVALID_SET_SCORE");
      after.sets.push(setRow(m.id,Math.max(0,...sets.map(s=>s.set_no))+1,m.current_score_a,m.current_score_b));
    }
    const result=series(m,after.sets,action==="finish");if(!result.valid)throw error(result.error);
    next.current_score_a=0;next.current_score_b=0;next.status="live";next.court_state="warming_up";
    next.timeout_a=0;next.timeout_b=0;next.server_number=initialServerNumber(m);
    if(result.winner){
      const winner=result.winner==="A"?m.team_a_id:m.team_b_id;
      if(body.winnerTeamId&&body.winnerTeamId!==winner)throw error("INVALID_WINNER");
      complete(next,winner,at);done=true;
    }else if(body.winnerTeamId)throw error("MATCH_NOT_FINISHED");
    eventType=done?"MATCH_FINISH":"SET_FINISH";
  }else if(action==="special-result"){
    if(![m.team_a_id,m.team_b_id].includes(body.winnerTeamId)||!["walkover","no_show","retired","injury","disqualified"].includes(body.reason))throw error("INVALID_SPECIAL_RESULT");
    complete(next,body.winnerTeamId,at);next.result_reason=body.reason;next.result_note=String(body.note||"");done=true;eventType="MATCH_FINISH";payload={special:true};
  }
  if(["point","rally","finish-set","finish","quick-score","special-result"].includes(action))next.started_at=m.started_at||at;
  const bracket=done?await bracketChanges(env,m,next.winner_team_id):{changes:[],guards:[]};
  return {after,eventType,payload,bracket};
}

async function commit(env,user,m,sets,action,plan,at){
  plan.after.match.version=Number(m.version)+1;
  const payload={...plan.payload,expectedVersion:Number(m.version),guardVersions:plan.bracket.guards,before:snapshot(m,sets),after:plan.after,downstream:plan.bracket.changes};
  const statements=[statement(env,"INSERT INTO score_events(match_id,actor_user_id,event_type,payload,match_version) VALUES(?,?,?,?,?)",m.id,user.id,plan.eventType,JSON.stringify(payload),plan.after.match.version)];
  // The event trigger is the compare-and-swap gate for every following write.
  statements.push(statement(env,"UPDATE matches SET "+scoringFields.map(f=>f+"=?").join(",")+",version=version+1 WHERE id=? AND version=?",...scoringFields.map(f=>plan.after.match[f]),m.id,m.version));
  statements.push(statement(env,"DELETE FROM match_sets WHERE match_id=?",m.id));
  for(const s of plan.after.sets)statements.push(statement(env,"INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES(?,?,?,?,?,?)",s.id,m.id,s.set_no,s.score_a,s.score_b,s.completed));
  for(const slot of plan.bracket.changes){
    const column=slot.side==="A"?"team_a_id":"team_b_id";
    statements.push(statement(env,`UPDATE matches SET ${column}=?,version=version+1 WHERE id=?`,slot.teamAfter||null,slot.id));
  }
  if(plan.undoEvent)statements.push(statement(env,"UPDATE score_events SET undone_at=? WHERE id=? AND undone_at IS NULL",at,plan.undoEvent.id));
  statements.push(statement(env,"INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data,reason) VALUES(?,'match',?,?,?,?,?)",user.id,m.id,action.toUpperCase().replaceAll("-","_"),JSON.stringify(payload.before),JSON.stringify(plan.after),plan.undoEvent?"Undo event "+plan.undoEvent.id:null));
  try{await env.DB.batch(statements)}catch(e){
    if(String(e.message).includes("VERSION_CONFLICT"))throw error("VERSION_CONFLICT",409);
    if(String(e.message).includes("DOWNSTREAM_MATCH_LOCKED"))throw error("DOWNSTREAM_MATCH_LOCKED",409);
    throw e;
  }
}

async function autoCallNextOnCourt(env,user,m,at){
  if(!m.court_id)return null;
  const existingQueue=await one(env,"SELECT id FROM matches WHERE court_id=? AND id<>? AND status IN ('scheduled','ready') AND court_state IN ('called','on_deck','warming_up') LIMIT 1",m.court_id,m.id);
  if(existingQueue)return existingQueue.id;
  const candidates=await rows(env,
    "SELECT m.*,d.minimum_rest_minutes FROM matches m JOIN divisions d ON d.id=m.division_id WHERE m.court_id=? AND m.id<>? AND m.status IN ('scheduled','ready') AND COALESCE(m.court_state,'scheduled')='scheduled' AND m.team_a_id IS NOT NULL AND m.team_b_id IS NOT NULL ORDER BY COALESCE(m.scheduled_at,m.created_at),m.created_at",
    m.court_id,m.id
  );
  const now=Date.parse(at),callAheadMs=15*60000;
  for(const next of candidates){
    const scheduledMs=Date.parse(next.scheduled_at||"");
    if(Number.isFinite(scheduledMs)&&scheduledMs>now+callAheadMs)continue;
    const restMs=Math.max(0,Number(next.minimum_rest_minutes??15))*60000;
    let eligible=true;
    for(const teamId of [next.team_a_id,next.team_b_id]){
      const last=await one(env,
        "SELECT MAX(completed_at) AS completed_at FROM matches WHERE id<>? AND completed_at IS NOT NULL AND (team_a_id=? OR team_b_id=?)",
        next.id,teamId,teamId
      );
      const lastMs=Date.parse(last?.completed_at||"");
      if(Number.isFinite(lastMs)&&now-lastMs<restMs){eligible=false;break}
    }
    if(!eligible)continue;
    const before={...next},after={...next,court_state:"called",called_at:at,version:Number(next.version||1)+1};
    try{
      await env.DB.batch([
        statement(env,"INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data,reason) VALUES(?,'match',?,'AUTO_CALL_NEXT',?,?,?)",user.id,next.id,JSON.stringify(before),JSON.stringify(after),"Tự gọi trận tiếp theo sau khi sân trống"),
        statement(env,"UPDATE matches SET court_state='called',called_at=?,version=version+1 WHERE id=? AND version=? AND COALESCE(court_state,'scheduled')='scheduled'",at,next.id,next.version)
      ]);
      return next.id;
    }catch(e){console.error("auto_call_next_failed",{matchId:next.id,error:String(e.message)})}
  }
  return null;
}

export async function handleScoring(request,env){
  const match=/^\/api\/matches\/([^/]+)\/([^/]+)\/?$/.exec(new URL(request.url).pathname);
  if(request.method!=="POST"||!match||!actions.has(match[2]))return null;
  const id=decodeURIComponent(match[1]),action=match[2];
  const user=await authenticate(request,env);if(!user)return fail("AUTH_REQUIRED",request,env,401);
  const m=await one(env,"SELECT m.*,d.tournament_id,d.best_of,d.points_to_win,d.win_by_two,d.scoring_mode,d.event_type FROM matches m JOIN divisions d ON d.id=m.division_id WHERE m.id=?",id);
  if(!m)return fail("NOT_FOUND",request,env,404);
  if(!(await authorize(env,user,m)))return fail("FORBIDDEN",request,env,403);
  const body=await bodyJson(request);
  if(body.expectedVersion!==undefined&&(!Number.isSafeInteger(Number(body.expectedVersion))||Number(body.expectedVersion)!==Number(m.version)))throw error("VERSION_CONFLICT",409);
  const sets=await rows(env,"SELECT * FROM match_sets WHERE match_id=? ORDER BY set_no",id),at=nowIso();
  const plan=action==="undo"?await undoPlan(env,m,sets):await mutationPlan(env,m,sets,action,body,at);
  await commit(env,user,m,sets,action,plan,at);
  if(plan.after.match.status==="completed"){
    try{await autoCallNextOnCourt(env,user,plan.after.match,at)}catch(e){console.error("auto_call_queue_failed",{matchId:id,error:String(e.message)})}
  }
  // Delivery failure must never turn a committed score into a retryable failure.
  try{
    for(const room of ["public",m.tournament_id]){
      await broadcast(env,"public:state",{tournamentId:m.tournament_id},room);
      await broadcast(env,"match:update",{id,tournamentId:m.tournament_id,version:plan.after.match.version},room);
    }
  }catch(e){console.error("score_broadcast_failed",{matchId:id,error:String(e.message)})}
  return ok(view(plan.after.match,plan.after.sets),request,env);
}
