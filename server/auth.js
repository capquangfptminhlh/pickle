import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import "dotenv/config";
import {pool} from "./db.js";

const secret=()=>process.env.JWT_SECRET||"";
export const hashPassword=p=>bcrypt.hash(p,12);
export const verifyPassword=(p,h)=>bcrypt.compare(p,h);
export const signUser=u=>jwt.sign({sub:u.id},secret(),{expiresIn:"12h",issuer:"pickle-tour",audience:"pickle-admin"});

function tokenFrom(req){
  return req.cookies?.pickle_token||req.headers.authorization?.replace(/^Bearer\s+/i,"");
}

export async function sessionUser(req){
  const token=tokenFrom(req);
  if(!token)return null;
  let claims;
  try{claims=jwt.verify(token,secret(),{issuer:"pickle-tour",audience:"pickle-admin"})}
  catch{return null}
  const row=(await pool.query(
    "select id,email,display_name,role,active,club_id from app_users where id=$1",
    [claims.sub]
  )).rows[0];
  if(!row?.active)return null;
  return {sub:row.id,id:row.id,email:row.email,name:row.display_name,role:row.role,clubId:row.club_id||null};
}

export async function authRequired(req,res,next){
  try{
    const user=await sessionUser(req);
    if(!user)return res.status(401).json({error:"AUTH_REQUIRED"});
    req.user=user;next();
  }catch(nextErr){next(nextErr)}
}
export const allow=(...roles)=>(req,res,next)=>roles.includes(req.user?.role)?next():res.status(403).json({error:"FORBIDDEN"});
