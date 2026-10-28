// Fail closed: never auto-deploy a Worker with pending D1 schema migrations.
// A database migration must be reviewed and applied in the separate manual release.
import {readFileSync,readdirSync} from "node:fs";
import {resolve} from "node:path";

const file=process.argv[2],dir=process.argv[3]||"migrations";
if(!file)throw new Error("Usage: node verify-remote-migrations.mjs <wrangler-json> [migrations-dir]");
let result;
try{result=JSON.parse(readFileSync(file,"utf8"))}catch{throw new Error("Could not parse Wrangler D1 migration status JSON; deployment blocked")}
const batches=Array.isArray(result)?result:[result];
const rows=batches.flatMap(batch=>Array.isArray(batch?.results)?batch.results:[]);
if(!rows.length)throw new Error("Remote D1 migration table is missing or empty; deployment blocked");
const applied=new Set(rows.map(row=>row.name).filter(name=>typeof name==="string"));
const expected=readdirSync(resolve(dir)).filter(name=>/^\d+_.*\.sql$/.test(name)).sort();
if(!expected.length)throw new Error("Local migration files not found; deployment blocked");
const pending=expected.filter(name=>!applied.has(name));
if(pending.length)throw new Error("Production schema not up-to-date. Manual reviewed D1 migration required before auto-deploy: "+pending.join(", "));
console.log("SAFE_TO_DEPLOY: All "+expected.length+" local D1 migrations are recorded on production.");
