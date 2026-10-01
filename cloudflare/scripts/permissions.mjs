const base=process.env.PICKLE_CF_TEST_URL||"http://127.0.0.1:8787";

async function raw(path,{method="GET",token=null,body,ok=[200,201,204]}={}){
  const headers={};
  if(token)headers.Authorization="Bearer "+token;
  if(body!==undefined)headers["Content-Type"]="application/json";
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={text}}
  if(!ok.includes(r.status))throw new Error(method+" "+path+" -> "+r.status+" "+text);
  return {status:r.status,data};
}
function assert(v,m){if(!v)throw new Error("ASSERT: "+m)}
const stamp=Date.now();
const adminLogin=(await raw("/api/auth/login",{method:"POST",body:{email:"admin@pickle.test",password:"cloudflare-test-password-123"}})).data;
assert(adminLogin.token&&adminLogin.user?.role==="super_admin","admin login");
const admin=adminLogin.token;

const clubA=(await raw("/api/clubs",{method:"POST",token:admin,body:{name:"Perm Club A "+stamp,city:"HCMC"}})).data;
const clubB=(await raw("/api/clubs",{method:"POST",token:admin,body:{name:"Perm Club B "+stamp,city:"HCMC"}})).data;
const pA=(await raw("/api/players",{method:"POST",token:admin,body:{fullName:"Perm Player A "+stamp,clubId:clubA.id,rating:3.2}})).data;
const pB=(await raw("/api/players",{method:"POST",token:admin,body:{fullName:"Perm Player B "+stamp,clubId:clubB.id,rating:3.4}})).data;
const pC=(await raw("/api/players",{method:"POST",token:admin,body:{fullName:"Perm Player C "+stamp,clubId:clubA.id,rating:3.1}})).data;
const pD=(await raw("/api/players",{method:"POST",token:admin,body:{fullName:"Perm Player D "+stamp,clubId:clubB.id,rating:3.3}})).data;
const adminEdited=(await raw("/api/players/"+pA.id,{
  method:"PATCH",token:admin,
  body:{
    fullName:"Perm Player A Edited "+stamp,
    nickname:"Ace",
    gender:"female",
    clubId:clubB.id,
    phone:"0900000000",
    active:true,
    rating:3.7,
    ratingReason:"Hiệu chỉnh hồ sơ kiểm thử"
  }
})).data;
assert(adminEdited.full_name.includes("Edited"),"admin edits player name");
assert(adminEdited.club_id===clubB.id,"admin moves player to another club");
assert(Number(adminEdited.rating)===3.7,"admin edits rating");
assert(adminEdited.ratingHistoryRecorded===true,"rating edit records history");
await raw("/api/players/"+pA.id,{method:"PATCH",token:admin,body:{rating:3.8},ok:[400]});
await raw("/api/players/"+pA.id,{method:"PATCH",token:admin,body:{clubId:"missing-club"},ok:[400]});

const tournament=(await raw("/api/tournaments",{method:"POST",token:admin,body:{name:"Permission Tournament "+stamp,venue:"CI",eventType:"doubles"}})).data;
let state=(await raw("/api/admin/state",{token:admin})).data;
const division=state.divisions.find(x=>x.tournamentId===tournament.id);
assert(division?.id,"division created");
const beforeAtomic=(await raw("/api/admin/state",{token:admin})).data;
const teamA=(await raw("/api/divisions/"+division.id+"/teams",{
  method:"POST",token:admin,body:{name:"Perm Team A",clubId:clubA.id,playerIds:[pA.id,pB.id]}
})).data;
let atomicState=(await raw("/api/admin/state",{token:admin})).data;
assert((atomicState.teamPlayers[teamA.id]||[]).length===2,"team and player links created together");
await raw("/api/divisions/"+division.id+"/teams",{method:"POST",token:admin,body:{name:"Duplicate",playerIds:[pA.id,pA.id]},ok:[400]});
await raw("/api/divisions/"+division.id+"/teams",{method:"POST",token:admin,body:{name:"Wrong count",playerIds:[pA.id]},ok:[400]});
await raw("/api/divisions/"+division.id+"/teams",{method:"POST",token:admin,body:{name:"Already assigned",playerIds:[pA.id,pB.id]},ok:[409]});
const inactive=(await raw("/api/players",{method:"POST",token:admin,body:{fullName:"Inactive Player "+stamp,rating:3}})).data;
await raw("/api/players/"+inactive.id,{method:"DELETE",token:admin});
await raw("/api/divisions/"+division.id+"/teams",{method:"POST",token:admin,body:{name:"Inactive Pair",playerIds:[inactive.id,pC.id]},ok:[400]});
atomicState=(await raw("/api/admin/state",{token:admin})).data;
assert(atomicState.teams.length===beforeAtomic.teams.length+1,"failed team requests leave no rows");

const teamB=(await raw("/api/divisions/"+division.id+"/teams",{
  method:"POST",token:admin,body:{name:"Perm Team B",clubId:clubB.id,playerIds:[pC.id,pD.id]}
})).data;
const secondTournament=(await raw("/api/tournaments",{method:"POST",token:admin,body:{name:"Second Permission Tournament "+stamp,venue:"CI",eventType:"doubles"}})).data;
const secondState=(await raw("/api/admin/state",{token:admin})).data;
const secondDivision=secondState.divisions.find(x=>x.tournamentId===secondTournament.id);
const pE=(await raw("/api/players",{method:"POST",token:admin,body:{fullName:"Perm Player E "+stamp,rating:3.5}})).data;
await raw("/api/divisions/"+secondDivision.id+"/teams",{method:"POST",token:admin,body:{name:"Cross Division Pair",playerIds:[pA.id,pE.id]}});
const regA=(await raw("/api/divisions/"+division.id+"/registrations",{method:"POST",token:admin,body:{teamId:teamA.id,amount:300000}})).data;
const regB=(await raw("/api/divisions/"+division.id+"/registrations",{method:"POST",token:admin,body:{teamId:teamB.id,amount:900000}})).data;

const userPassword="permission-user-password-123";
const orgEmail="perm-org-"+stamp+"@pickle.test";
const organizerUser=(await raw("/api/users",{method:"POST",token:admin,body:{name:"Perm Organizer",email:orgEmail,password:userPassword,role:"organizer",tournamentId:tournament.id}})).data;
assert(organizerUser.role==="organizer","organizer created");
let organizer=(await raw("/api/auth/login",{method:"POST",body:{email:orgEmail,password:userPassword}})).data;
const orgUsers=(await raw("/api/users",{token:organizer.token})).data;
assert(orgUsers.some(x=>x.id===organizerUser.id)&&!orgUsers.some(x=>x.role==="super_admin"),"organizer user list scoped");
await raw("/api/users",{method:"POST",token:organizer.token,body:{name:"Blocked manager",email:"blocked-"+stamp+"@pickle.test",password:userPassword,role:"club_manager",clubId:clubA.id},ok:[403]});
const refEmail="perm-ref-"+stamp+"@pickle.test";
const refereeUser=(await raw("/api/users/referees",{method:"POST",token:organizer.token,body:{name:"Perm Ref",email:refEmail,password:userPassword,tournamentId:tournament.id}})).data;
assert(refereeUser.role==="referee","organizer can create scoped referee");

const rotated="permission-rotated-password-123";
await raw("/api/users/"+organizerUser.id,{method:"PATCH",token:admin,body:{password:rotated}});
await raw("/api/admin/state",{token:organizer.token,ok:[401]});
organizer=(await raw("/api/auth/login",{method:"POST",body:{email:orgEmail,password:rotated}})).data;
await raw("/api/admin/state",{token:organizer.token});
await raw("/api/users/"+organizerUser.id,{method:"PATCH",token:admin,body:{active:false}});
await raw("/api/admin/state",{token:organizer.token,ok:[401]});

const referee=(await raw("/api/auth/login",{method:"POST",body:{email:refEmail,password:userPassword}})).data;
await raw("/api/tournaments",{method:"POST",token:referee.token,body:{name:"Blocked"},ok:[403]});
await raw("/api/registrations/"+regA.id+"/checkin",{method:"POST",token:referee.token,body:{},ok:[403]});
await raw("/api/registrations",{token:referee.token,ok:[403]});

const mgrEmail="perm-manager-"+stamp+"@pickle.test";
const mgrUser=(await raw("/api/users",{method:"POST",token:admin,body:{name:"Perm Manager",email:mgrEmail,password:userPassword,role:"club_manager",clubId:clubA.id}})).data;
assert(mgrUser.role==="club_manager"&&mgrUser.clubId===clubA.id,"club manager created with club scope");
const manager=(await raw("/api/auth/login",{method:"POST",body:{email:mgrEmail,password:userPassword}})).data;
const mgrPlayers=(await raw("/api/players",{token:manager.token})).data;
assert(mgrPlayers.every(p=>p.club_id===clubA.id),"club manager roster scoped");
const managerMade=(await raw("/api/players",{method:"POST",token:manager.token,body:{fullName:"Manager Made "+stamp,clubId:clubB.id,rating:4.8}})).data;
assert(managerMade.club_id===clubA.id&&Number(managerMade.rating)===3,"club manager cannot escape club/rating scope");
const managerEdited=(await raw("/api/players/"+managerMade.id,{
  method:"PATCH",token:manager.token,
  body:{nickname:"Manager edit",clubId:clubB.id,rating:4.9,phone:"0911111111",active:false}
})).data;
assert(managerEdited.nickname==="Manager edit","club manager edits basic player data");
assert(managerEdited.club_id===clubA.id,"club manager cannot move player");
assert(Number(managerEdited.rating)===3,"club manager cannot edit rating");
assert(managerEdited.phone==="0911111111"&&managerEdited.active===0,"club manager edits allowed operational fields");
await raw("/api/players/"+pB.id,{method:"PATCH",token:manager.token,body:{nickname:"blocked"},ok:[403]});
await raw("/api/clubs/"+clubA.id,{method:"PATCH",token:manager.token,body:{city:"HCMC"}});
await raw("/api/clubs/"+clubB.id,{method:"PATCH",token:manager.token,body:{city:"blocked"},ok:[403]});
await raw("/api/tournaments",{method:"POST",token:manager.token,body:{name:"Blocked"},ok:[403]});
await raw("/api/users",{token:manager.token,ok:[403]});
await raw("/api/club-transactions",{method:"POST",token:manager.token,body:{clubId:clubB.id,direction:"income",amount:100000},ok:[201]});
const mgrLedger=(await raw("/api/club-transactions",{token:manager.token})).data;
assert(mgrLedger.every(x=>x.club_id===clubA.id),"club manager treasury scoped");

const finEmail="perm-finance-"+stamp+"@pickle.test";
const finUser=(await raw("/api/users",{method:"POST",token:admin,body:{name:"Perm Finance",email:finEmail,password:userPassword,role:"finance",clubId:clubA.id}})).data;
assert(finUser.role==="finance"&&finUser.clubId===clubA.id,"finance created with club scope");
const finance=(await raw("/api/auth/login",{method:"POST",body:{email:finEmail,password:userPassword}})).data;
const financeRegs=(await raw("/api/registrations",{token:finance.token})).data;
assert(financeRegs.some(x=>x.id===regA.id)&&!financeRegs.some(x=>x.id===regB.id),"finance registrations scoped");
await raw("/api/clubs/"+clubA.id,{method:"PATCH",token:finance.token,body:{city:"blocked"},ok:[403]});
await raw("/api/registrations/"+regB.id+"/payment",{method:"POST",token:finance.token,body:{method:"cash"},ok:[403]});
await raw("/api/registrations/"+regA.id+"/payment",{method:"POST",token:finance.token,body:{method:"cash"}});
const report=(await raw("/api/reports/overview",{token:finance.token})).data;
assert(Number(report.registrations)>=1&&Number(report.revenue)<900000,"finance overview scoped");
await raw("/api/tournaments",{method:"POST",token:finance.token,body:{name:"Blocked"},ok:[403]});
await raw("/api/users",{token:finance.token,ok:[403]});
await raw("/api/players",{token:finance.token,ok:[403]});
await raw("/api/club-events/"+(await raw("/api/club-events",{token:finance.token})).data?.[0]?.id+"/attendance",{token:finance.token,ok:[403,404]});

await raw("/api/admin/state",{ok:[401]});
console.log("CLOUDFLARE_PERMISSIONS_OK",JSON.stringify({
  organizer:true,referee:true,clubManager:true,finance:true,
  scopedRoster:true,scopedPayments:true,passwordRevocation:true,deactivationRevocation:true
}));
