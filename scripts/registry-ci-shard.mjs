// Preserve the full legacy browser suite while executing independent shards in parallel CI jobs.
// Commands originate from the original "Registry desktop and mobile browser regressions" step.
import {spawnSync} from "node:child_process";
const commands=[
  "node scripts/registry-ui.mjs",
  "node scripts/registry-accounts-ui.mjs",
  "node scripts/registry-operator-center-ui.mjs",
  "node scripts/registry-draw-reset-ui.mjs",
  "node scripts/registry-gallery-ui.mjs",
  "node scripts/registry-court-scheduling-ui.mjs",
  "node scripts/registry-timeout-clock-ui.mjs",
  "node scripts/registry-relay-draw-ui.mjs",
  "node scripts/registry-lifecycle-ui.mjs",
  "node scripts/registry-role-pages-ui.mjs",
  "node --test scripts/registry-tournament-progress.test.mjs scripts/registry-tournament-recovery-ui.mjs",
  "node --test scripts/registry-api-client.test.mjs",
  "node --test scripts/registry-team-lineup.test.mjs",
  "node --test scripts/registry-series-ui.test.mjs",
  "node --test scripts/registry-completed-score.test.mjs",
  "node scripts/registry-series-browser.mjs",
  "node scripts/registry-mlp-championship-ui.mjs",
  "node scripts/registry-scoring-ui.mjs",
  "node scripts/registry-referee-arena-ui.mjs",
  "node scripts/mlp-court-control-ui.mjs",
  "node scripts/registry-open-play-ui.mjs",
  "node scripts/registry-legacy-ui.mjs",
  "node scripts/registry-design-ui.mjs",
  "node scripts/registry-site-design-ui.mjs",
  "SITE_THEME=light node scripts/registry-site-design-ui.mjs",
  "DESIGN_THEME=light node scripts/registry-design-ui.mjs",
  "SITE_MOTION=no-preference SITE_WIDTH=375 node scripts/registry-site-design-ui.mjs",
  "SITE_THEME=light SITE_MOTION=no-preference SITE_WIDTH=375 node scripts/registry-site-design-ui.mjs",
  "DESIGN_MOTION=no-preference node scripts/registry-design-ui.mjs",
  "node --test scripts/registry-motion-ui.test.mjs scripts/registry-realtime.test.mjs scripts/registry-draw-ui.test.mjs scripts/registry-checkin-ui.test.mjs scripts/ui-smoke-readiness.test.mjs scripts/registry-image-shrink.test.mjs scripts/registry-poster-variants.test.mjs",
  "node --test scripts/registry-network-ui.test.mjs"
];
// Keep the expensive site-design runs independent so one slow viewport does not block the others.
const groups=[[0,1,2],[3,4,5,6],[7,8,9,10,11,12,13,14],[15,16,17,18,19,20,21],[22,23,24],[25],[28,29,30],[26],[27]];
const shard=Number(process.argv[2]);
if(!Number.isInteger(shard)||shard<0||shard>=groups.length)throw Error("Expected shard 0.."+(groups.length-1));
if(groups.flat().slice().sort((a,b)=>a-b).join(",")!==commands.map((_,i)=>i).join(","))throw Error("Registry command coverage mismatch");
for(const idx of groups[shard]){
  const cmd=commands[idx];
  process.stdout.write("\n=== Registry shard "+shard+": ["+idx+"] "+cmd+" ===\n");
  const res=spawnSync("bash",["-e","-c",cmd],{stdio:"inherit",env:process.env});
  if(res.error)throw res.error;
  if(res.status!==0)process.exit(res.status||1);
}
console.log("REGISTRY_SHARD_"+shard+"_OK");
