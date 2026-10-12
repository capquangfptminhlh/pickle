import fs from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import multer from "multer";
import {PHOTO_MAX_BYTES,photoCaption,validatePhoto,photoJson} from "../shared/tournament-photos.js";

const fail=(message,status)=>Object.assign(new Error(message),{status});
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||"");
export function registerTournamentPhotos(app,{pool,tx,sessionUser,canManageTournament,audit,uploadRoot}){
  const directory=path.join(uploadRoot,"gallery");
  const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
  const base="/api/tournaments/:id/photos";
  app.use(base,(req,res,next)=>{res.set({"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});next()});
  const visible=async req=>{
    if(!uuid(req.params.id))throw fail("NOT_FOUND",404);
    const row=(await pool.query("select public_visible from tournaments where id=$1",[req.params.id])).rows[0];
    if(!row)throw fail("NOT_FOUND",404);
    if(!row.public_visible&&!await canManageTournament(await sessionUser(req),req.params.id))throw fail("NOT_FOUND",404);
  };
  const manage=wrap(async(req,res,next)=>{
    req.user=await sessionUser(req);
    if(!req.user)throw fail("AUTH_REQUIRED",401);
    if(!["super_admin","organizer"].includes(req.user.role))throw fail("FORBIDDEN",403);
    if(!uuid(req.params.id))throw fail("NOT_FOUND",404);
    if(!await canManageTournament(req.user,req.params.id))throw fail("TOURNAMENT_SCOPE_FORBIDDEN",403);
    if(!(await pool.query("select 1 from tournaments where id=$1",[req.params.id])).rowCount)throw fail("NOT_FOUND",404);
    next();
  });
  const parser=multer({storage:multer.memoryStorage(),limits:{fileSize:PHOTO_MAX_BYTES,files:1,fields:1,fieldSize:4096}}).single("image");
  const upload=(req,res,next)=>parser(req,res,error=>next(error?fail(error.code==="LIMIT_FILE_SIZE"?"FILE_TOO_LARGE":"INVALID_UPLOAD",error.code==="LIMIT_FILE_SIZE"?413:400):undefined));
  app.get(base,wrap(async(req,res)=>{
    await visible(req);
    const rows=(await pool.query("select * from tournament_photos where tournament_id=$1 and removed_at is null order by created_at desc,id desc",[req.params.id])).rows;
    res.json(rows.map(photoJson));
  }));
  app.post(base,manage,upload,wrap(async(req,res)=>{
    if(!req.file)throw fail("FILE_REQUIRED",400);
    const caption=photoCaption(req.body?.caption);
    const extension=validatePhoto(req.file?.buffer||new Uint8Array(),req.file?.mimetype);
    const id=randomUUID(),key=`${id}.${extension}`,file=path.join(directory,key);
    await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(file,req.file.buffer,{flag:"wx"});
    let row;
    try{
      row=await tx(async c=>{
        const inserted=(await c.query("insert into tournament_photos(id,tournament_id,storage_key,content_type,caption,created_by_user_id) values($1,$2,$3,$4,$5,$6) returning *",[id,req.params.id,key,req.file.mimetype,caption,req.user.sub])).rows[0];
        await audit(c,req.user,"tournament_photo",id,"PHOTO_ADD",null,inserted);
        return inserted;
      });
    }catch(error){await fs.unlink(file).catch(()=>{});throw error}
    res.status(201).json(photoJson(row));
  }));
  for(const method of ["patch","delete"]){
    app[method](base+"/:photoId",manage,wrap(async(req,res)=>{
      if(!uuid(req.params.photoId))throw fail("NOT_FOUND",404);
      const updated=await tx(async c=>{
        const before=(await c.query("select * from tournament_photos where id=$1 and tournament_id=$2 and removed_at is null for update",[req.params.photoId,req.params.id])).rows[0];
        if(!before)throw fail("NOT_FOUND",404);
        if(!Number.isInteger(req.body?.expectedVersion)||req.body.expectedVersion!==before.version)throw Object.assign(fail("VERSION_CONFLICT",409),{currentVersion:before.version});
        const row=method==="patch"
          ?(await c.query("update tournament_photos set caption=$2,version=version+1 where id=$1 returning *",[before.id,photoCaption(req.body.caption)])).rows[0]
          :(await c.query("update tournament_photos set removed_at=now(),version=version+1 where id=$1 returning *",[before.id])).rows[0];
        await audit(c,req.user,"tournament_photo",row.id,method==="patch"?"PHOTO_UPDATE":"PHOTO_REMOVE",before,row);
        return row;
      });
      res.json(method==="patch"?photoJson(updated):{ok:true});
    }));
  }
  app.get(base+"/:photoId/image",wrap(async(req,res)=>{
    await visible(req);
    if(!uuid(req.params.photoId))throw fail("NOT_FOUND",404);
    const row=(await pool.query("select storage_key,content_type from tournament_photos where id=$1 and tournament_id=$2 and removed_at is null",[req.params.photoId,req.params.id])).rows[0];
    if(!row||path.basename(row.storage_key)!==row.storage_key)throw fail("NOT_FOUND",404);
    let bytes;
    try{bytes=await fs.readFile(path.join(directory,row.storage_key))}catch(error){if(error.code==="ENOENT")throw fail("NOT_FOUND",404);throw error}
    res.type(row.content_type).send(bytes);
  }));
}
