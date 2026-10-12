import {authenticate,canManageTournament,requireRole} from './auth.js';
import {ok,bodyJson,uid,nowIso,corsHeaders} from './util.js';
import {PHOTO_MAX_BYTES,photoCaption,validatePhoto,photoJson} from '../../shared/tournament-photos.js';
const error=(code,status=400)=>Object.assign(new Error(code),{status});
export async function handleTournamentPhotos(request,env){
 const path=new URL(request.url).pathname;
 const route=path.match(/^\/api\/tournaments\/([^/]+)\/photos(?:\/([^/]+)(\/image)?)?$/);
 if(!route)return null;
 const [,tid,pid,image]=route,method=request.method;
 if(!['GET','POST','PATCH','DELETE'].includes(method))throw error('METHOD_NOT_ALLOWED',405);
 const user=await authenticate(request,env),write=method!=='GET';
 if(write&&!user)throw error('AUTH_REQUIRED',401);
 if(write&&!requireRole(user,'super_admin','organizer'))throw error('FORBIDDEN',403);
 const tournament=await env.DB.prepare('SELECT id,public_visible FROM tournaments WHERE id=?').bind(tid).first();
 if(!tournament)throw error('NOT_FOUND',404);
 const manage=Boolean(user&&await canManageTournament(env,user,tid));
 if(write&&!manage)throw error('TOURNAMENT_SCOPE_FORBIDDEN',403);
 if(!write&&!tournament.public_visible&&!manage)throw error('NOT_FOUND',404);
 const photo=pid?await env.DB.prepare('SELECT * FROM tournament_photos WHERE id=? AND tournament_id=? AND removed_at IS NULL').bind(pid,tid).first():null;
 if(pid&&!photo)throw error('NOT_FOUND',404);
 if(method==='GET'){
  if(image){
   const object=await env.MEDIA.get(photo.storage_key);if(!object)throw error('NOT_FOUND',404);
   const headers=new Headers(corsHeaders(request,env));headers.set('Content-Type',photo.content_type);headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');
   return new Response(object.body,{headers});
  }
  if(pid)throw error('NOT_FOUND',404);
  const {results}=await env.DB.prepare('SELECT * FROM tournament_photos WHERE tournament_id=? AND removed_at IS NULL ORDER BY created_at DESC,id DESC').bind(tid).all();
  return ok(results.map(photoJson),request,env);
 }
 const audit=(id,action,before,after)=>env.DB.prepare("INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) VALUES(?,'tournament_photo',?,?,?,?)").bind(user.id,id,action,before?JSON.stringify(before):null,after?JSON.stringify(after):null);
 if(method==='POST'&&!pid){
  if(Number(request.headers.get('Content-Length')||0)>PHOTO_MAX_BYTES+65536)throw error('FILE_TOO_LARGE',413);
  const form=await request.formData(),file=form.get('image'),caption=photoCaption(form.get('caption')??'');
  if(!file||typeof file.arrayBuffer!=='function')throw error('FILE_REQUIRED');
  if(file.size>PHOTO_MAX_BYTES)throw error('FILE_TOO_LARGE',413);
  const bytes=new Uint8Array(await file.arrayBuffer()),ext=validatePhoto(bytes,file.type),id=uid();
  const row={id,tournament_id:tid,storage_key:'gallery/'+id+'.'+ext,content_type:file.type,caption,created_by_user_id:user.id,created_at:nowIso(),version:1};
  await env.MEDIA.put(row.storage_key,bytes,{httpMetadata:{contentType:file.type}});
  try{await env.DB.batch([
   env.DB.prepare('INSERT INTO tournament_photos(id,tournament_id,storage_key,content_type,caption,created_by_user_id,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,tid,row.storage_key,file.type,caption,user.id,row.created_at),audit(id,'PHOTO_ADD',null,row)
  ])}catch(e){await env.MEDIA.delete(row.storage_key);throw e}
  return ok(photoJson(row),request,env,201);
 }
 if(!pid||image||!['PATCH','DELETE'].includes(method))throw error('NOT_FOUND',404);
 const body=await bodyJson(request);
 if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion!==photo.version)throw error('VERSION_CONFLICT',409);
 const next={...photo,version:photo.version+1,...(method==='PATCH'?{caption:photoCaption(body.caption)}:{removed_at:nowIso()})};
 try{await env.DB.batch([
  env.DB.prepare('INSERT INTO tournament_photo_guards(photo_id,expected_version) VALUES(?,?)').bind(pid,photo.version),
  env.DB.prepare('UPDATE tournament_photos SET caption=?,removed_at=?,version=? WHERE id=?').bind(next.caption,next.removed_at||null,next.version,pid),
  audit(pid,method==='PATCH'?'PHOTO_UPDATE':'PHOTO_REMOVE',photo,next),
  env.DB.prepare('DELETE FROM tournament_photo_guards WHERE photo_id=?').bind(pid)
 ])}catch(e){if(String(e.message).includes('PHOTO_VERSION_CONFLICT'))throw error('VERSION_CONFLICT',409);throw e}
 return ok(method==='PATCH'?photoJson(next):{ok:true},request,env);
}
