import {authenticate,canManageTournament} from './auth.js';
import {bodyJson,ok,fail,nowIso} from './util.js';
import {broadcast} from './realtime.js';
import {drawRelayOrders,relayHasStarted} from '../../shared/relay-draw.js';
import {loadState} from './state.js';

export async function handleRelayDraw(request,env,ctx){
  const path=/^\/api\/matches\/([^/]+)\/relay-draw\/?$/.exec(new URL(request.url).pathname);
  if(request.method!=='POST'||!path)return null;
  const user=await authenticate(request,env);if(!user)return fail('AUTH_REQUIRED',request,env,401);
  const id=decodeURIComponent(path[1]),m=await env.DB.prepare('SELECT m.*,d.tournament_id,d.relay_team_size,d.relay_segment_points FROM matches m JOIN divisions d ON d.id=m.division_id WHERE m.id=?').bind(id).first();
  if(!m)return fail('NOT_FOUND',request,env,404);
  const allowed=user.role==='referee'?m.referee_user_id===user.id&&(!user.tournamentScope||user.tournamentScope===m.tournament_id):await canManageTournament(env,user,m.tournament_id);
  if(!allowed)return fail('FORBIDDEN',request,env,403);
  if(Number(m.relay_team_size)!==3||Number(m.relay_segment_points)<=0)return fail('RELAY_DRAW_UNSUPPORTED',request,env,400);
  if(!m.team_a_id||!m.team_b_id||m.team_a_id==='TBD'||m.team_b_id==='TBD'||m.team_a_id===m.team_b_id)return fail('MATCH_TEAMS_REQUIRED',request,env,409);
  const rosters=(await env.DB.prepare('SELECT t.id,count(tp.player_id) AS size,sum(CASE WHEN p.active=1 THEN 1 ELSE 0 END) AS active_size FROM teams t LEFT JOIN team_players tp ON tp.team_id=t.id LEFT JOIN players p ON p.id=tp.player_id WHERE t.id IN (?,?) AND t.division_id=? AND t.status=\'active\' GROUP BY t.id').bind(m.team_a_id,m.team_b_id,m.division_id).all()).results;
  if(rosters.length!==2||rosters.some(t=>Number(t.size)!==3||Number(t.active_size)!==3))return fail('RELAY_PARTICIPANTS_REQUIRED',request,env,409);
  const b=await bodyJson(request);
  if(!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion!==Number(m.version))return fail('VERSION_CONFLICT',request,env,409);
  const sets=await env.DB.prepare('SELECT id FROM match_sets WHERE match_id=? LIMIT 1').bind(id).first(),events=await env.DB.prepare('SELECT id FROM score_events WHERE match_id=? LIMIT 1').bind(id).first();
  if(relayHasStarted(m)||sets||events)return fail('RELAY_DRAW_LOCKED',request,env,409);
  const order=drawRelayOrders(),at=nowIso(),after={...m,relay_order_a:JSON.stringify(order.A),relay_order_b:JSON.stringify(order.B),relay_drawn_at:at,version:Number(m.version)+1};
  try{await env.DB.batch([
    env.DB.prepare('INSERT INTO relay_draw_guards(match_id,expected_version) VALUES(?,?)').bind(id,m.version),
    env.DB.prepare('UPDATE matches SET relay_order_a=?,relay_order_b=?,relay_drawn_at=?,version=version+1 WHERE id=? AND version=?').bind(after.relay_order_a,after.relay_order_b,at,id,m.version),
    env.DB.prepare("INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data,reason) VALUES(?,'match',?,'RELAY_DRAW',?,?,?)").bind(user.id,id,JSON.stringify(m),JSON.stringify(after),'Bốc thăm thứ tự cặp độc lập cho từng đội'),
    env.DB.prepare('DELETE FROM relay_draw_guards WHERE match_id=?').bind(id)
  ])}catch(e){const msg=String(e.message)+' '+String(e.cause?.message||'');const code=['VERSION_CONFLICT','RELAY_DRAW_LOCKED','RELAY_PARTICIPANTS_REQUIRED','RELAY_DRAW_UNSUPPORTED'].find(c=>msg.includes(c));if(code)return fail(code,request,env,code==='RELAY_DRAW_UNSUPPORTED'?400:409);throw e}
  const delivery=Promise.allSettled(['public',m.tournament_id].flatMap(room=>[broadcast(env,'public:state',{tournamentId:m.tournament_id},room),broadcast(env,'match:update',{id,tournamentId:m.tournament_id,version:after.version},room)]));
  if(ctx?.waitUntil)ctx.waitUntil(delivery);else await delivery;
  const state=await loadState(env);return ok(state.matches.find(match=>match.id===id),request,env);
}
