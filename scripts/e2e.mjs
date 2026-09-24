const base=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const adminEmail=process.env.ADMIN_EMAIL;
const adminPassword=process.env.ADMIN_PASSWORD;
const stamp=Date.now().toString().slice(-8);

async function raw(path,{method="GET",body,cookie,ok=[200,201]}={}){
  const r=await fetch(base+path,{
    method,
    headers:{
      ...(body!==undefined?{"Content-Type":"application/json"}:{}),
      ...(cookie?{Cookie:cookie}:{})
    },
    body:body!==undefined?JSON.stringify(body):undefined,
    redirect:"manual"
  });
  const text=await r.text();
  let data;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!ok.includes(r.status))throw new Error(method+" "+path+" -> "+r.status+" "+text);
  return {r,data};
}
async function login(email,password){
  const {r,data}=await raw("/api/auth/login",{method:"POST",body:{email,password}});
  const set=r.headers.get("set-cookie");if(!set)throw new Error("No auth cookie");
  return {cookie:set.split(";")[0],user:data.user};
}
const assert=(v,msg)=>{if(!v)throw new Error("ASSERT: "+msg)};

const admin=await login(adminEmail,adminPassword);
let state=(await raw("/api/admin/state",{cookie:admin.cookie})).data;
assert(Array.isArray(state.tournaments),"admin state");

const created=(await raw("/api/tournaments",{method:"POST",cookie:admin.cookie,body:{
  name:"CI Open "+stamp,venue:"CI Court",startAt:new Date(Date.now()+86400000).toISOString(),eventType:"doubles",format:"pool_to_knockout"
}})).data;
const tid=created.tournament.id,did=created.division.id;
assert(tid&&did,"create tournament and default division");

await raw("/api/tournaments/"+tid,{method:"PATCH",cookie:admin.cookie,body:{publicVisible:true,status:"registration",venue:"CI Arena"}});

const court=(await raw("/api/tournaments/"+tid+"/courts",{method:"POST",cookie:admin.cookie,body:{name:"CI Court 1"}})).data;
const spareCourt=(await raw("/api/tournaments/"+tid+"/courts",{method:"POST",cookie:admin.cookie,body:{name:"CI Court Spare"}})).data;
await raw("/api/courts/"+spareCourt.id,{method:"DELETE",cookie:admin.cookie});

const club=(await raw("/api/clubs",{method:"POST",cookie:admin.cookie,body:{name:"CI Club "+stamp,city:"HCMC"}})).data;
await raw("/api/clubs/"+club.id,{method:"PATCH",cookie:admin.cookie,body:{name:"CI Club Updated "+stamp,city:"HCMC",active:true}});

const player=(await raw("/api/players",{method:"POST",cookie:admin.cookie,body:{fullName:"CI Player "+stamp,rating:3.1,clubId:club.id,gender:"male"}})).data;
await raw("/api/players/"+player.id,{method:"PATCH",cookie:admin.cookie,body:{nickname:"CI",active:true}});
await raw("/api/players/"+player.id+"/rating-adjust",{method:"POST",cookie:admin.cookie,body:{delta:0.01,reason:"CI rating test"}});

const teamA=(await raw("/api/divisions/"+did+"/teams",{method:"POST",cookie:admin.cookie,body:{name:"CI A "+stamp,club:"CI Club Updated "+stamp,group:"A",seed:1}})).data;
const teamB=(await raw("/api/divisions/"+did+"/teams",{method:"POST",cookie:admin.cookie,body:{name:"CI B "+stamp,group:"A",seed:2}})).data;
await raw("/api/teams/"+teamB.id,{method:"PATCH",cookie:admin.cookie,body:{group:"B",seed:2,status:"active"}});

const match=(await raw("/api/divisions/"+did+"/matches",{method:"POST",cookie:admin.cookie,body:{teamAId:teamA.id,teamBId:teamB.id,courtId:court.id,stage:"CI Round"}})).data;
let adminState=(await raw("/api/admin/state",{cookie:admin.cookie})).data;
let view=adminState.matches.find(x=>x.id===match.id);
assert(view&&view.version,"match visible");

await raw("/api/matches/"+match.id+"/point",{method:"POST",cookie:admin.cookie,body:{side:"A",delta:1,expectedVersion:view.version}});
await raw("/api/matches/"+match.id+"/undo",{method:"POST",cookie:admin.cookie,body:{}});
await raw("/api/matches/"+match.id,{method:"DELETE",cookie:admin.cookie});

// A tied score can never complete a set, even when win-by-two is disabled.
await raw("/api/divisions/"+did,{method:"PATCH",cookie:admin.cookie,body:{pointsToWin:11,winByTwo:false}});
const tieMatch=(await raw("/api/divisions/"+did+"/matches",{method:"POST",cookie:admin.cookie,body:{teamAId:teamA.id,teamBId:teamB.id,courtId:court.id,stage:"CI Tie Guard"}})).data;
adminState=(await raw("/api/admin/state",{cookie:admin.cookie})).data;
let tieView=adminState.matches.find(x=>x.id===tieMatch.id);
let tiePoint=tieView;
for(let score=0;score<11;score++){
  tiePoint=(await raw("/api/matches/"+tieMatch.id+"/point",{method:"POST",cookie:admin.cookie,body:{side:"A",delta:1,expectedVersion:tiePoint.version}})).data;
  tiePoint=(await raw("/api/matches/"+tieMatch.id+"/point",{method:"POST",cookie:admin.cookie,body:{side:"B",delta:1,expectedVersion:tiePoint.version}})).data;
}
const tieFinish=(await raw("/api/matches/"+tieMatch.id+"/finish-set",{method:"POST",cookie:admin.cookie,body:{expectedVersion:tiePoint.version},ok:[400]})).data;
assert(tieFinish.error==="INVALID_SET_SCORE","tied set score rejected");
await raw("/api/matches/"+tieMatch.id,{method:"DELETE",cookie:admin.cookie});

const single=(await raw("/api/tournaments/"+tid+"/divisions",{method:"POST",cookie:admin.cookie,body:{name:"CI Single Elim",eventType:"doubles",format:"single_elimination",bestOf:3,pointsToWin:11,advanceCount:1}})).data;
const wrongDivisionRegistration=(await raw("/api/divisions/"+single.id+"/registrations",{method:"POST",cookie:admin.cookie,body:{teamId:teamA.id,amount:1000},ok:[400]})).data;
assert(wrongDivisionRegistration.error==="TEAM_DIVISION_MISMATCH","registration rejects team from another division");
const seTeams=[];
for(let i=1;i<=5;i++)seTeams.push((await raw("/api/divisions/"+single.id+"/teams",{method:"POST",cookie:admin.cookie,body:{name:"CI SE "+i+" "+stamp,seed:i}})).data);
const seBracket=(await raw("/api/divisions/"+single.id+"/generate-bracket",{method:"POST",cookie:admin.cookie,body:{}})).data;
assert(seBracket.bracketSize===8&&seBracket.created===7,"single elimination bracket with byes");
adminState=(await raw("/api/admin/state",{cookie:admin.cookie})).data;
assert(adminState.matches.some(m=>m.divisionId===single.id&&m.resultReason==="bye"),"bye auto advancement");

const de=(await raw("/api/tournaments/"+tid+"/divisions",{method:"POST",cookie:admin.cookie,body:{name:"CI Double Elim",eventType:"doubles",format:"double_elimination",bestOf:3,pointsToWin:11,advanceCount:1}})).data;
const deTeams=[];
for(let i=1;i<=4;i++)deTeams.push((await raw("/api/divisions/"+de.id+"/teams",{method:"POST",cookie:admin.cookie,body:{name:"CI DE "+i+" "+stamp,seed:i}})).data);
const deBracket=(await raw("/api/divisions/"+de.id+"/generate-bracket",{method:"POST",cookie:admin.cookie,body:{}})).data;
assert(deBracket.created===6,"double elimination 4-team bracket");
adminState=(await raw("/api/admin/state",{cookie:admin.cookie})).data;
const deFirst=adminState.matches.find(m=>m.divisionId===de.id&&m.bracketSlot==="DE-W-R1-M1");
assert(deFirst,"double elimination first match");
await raw("/api/matches/"+deFirst.id+"/special-result",{method:"POST",cookie:admin.cookie,body:{winnerTeamId:deFirst.a,reason:"walkover",note:"CI routing"}}); 
adminState=(await raw("/api/admin/state",{cookie:admin.cookie})).data;
const deWFinal=adminState.matches.find(m=>m.divisionId===de.id&&m.bracketSlot==="DE-W-F");
const deLoserR1=adminState.matches.find(m=>m.divisionId===de.id&&m.bracketSlot==="DE-L-R1-M1");
assert([deWFinal.a,deWFinal.b].includes(deFirst.a),"winner routed to winners bracket");
assert([deLoserR1.a,deLoserR1.b].includes(deFirst.b),"loser routed to losers bracket");

const reg=(await raw("/api/divisions/"+did+"/registrations",{method:"POST",cookie:admin.cookie,body:{teamId:teamA.id,amount:500000}})).data;
await raw("/api/registrations/"+reg.id+"/checkin",{method:"POST",cookie:admin.cookie,body:{}});
const qr=(await raw("/api/registrations/"+reg.id+"/checkin-qr",{cookie:admin.cookie})).data;
assert(qr.dataUrl?.startsWith("data:image/png"),"QR generated");
await raw("/api/registrations/"+reg.id+"/undo-checkin",{method:"POST",cookie:admin.cookie,body:{}});

const sponsor=(await raw("/api/sponsors",{method:"POST",cookie:admin.cookie,body:{name:"CI Sponsor "+stamp,tier:"Gold"}})).data;
await raw("/api/sponsors/"+sponsor.id,{method:"PATCH",cookie:admin.cookie,body:{tier:"Title"}});
await raw("/api/sponsors/"+sponsor.id,{method:"DELETE",cookie:admin.cookie});

const post=(await raw("/api/posts",{method:"POST",cookie:admin.cookie,body:{title:"CI News "+stamp,excerpt:"CI",body:"CI body",status:"published",tournamentId:tid}})).data;
await raw("/api/posts/"+post.id,{method:"PATCH",cookie:admin.cookie,body:{excerpt:"CI updated"}});
await raw("/api/posts/"+post.id,{method:"DELETE",cookie:admin.cookie});

const start=new Date(Date.now()+2*3600000),end=new Date(start.getTime()+3600000);
const booking=(await raw("/api/bookings",{method:"POST",cookie:admin.cookie,body:{courtId:court.id,title:"CI Booking "+stamp,startAt:start.toISOString(),endAt:end.toISOString()}})).data;
await raw("/api/bookings/"+booking.id,{method:"DELETE",cookie:admin.cookie});

const report=(await raw("/api/reports/overview",{cookie:admin.cookie})).data;
assert(Number.isFinite(Number(report.players)),"report overview");

const refEmail="ci-ref-"+stamp+"@pickle.test",refPassword="ci-ref-password-123";
await raw("/api/users/referees",{method:"POST",cookie:admin.cookie,body:{name:"CI Ref",email:refEmail,password:refPassword}});
const ref=await login(refEmail,refPassword);
await raw("/api/tournaments",{method:"POST",cookie:ref.cookie,body:{name:"SHOULD FAIL"} ,ok:[403]});

await raw("/manifest.webmanifest");
await raw("/service-worker.js");
await raw("/api/health");

await raw("/api/players/"+player.id,{method:"DELETE",cookie:admin.cookie});
await raw("/api/registrations/"+reg.id,{method:"DELETE",cookie:admin.cookie});
await raw("/api/teams/"+teamA.id,{method:"DELETE",cookie:admin.cookie});
await raw("/api/teams/"+teamB.id,{method:"DELETE",cookie:admin.cookie});
await raw("/api/divisions/"+did,{method:"DELETE",cookie:admin.cookie});
await raw("/api/tournaments/"+tid,{method:"DELETE",cookie:admin.cookie});

console.log("E2E PASS",{
  tournament:tid,
  division:did,
  court:court.id,
  player:player.id,
  roleProtection:true,
  pwa:true
});
