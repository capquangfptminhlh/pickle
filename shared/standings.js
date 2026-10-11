export function isGroupStageMatch(match){
  if(match?.bracketSlot||match?.bracket_slot)return false;
  const stage=String(match?.stage||"");
  return stage.startsWith("Bảng ")||/bảng|group|vòng bảng/i.test(stage)||!/chung kết|bán kết|tứ kết|nhánh thắng|nhánh thua/i.test(stage);
}

const finished=m=>["done","completed","walkover"].includes(String(m?.status||""))&&Boolean(m?.winner||m?.winner_team_id);
const teamA=m=>m?.a||m?.team_a_id||null;
const teamB=m=>m?.b||m?.team_b_id||null;
const winner=m=>m?.winner||m?.winner_team_id||null;
const sets=m=>Array.isArray(m?.sets)?m.sets:[];

function miniStats(ids,matches){
  const stats=new Map([...ids].map(id=>[id,{w:0,l:0,sw:0,sl:0,pf:0,pa:0}]));
  for(const m of matches){
    const a=teamA(m),b=teamB(m),win=winner(m);
    if(!finished(m)||!isGroupStageMatch(m)||!stats.has(a)||!stats.has(b)||a===b||![a,b].includes(win))continue;
    let ap=0,bp=0,asw=0,bsw=0;
    for(const set of sets(m)){
      const sa=Number(set?.[0]||0),sb=Number(set?.[1]||0);
      ap+=sa;bp+=sb;if(sa>sb)asw++;else if(sb>sa)bsw++;
    }
    const x=stats.get(a),y=stats.get(b);
    x.pf+=ap;x.pa+=bp;x.sw+=asw;x.sl+=bsw;win===a?x.w++:x.l++;
    y.pf+=bp;y.pa+=ap;y.sw+=bsw;y.sl+=asw;win===b?y.w++:y.l++;
  }
  return stats;
}

function fallback(a,b){
  const sdA=Number(a.sw||0)-Number(a.sl||0),sdB=Number(b.sw||0)-Number(b.sl||0);
  const pdA=Number(a.pf||0)-Number(a.pa||0),pdB=Number(b.pf||0)-Number(b.pa||0);
  return sdB-sdA||pdB-pdA||Number(b.pf||0)-Number(a.pf||0)||Number(a.seed||9999)-Number(b.seed||9999)||String(a.name||"").localeCompare(String(b.name||""),"vi");
}

export function rankGroupStandings(teams,matches){
  const active=(teams||[]).filter(t=>t&&t.status!=="withdrawn");
  const byWins=new Map();
  for(const team of active){
    const key=Number(team.w||0);
    if(!byWins.has(key))byWins.set(key,[]);
    byWins.get(key).push(team);
  }
  const result=[];
  for(const wins of [...byWins.keys()].sort((a,b)=>b-a)){
    const bucket=byWins.get(wins);
    if(bucket.length===1){result.push(bucket[0]);continue}
    const ids=new Set(bucket.map(t=>t.id));
    const mini=miniStats(ids,matches||[]);
    bucket.sort((a,b)=>{
      const ma=mini.get(a.id)||{},mb=mini.get(b.id)||{};
      if(bucket.length===2&&Number(ma.w||0)!==Number(mb.w||0))return Number(mb.w||0)-Number(ma.w||0);
      const miniSet=(Number(mb.sw||0)-Number(mb.sl||0))-(Number(ma.sw||0)-Number(ma.sl||0));
      const miniPts=(Number(mb.pf||0)-Number(mb.pa||0))-(Number(ma.pf||0)-Number(ma.pa||0));
      return bucket.length>=3?miniPts||miniSet||fallback(a,b):Number(mb.w||0)-Number(ma.w||0)||miniSet||miniPts||fallback(a,b);
    });
    result.push(...bucket);
  }
  return result;
}
