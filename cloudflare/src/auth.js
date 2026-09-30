import {nowIso,uid,publicUser} from "./util.js";

const enc=new TextEncoder();
const dec=new TextDecoder();

function b64url(bytes){
  let s="";for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function b64urlText(text){return b64url(enc.encode(text))}
function fromB64url(value){
  const s=String(value).replace(/-/g,"+").replace(/_/g,"/");
  const padded=s+"=".repeat((4-s.length%4)%4);
  const raw=atob(padded),out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
function timingSafe(a,b){
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
async function hmac(secret,data){
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(data)));
}

export async function hashPassword(password){
  const iterations=150000;
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey("raw",enc.encode(String(password)),{name:"PBKDF2"},false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,256);
  return ["pbkdf2-sha256",iterations,b64url(salt),b64url(new Uint8Array(bits))].join("$");
}

export async function verifyPassword(password,stored){
  const parts=String(stored||"").split("$");
  if(parts.length!==4||parts[0]!=="pbkdf2-sha256")return false;
  const iterations=Number(parts[1]);if(!Number.isInteger(iterations)||iterations<100000)return false;
  const salt=fromB64url(parts[2]),expected=fromB64url(parts[3]);
  const key=await crypto.subtle.importKey("raw",enc.encode(String(password)),{name:"PBKDF2"},false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,expected.length*8);
  return timingSafe(new Uint8Array(bits),expected);
}

export async function signSession(env,row){
  if(!env.SESSION_SECRET||String(env.SESSION_SECRET).length<32)throw new Error("SESSION_SECRET_REQUIRED");
  const now=Math.floor(Date.now()/1000);
  const payload={
    sub:row.id,email:row.email,role:row.role,
    tournamentScope:row.tournament_id_scope||null,
    clubId:row.club_id||null,
    authVersion:Number(row.auth_version||0),
    iat:now,exp:now+12*60*60
  };
  const head=b64urlText(JSON.stringify({alg:"HS256",typ:"JWT"}));
  const body=b64urlText(JSON.stringify(payload));
  const input=head+"."+body;
  const sig=b64url(await hmac(String(env.SESSION_SECRET),input));
  return input+"."+sig;
}

export async function verifySession(env,token){
  try{
    if(!token||!env.SESSION_SECRET)return null;
    const parts=String(token).split(".");if(parts.length!==3)return null;
    const expected=await hmac(String(env.SESSION_SECRET),parts[0]+"."+parts[1]);
    const got=fromB64url(parts[2]);
    if(!timingSafe(expected,got))return null;
    const payload=JSON.parse(dec.decode(fromB64url(parts[1])));
    if(!payload.exp||payload.exp<Math.floor(Date.now()/1000))return null;
    const row=await env.DB.prepare(
      "SELECT id,email,display_name,role,active,auth_version,tournament_id_scope,club_id FROM app_users WHERE id=?"
    ).bind(payload.sub).first();
    if(!row||!row.active||Number(row.auth_version||0)!==Number(payload.authVersion||0))return null;
    return publicUser(row);
  }catch{return null}
}

export async function authenticate(request,env){
  const header=request.headers.get("Authorization")||"";
  const token=/^Bearer\s+/i.test(header)?header.replace(/^Bearer\s+/i,"").trim():null;
  return verifySession(env,token);
}

export async function ensureBootstrapAdmin(env){
  const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM app_users").first();
  if(Number(row?.n||0)>0)return;
  const email=String(env.BOOTSTRAP_ADMIN_EMAIL||"").trim().toLowerCase();
  const password=String(env.BOOTSTRAP_ADMIN_PASSWORD||"");
  if(!email||password.length<12)return;
  const hash=await hashPassword(password);
  await env.DB.prepare(
    "INSERT INTO app_users(id,email,display_name,role,active,password_hash,auth_version,created_at,updated_at) VALUES(?,?,?,?,1,?,0,?,?)"
  ).bind(uid(),email,String(env.BOOTSTRAP_ADMIN_NAME||"Super Admin"),"super_admin",hash,nowIso(),nowIso()).run();
}

export function requireRole(user,...roles){
  return Boolean(user&&roles.includes(user.role));
}

export async function canManageTournament(env,user,tournamentId){
  if(!user||!tournamentId)return false;
  if(user.role==="super_admin")return true;
  if(user.role!=="organizer")return false;
  const row=await env.DB.prepare(
    "SELECT id FROM tournaments WHERE id=? AND (owner_user_id=? OR (? IS NOT NULL AND id=?))"
  ).bind(tournamentId,user.id,user.tournamentScope||null,user.tournamentScope||null).first();
  return Boolean(row);
}

export async function tournamentForDivision(env,divisionId){
  const r=await env.DB.prepare("SELECT tournament_id FROM divisions WHERE id=?").bind(divisionId).first();
  return r?.tournament_id||null;
}
export async function tournamentForTeam(env,teamId){
  const r=await env.DB.prepare("SELECT d.tournament_id FROM teams t JOIN divisions d ON d.id=t.division_id WHERE t.id=?").bind(teamId).first();
  return r?.tournament_id||null;
}
export async function tournamentForCourt(env,courtId){
  const r=await env.DB.prepare("SELECT tournament_id FROM courts WHERE id=?").bind(courtId).first();
  return r?.tournament_id||null;
}

export async function canEditPlayer(env,user,playerId){
  if(!user)return false;
  if(user.role==="super_admin")return true;
  if(user.role==="organizer"){
    const own=await env.DB.prepare("SELECT id FROM players WHERE id=? AND created_by_user_id=?").bind(playerId,user.id).first();
    if(own)return true;
    const linked=await env.DB.prepare(
      "SELECT p.id FROM players p JOIN team_players tp ON tp.player_id=p.id JOIN teams t ON t.id=tp.team_id JOIN divisions d ON d.id=t.division_id JOIN tournaments tr ON tr.id=d.tournament_id WHERE p.id=? AND (tr.owner_user_id=? OR (? IS NOT NULL AND tr.id=?)) LIMIT 1"
    ).bind(playerId,user.id,user.tournamentScope||null,user.tournamentScope||null).first();
    return Boolean(linked);
  }
  if(user.role==="referee"){
    const row=await env.DB.prepare(
      "SELECT tp.player_id FROM team_players tp JOIN matches m ON (m.team_a_id=tp.team_id OR m.team_b_id=tp.team_id) WHERE tp.player_id=? AND m.referee_user_id=? LIMIT 1"
    ).bind(playerId,user.id).first();
    return Boolean(row);
  }
  return false;
}
