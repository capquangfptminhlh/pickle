export const nowIso=()=>new Date().toISOString();
export const uid=()=>crypto.randomUUID();

export function slugify(value){
  return String(value||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/đ/g,"d")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"item";
}

export function allowedOrigins(env){
  const configured=String(env.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
  return new Set(configured);
}

export function corsHeaders(request,env){
  const origin=request.headers.get("Origin")||"";
  const allowed=allowedOrigins(env);
  const headers={
    "Access-Control-Allow-Methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type,Authorization",
    "Access-Control-Max-Age":"86400",
    "Vary":"Origin",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"strict-origin-when-cross-origin",
    "Permissions-Policy":"camera=(self), microphone=(), geolocation=(), payment=()"
  };
  if(origin&&allowed.has(origin)){
    headers["Access-Control-Allow-Origin"]=origin;
    headers["Access-Control-Allow-Credentials"]="true";
  }
  return headers;
}

export function json(data,status,request,env,extra={}){
  return new Response(JSON.stringify(data),{
    status,
    headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...corsHeaders(request,env),...extra}
  });
}

export function ok(data,request,env,status=200){return json(data,status,request,env)}
export function fail(code,request,env,status=400,detail){
  return json(detail?{error:code,detail}:{error:code},status,request,env);
}

export async function bodyJson(request){
  if(request.body===null)return {};
  let data;
  try{data=await request.json()}catch{throw Object.assign(new Error("INVALID_JSON"),{status:400})}
  if(data===null||typeof data!=="object"||Array.isArray(data))throw Object.assign(new Error("INVALID_JSON"),{status:400});
  return data;
}

export function bool(v){return Boolean(Number(v))}

export function safeJsonParse(v,fallback=null){
  try{return JSON.parse(v)}catch{return fallback}
}

export function publicUser(row){
  if(!row)return null;
  return {
    id:row.id,
    email:row.email,
    name:row.display_name,
    displayName:row.display_name,
    role:row.role,
    headReferee:row.role==="referee"&&Boolean(row.is_head_referee)&&Boolean(row.tournament_id_scope),
    active:Boolean(row.active),
    tournamentId:row.tournament_id_scope||null,
    tournamentScope:row.tournament_id_scope||null,
    clubId:row.club_id||null
  };
}

export function route(path,pattern){
  const p=pattern.split("/").filter(Boolean),a=path.split("/").filter(Boolean);
  if(p.length!==a.length)return null;
  const params={};
  for(let i=0;i<p.length;i++){
    if(p[i].startsWith(":"))params[p[i].slice(1)]=decodeURIComponent(a[i]);
    else if(p[i]!==a[i])return null;
  }
  return params;
}

export async function audit(env,user,entityType,entityId,action,beforeData=null,afterData=null,reason=null){
  await env.DB.prepare(
    "INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data,reason) VALUES(?,?,?,?,?,?,?)"
  ).bind(
    user?.id||null,
    entityType,
    String(entityId||""),
    action,
    beforeData?JSON.stringify(beforeData):null,
    afterData?JSON.stringify(afterData):null,
    reason||null
  ).run();
}
