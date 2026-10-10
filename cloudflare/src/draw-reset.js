import {nowIso,uid} from './util.js';

const rows=async(env,sql,id)=>(await env.DB.prepare(sql).bind(id).all()).results||[];
const conflict=()=>Object.assign(new Error('DRAW_RESET_CONFLICT'),{status:409});

export async function guardedDivisionBatch(env,divisionId,signature,statements){
  try{
    await env.DB.batch([
      env.DB.prepare('INSERT INTO division_draw_reset_guards(division_id,expected_signature) VALUES(?,?)').bind(divisionId,signature),
      ...statements,
      env.DB.prepare('DELETE FROM division_draw_reset_guards WHERE division_id=?').bind(divisionId)
    ]);
  }catch(error){
    if(String(error?.message).includes('DRAW_RESET_CONFLICT'))throw conflict();
    throw error;
  }
}
async function sha256(bytes){
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function archiveChunks(env,user,divisionId,archive){
  const bytes=new TextEncoder().encode(JSON.stringify(archive)),size=192*1024,archiveId=uid();
  const manifest={format:'draw-reset-archive-v1',archiveId,encoding:'base64',chunkCount:Math.ceil(bytes.length/size),bytes:bytes.length,sha256:await sha256(bytes)};
  const statements=[];
  for(let index=0;index<manifest.chunkCount;index++){
    const chunk=bytes.subarray(index*size,(index+1)*size);let binary='';
    for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,i+8192));
    // Base64 keeps each audit row below 270 KB, including multi-byte names and
    // event payloads. Reassemble bytes in index order before decoding UTF-8.
    const data={archiveId,index,data:btoa(binary)};
    statements.push(env.DB.prepare("INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,before_data,reason) VALUES(?,'division',?,'RESET_GROUP_DRAW_ARCHIVE',?,?)")
      .bind(user.id,divisionId,JSON.stringify(data),`Lưu lịch/kết quả cũ (phần ${index+1}/${manifest.chunkCount})`));
  }
  return {manifest,statements};
}

export async function drawResetSnapshot(env,divisionId){
  // Read the signature first. The transaction guard rejects any changes while
  // the separate archive queries are being read or while confirmation is open.
  const state=await env.DB.prepare('SELECT signature FROM division_draw_reset_state WHERE division_id=?').bind(divisionId).first();
  if(!state)throw Object.assign(new Error('NOT_FOUND'),{status:404});
  const [matches,sets,scoreEvents,groups]=await Promise.all([
    rows(env,'SELECT * FROM matches WHERE division_id=? ORDER BY rowid',divisionId),
    rows(env,'SELECT s.* FROM match_sets s JOIN matches m ON m.id=s.match_id WHERE m.division_id=? ORDER BY s.rowid',divisionId),
    rows(env,'SELECT e.* FROM score_events e JOIN matches m ON m.id=e.match_id WHERE m.division_id=? ORDER BY e.id',divisionId),
    rows(env,'SELECT id,group_code,status FROM teams WHERE division_id=? ORDER BY id',divisionId)
  ]);
  const parsed=JSON.parse(state.signature);
  const token=await sha256(new TextEncoder().encode(state.signature));
  const summary={
    teamCount:groups.filter(t=>t.status!=='withdrawn').length,
    groupCount:new Set(groups.map(t=>t.group_code).filter(Boolean)).size,
    matchCount:matches.length,
    poolMatchCount:matches.filter(m=>!m.bracket_slot&&(m.stage==='Vòng bảng'||m.stage.startsWith('Bảng '))).length,
    knockoutMatchCount:matches.filter(m=>m.bracket_slot||!['Vòng bảng'].includes(m.stage)&&!m.stage.startsWith('Bảng ')).length,
    liveMatchCount:matches.filter(m=>m.status==='live').length,
    completedMatchCount:matches.filter(m=>['completed','walkover'].includes(m.status)).length,
    setCount:sets.length,scoreEventCount:scoreEvents.length
  };
  return {signature:state.signature,revision:parsed.revision,token,divisionName:parsed.division[2],summary,archive:{matches,sets,scoreEvents,groups}};
}

export async function resetGroupDraw(env,user,divisionId,body){
  if(body.confirmation!=='QUAY LAI')throw Object.assign(new Error('DRAW_RESET_CONFIRMATION_REQUIRED'),{status:400});
  if(typeof body.expectedToken!=='string'||!body.expectedToken)throw Object.assign(new Error('DRAW_RESET_PREVIEW_REQUIRED'),{status:400});
  const snapshot=await drawResetSnapshot(env,divisionId);
  if(body.expectedToken!==snapshot.token)throw conflict();
  if(!snapshot.summary.matchCount&&!snapshot.archive.groups.some(t=>t.group_code))throw Object.assign(new Error('DRAW_ALREADY_EMPTY'),{status:409});
  const at=nowIso(),after={removedMatches:snapshot.summary.matchCount,clearedGroups:snapshot.summary.groupCount,revision:snapshot.revision+1};
  const archive=await archiveChunks(env,user,divisionId,snapshot.archive);
  try{
    await env.DB.batch([
      env.DB.prepare('INSERT INTO division_draw_reset_guards(division_id,expected_signature) VALUES(?,?)').bind(divisionId,snapshot.signature),
      env.DB.prepare('DELETE FROM matches WHERE division_id=?').bind(divisionId),
      env.DB.prepare('UPDATE teams SET group_code=NULL,updated_at=? WHERE division_id=?').bind(at,divisionId),
      // Advance after deleting history, preserving the ordinary draw-history
      // safeguards and invalidating draw plans prepared before this reset.
      env.DB.prepare('INSERT INTO division_draw_revisions(division_id,revision,expected_revision) VALUES(?,1,?) ON CONFLICT(division_id) DO UPDATE SET revision=division_draw_revisions.revision+1,expected_revision=excluded.expected_revision').bind(divisionId,snapshot.revision),
      ...archive.statements,
      env.DB.prepare("INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data,reason) VALUES(?,'division',?,'RESET_GROUP_DRAW',?,?,?)")
        .bind(user.id,divisionId,JSON.stringify(archive.manifest),JSON.stringify(after),'Đặt lại bảng để bốc thăm lại'),
      env.DB.prepare('DELETE FROM division_draw_reset_guards WHERE division_id=?').bind(divisionId)
    ]);
  }catch(error){
    if(/DRAW_RESET_CONFLICT|DRAW_VERSION_CONFLICT/.test(String(error?.message)))throw conflict();
    throw error;
  }
  return {ok:true,...after};
}
