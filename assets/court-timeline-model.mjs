// Shared by the public browser view and Node regression tests. Read-only; no DB writes.
export const terminalStatus=new Set(["done","completed","walkover","cancelled"]);
const val=x=>String(x??"");
const time=m=>Date.parse(m.scheduledAt||m.scheduled_at||"");
const qRank=m=>m.status==="live"?0:({live:0,warming_up:1,on_deck:2,called:3,scheduled:4}[m.courtState||m.court_state]??5);
export function sortTimelineMatches(items){
  return [...items].sort((a,b)=>{
    const ar=qRank(a),br=qRank(b);
    if(ar!==br)return ar-br;
    const at=time(a),bt=time(b);
    if(Number.isFinite(at)&&Number.isFinite(bt)&&at!==bt)return at-bt;
    if(Number.isFinite(at)!==Number.isFinite(bt))return Number.isFinite(at)?-1:1;
    return val(a.id).localeCompare(val(b.id));
  });
}
export function buildCourtTimeline(state,tournamentId){
  const tournaments=Array.isArray(state?.tournaments)?state.tournaments:[];
  const t=tournaments.find(x=>val(x.id)===val(tournamentId));
  if(!t)return null;
  const ds=new Set((state.divisions||[]).filter(x=>val(x.tournamentId??x.tournament_id)===val(tournamentId)).map(x=>val(x.id)));
  const courts=(state.courts||[]).filter(x=>val(x.tournamentId??x.tournament_id)===val(tournamentId)&&x.active!==false).sort((a,b)=>Number(a.sortOrder??a.sort_order??0)-Number(b.sortOrder??b.sort_order??0)||val(a.name).localeCompare(val(b.name),"vi"));
  const courtIds=new Set(courts.map(x=>val(x.id)));
  const matches=(state.matches||[]).filter(m=>ds.has(val(m.divisionId??m.division_id))&&!terminalStatus.has(val(m.status)));
  const unplaced=sortTimelineMatches(matches.filter(m=>!courtIds.has(val(m.courtId??m.court_id))));
  const columns=courts.map(c=>({court:c,matches:sortTimelineMatches(matches.filter(m=>val(m.courtId??m.court_id)===val(c.id)))}));
  return {tournament:t,columns,unplaced,summary:{
    activeCourts:courts.length,
    total:matches.length,
    assigned:matches.length-unplaced.length,
    unplaced:unplaced.length,
    live:matches.filter(m=>m.status==="live"||m.courtState==="live"||m.court_state==="live").length
  }};
}
