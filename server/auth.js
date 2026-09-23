import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import "dotenv/config";

const secret=()=>process.env.JWT_SECRET||"";
export const hashPassword=p=>bcrypt.hash(p,12);
export const verifyPassword=(p,h)=>bcrypt.compare(p,h);
export const signUser=u=>jwt.sign({sub:u.id,role:u.role,name:u.display_name,email:u.email},secret(),{expiresIn:"12h"});

export function authRequired(req,res,next){
  const token=req.cookies?.pickle_token||req.headers.authorization?.replace(/^Bearer\s+/i,"");
  if(!token)return res.status(401).json({error:"AUTH_REQUIRED"});
  try{req.user=jwt.verify(token,secret());next()}
  catch{return res.status(401).json({error:"INVALID_SESSION"})}
}
export const allow=(...roles)=>(req,res,next)=>roles.includes(req.user?.role)?next():res.status(403).json({error:"FORBIDDEN"});
