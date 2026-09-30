const base=process.env.PICKLE_CF_TEST_URL||"http://127.0.0.1:8787";

async function raw(path,{method="GET",token=null,body,ok=[200,201,204]}={}){
  const headers={};
  if(token)headers.Authorization="Bearer "+token;
  if(body!==undefined)headers["Content-Type"]="application/json";
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();
  let data={};try{data=text?JSON.parse(text):{}}catch{data={text}}
  if(!ok.includes(r.status))throw new Error(method+" "+path+" -> "+r.status+" "+text);
  return {status:r.status,data};
}
function assert(value,message){if(!value)throw new Error("ASSERT: "+message)}
const stamp=Date.now();

const health=(await raw("/api/health")).data;
assert(health.ok&&health.storage==="D1","health uses D1");

const login=(await raw("/api/auth/login",{method:"POST",body:{email:"admin@pickle.test",password:"cloudflare-test-password-123"}})).data;
assert(login.token&&login.user?.role==="super_admin","bootstrap admin login");
const admin=login.token;

const tournament=(await raw("/api/tournaments",{method:"POST",token:admin,body:{name:"CF Smoke "+stamp,venue:"Smoke Court",startAt:new Date().toISOString(),format:"pool_to_knockout"}})).data;
assert(tournament.id,"tournament created");
await raw("/api/tournaments/"+tournament.id,{method:"PATCH",token:admin,body:{status:"registration",publicVisible:true}});

let state=(await raw("/api/admin/state",{token:admin})).data;
const division=state.divisions.find(d=>d.tournamentId===tournament.id);
assert(division?.id,"default division");

const courtA=(await raw("/api/tournaments/"+tournament.id+"/courts",{method:"POST",token:admin,body:{name:"Sân 1",sortOrder:1}})).data;
await raw("/api/tournaments/"+tournament.id+"/courts",{method:"POST",token:admin,body:{name:"Sân 2",sortOrder:2}});

const imported=(await raw("/api/import/players",{method:"POST",token:admin,body:{rows:[
  {fullName:"CF Player 1 "+stamp,gender:"male",rating:3.1},
  {fullName:"CF Player 2 "+stamp,gender:"male",rating:3.0},
  {fullName:"CF Player 3 "+stamp,gender:"female",rating:2.9},
  {fullName:"CF Player 4 "+stamp,gender:"female",rating:2.8}
]}})).data;
assert(imported.created===4&&imported.ids.length===4,"players imported");

const teams=[];
for(let i=0;i<4;i++){
  const t=(await raw("/api/divisions/"+division.id+"/teams",{method:"POST",token:admin,body:{name:"CF Team "+(i+1)+" "+stamp,group:i<2?"A":"B",seed:i+1}})).data;
  teams.push(t);
  await raw("/api/teams/"+t.id+"/players",{method:"POST",token:admin,body:{playerId:imported.ids[i]}});
}
await raw("/api/divisions/"+division.id+"/auto-seed-groups",{method:"POST",token:admin,body:{groupCount:2}});
const rr=(await raw("/api/divisions/"+division.id+"/generate-round-robin",{method:"POST",token:admin,body:{}})).data;
assert(rr.created>=2,"round robin generated");
await raw("/api/divisions/"+division.id+"/auto-schedule-courts",{method:"POST",token:admin,body:{}});

const bracket=(await raw("/api/divisions/"+division.id+"/generate-bracket",{method:"POST",token:admin,body:{}})).data;
assert(bracket.bracketSize===4&&bracket.created===3,"knockout bracket generated");

const refPassword="referee-password-123";
const referee=(await raw("/api/users/referees",{method:"POST",token:admin,body:{name:"CF Referee",email:"cf-ref-"+stamp+"@pickle.test",password:refPassword,tournamentId:tournament.id}})).data;
assert(referee.role==="referee","referee created");

state=(await raw("/api/admin/state",{token:admin})).data;
const bracketMatch=state.matches.find(m=>m.bracketSlot&&m.a!=="TBD"&&m.b!=="TBD");
assert(bracketMatch,"playable bracket match");
await raw("/api/matches/"+bracketMatch.id+"/assignment",{method:"PATCH",token:admin,body:{courtId:courtA.id,refereeUserId:referee.id}});

const refLogin=(await raw("/api/auth/login",{method:"POST",body:{email:referee.email,password:refPassword}})).data;
assert(refLogin.token,"referee login");
const refState=(await raw("/api/admin/state",{token:refLogin.token})).data;
const assigned=refState.matches.find(m=>m.id===bracketMatch.id);
assert(assigned,"referee sees assigned match");

let score=(await raw("/api/matches/"+bracketMatch.id+"/point",{method:"POST",token:refLogin.token,body:{side:"A",delta:1,expectedVersion:assigned.version}})).data;
assert(score.current[0]===1,"referee point saved");
score=(await raw("/api/matches/"+bracketMatch.id+"/undo",{method:"POST",token:refLogin.token,body:{}})).data;
assert(score.current[0]===0,"undo restores point");

score=(await raw("/api/matches/"+bracketMatch.id+"/quick-score",{method:"POST",token:refLogin.token,body:{sets:[[11,5],[11,8]]}})).data;
assert(score.status==="done"&&score.winner,"quick score completes match");

state=(await raw("/api/admin/state",{token:admin})).data;
const next=state.matches.find(m=>m.id!==bracketMatch.id&&m.bracketSlot==="SE-R2-M1");
assert(next&&(next.a===score.winner||next.b===score.winner),"winner advances in bracket");

const reg=(await raw("/api/divisions/"+division.id+"/registrations",{method:"POST",token:admin,body:{teamId:teams[0].id,amount:300000}})).data;
const qr=(await raw("/api/registrations/"+reg.id+"/checkin-qr",{token:admin})).data;
assert(qr.dataUrl?.startsWith("data:image/svg+xml")&&qr.url.includes("checkin.html?token="),"real QR generated");
const checkin=(await raw("/api/checkin/"+encodeURIComponent(qr.token))).data;
assert(checkin.tournament_name,"public checkin lookup");
await raw("/api/checkin/"+encodeURIComponent(qr.token)+"/confirm",{method:"POST",body:{}});
const regs=(await raw("/api/registrations",{token:admin})).data;
assert(regs.find(x=>x.id===reg.id)?.checked_in_at,"public checkin confirmed");

const pub=(await raw("/api/public/state")).data;
assert(pub.tournaments.some(t=>t.id===tournament.id),"public state shared");

// Public tournament submission accepts a real banner and stores it in MEDIA.
const bannerForm=new FormData();
bannerForm.append("name","CF Banner Tournament "+stamp);
bannerForm.append("venue","Banner Court");
bannerForm.append("contactName","Banner Organizer");
bannerForm.append("contactPhone","0900000000");
bannerForm.append("divisionName","Open");
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZP2sAAAAASUVORK5CYII=","base64");
bannerForm.append("banner",new Blob([png],{type:"image/png"}),"banner.png");
const bannerRes=await fetch(base+"/api/public/tournaments/submit",{method:"POST",body:bannerForm});
const bannerData=await bannerRes.json();
assert(bannerRes.status===201&&bannerData.tournament?.posterUrl,"public banner submission created");
const storedBanner=await fetch(bannerData.tournament.posterUrl);
assert(storedBanner.ok&&storedBanner.headers.get("content-type")==="image/png","stored banner is publicly readable");

console.log("CLOUDFLARE_SMOKE_OK",JSON.stringify({
  tournament:tournament.id,
  players:imported.created,
  roundRobin:rr.created,
  bracket:bracket.created,
  referee:referee.id,
  realtimeBackend:"Durable Objects",
  qr:true,
  banner:true
}));
