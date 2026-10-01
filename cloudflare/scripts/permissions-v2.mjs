const base=process.env.PICKLE_CF_TEST_URL||"http://127.0.0.1:8787";

async function raw(path,{method="GET",token=null,body,ok=[200,201,204]}={}){
  const headers={};
  if(token)headers.Authorization="Bearer "+token;
  if(body!==undefined)headers["Content-Type"]="application/json";
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();
  let data={}; try{data=text?JSON.parse(text):{}}catch{data={text}}
  if(!ok.includes(r.status))throw new Error(method+" "+path+" -> "+r.status+" "+text);
  return {status:r.status,data};
}
function assert(v,m){if(!v)throw new Error("ASSERT: "+m)}
const stamp=Date.now();
const root=(await raw("/api/auth/login",{method:"POST",body:{email:"admin@pickle.test",password:"cloudflare-test-password-123"}})).data;
assert(root.token&&root.user?.role==="super_admin","admin login");
const admin=root.token;

const clubA=(await raw("/api/clubs",{method:"POST",token:admin,body:{name:"Perm2 A "+stamp,city:"HCMC"}})).data;
const clubB=(await raw("/api/clubs",{method:"POST",token:admin,body:{name:"Perm2 B "+stamp,city:"HCMC"}})).data;

const imported=(await raw("/api/import/players",{method:"POST",token:admin,body:{rows:[
  {fullName:"Perm2 A1 "+stamp,clubId:clubA.id,rating:3.1},
  {fullName:"Perm2 A2 "+stamp,clubId:clubA.id,rating:3.2},
  {fullName:"Perm2 B1 "+stamp,clubId:clubB.id,rating:3.3,avatarUrl:"https://example.com/b1.png"},
  {fullName:"Perm2 B2 "+stamp,clubId:clubB.id,rating:3.4,avatarUrl:"https://example.com/b2.png"},
  {fullName:"Perm2 Global 1 "+stamp,rating:3.0},
  {fullName:"Perm2 Global 2 "+stamp,rating:3.0}
]}})).data;
assert(imported.ids?.length===6,"registry players imported");

const tournament=(await raw("/api/tournaments",{method:"POST",token:admin,body:{name:"Perm2 Tournament "+stamp,venue:"CI"}})).data;
let state=(await raw("/api/admin/state",{token:admin})).data;
const division=state.divisions.find(x=>x.tournamentId===tournament.id);
assert(division?.id,"division created");

const teamA=(await raw("/api/divisions/"+division.id+"/teams",{method:"POST",token:admin,body:{
  name:"Perm2 Team A",clubId:clubA.id,playerIds:[imported.ids[0],imported.ids[1]]
}})).data;
const teamB=(await raw("/api/divisions/"+division.id+"/teams",{method:"POST",token:admin,body:{
  name:"Perm2 Team B",clubId:clubB.id,playerIds:[imported.ids[2],imported.ids[3]]
}})).data;
assert(teamA.id&&teamB.id,"registry teams created without requiring avatars");

const regA=(await raw("/api/divisions/"+division.id+"/registrations",{method:"POST",token:admin,body:{teamId:teamA.id,amount:300000}})).data;
const regB=(await raw("/api/divisions/"+division.id+"/registrations",{method:"POST",token:admin,body:{teamId:teamB.id,amount:900000}})).data;

const userPass="permission-user-password-123";
const orgEmail="perm2-org-"+stamp+"@pickle.test";
const orgUser=(await raw("/api/users",{method:"POST",token:admin,body:{name:"Perm2 Organizer",email:orgEmail,password:userPass,role:"organizer",tournamentId:tournament.id}})).data;
const organizer=(await raw("/api/auth/login",{method:"POST",body:{email:orgEmail,password:userPass}})).data;
assert(orgUser.role==="organizer"&&organizer.token,"organizer works");
const orgUsers=(await raw("/api/users",{token:organizer.token})).data;
assert(!orgUsers.some(x=>x.role==="super_admin"),"organizer cannot enumerate super admins");
const orgPlayers=(await raw("/api/players",{token:organizer.token})).data;
assert(orgPlayers.some(x=>x.id===imported.ids[4])&&orgPlayers.some(x=>x.id===imported.ids[5]),"organizer can search the global registry");
const organizerTeam=(await raw("/api/divisions/"+division.id+"/teams",{method:"POST",token:organizer.token,body:{playerIds:[imported.ids[4],imported.ids[5]]}})).data;
assert(organizerTeam.id,"organizer can select global registry players without editing their profiles");
await raw("/api/users",{method:"POST",token:organizer.token,body:{name:"Blocked",email:"blocked-"+stamp+"@pickle.test",password:userPass,role:"club_manager",clubId:clubA.id},ok:[403]});

const refEmail="perm2-ref-"+stamp+"@pickle.test";
const ref=(await raw("/api/users/referees",{method:"POST",token:organizer.token,body:{name:"Perm2 Ref",email:refEmail,password:userPass,tournamentId:tournament.id}})).data;
const referee=(await raw("/api/auth/login",{method:"POST",body:{email:refEmail,password:userPass}})).data;
assert(ref.role==="referee"&&referee.token,"scoped referee works");
await raw("/api/tournaments",{method:"POST",token:referee.token,body:{name:"Blocked"},ok:[403]});
await raw("/api/registrations",{token:referee.token,ok:[403]});

const mgrEmail="perm2-manager-"+stamp+"@pickle.test";
const mgr=(await raw("/api/users",{method:"POST",token:admin,body:{name:"Perm2 Manager",email:mgrEmail,password:userPass,role:"club_manager",clubId:clubA.id}})).data;
const manager=(await raw("/api/auth/login",{method:"POST",body:{email:mgrEmail,password:userPass}})).data;
assert(mgr.role==="club_manager"&&manager.token,"club manager works");
const mgrPlayers=(await raw("/api/players",{token:manager.token})).data;
assert(mgrPlayers.every(x=>x.club_id===clubA.id),"club roster scoped");
await raw("/api/tournaments",{method:"POST",token:manager.token,body:{name:"Blocked"},ok:[403]});
await raw("/api/users",{token:manager.token,ok:[403]});

const finEmail="perm2-fin-"+stamp+"@pickle.test";
const fin=(await raw("/api/users",{method:"POST",token:admin,body:{name:"Perm2 Finance",email:finEmail,password:userPass,role:"finance",clubId:clubA.id}})).data;
const finance=(await raw("/api/auth/login",{method:"POST",body:{email:finEmail,password:userPass}})).data;
assert(fin.role==="finance"&&finance.token,"finance works");
const regs=(await raw("/api/registrations",{token:finance.token})).data;
assert(regs.some(x=>x.id===regA.id)&&!regs.some(x=>x.id===regB.id),"finance registration scope");
await raw("/api/registrations/"+regB.id+"/payment",{method:"POST",token:finance.token,body:{method:"cash"},ok:[403]});
await raw("/api/registrations/"+regA.id+"/payment",{method:"POST",token:finance.token,body:{method:"cash"}});
await raw("/api/players",{token:finance.token,ok:[403]});
await raw("/api/users",{token:finance.token,ok:[403]});
await raw("/api/admin/state",{ok:[401]});

console.log("CLOUDFLARE_PERMISSIONS_V2_OK",JSON.stringify({
  organizer:true,referee:true,clubManager:true,finance:true,globalRegistrySelection:true,registryRosters:true,optionalAvatars:true,scopedPayments:true
}));
