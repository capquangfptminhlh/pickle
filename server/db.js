import pg from "pg";
import "dotenv/config";
const {Pool}=pg;
export const pool=new Pool({connectionString:process.env.DATABASE_URL});
export async function tx(fn){
  const c=await pool.connect();
  try{await c.query("begin");const r=await fn(c);await c.query("commit");return r}
  catch(e){await c.query("rollback");throw e}
  finally{c.release()}
}
