(()=>{
  const API=window.PickleAPI;
  if(!API)return;

  const AUTH_KEY="pickle-preview-auth-v1";
  const META_KEY="pickle-pages-authz-v2";
  const SUPER={id:"local-admin",email:"admin@pickle.test",display_name:"Quản trị viên",name:"Quản trị viên",role:"super_admin",active:true};
  const DEFAULT_OWNER={
    id:"pages-owner-demo",
    email:"owner@pickle.test",
    display_name:"Chủ giải Demo",
    name:"Chủ giải Demo",
    role:"organizer",
    active:true,
    password:"owner-password-123",
    tournament_id_scope:null
  };
  const clone=x=>JSON.parse(JSON.stringify(x));
  const readMeta=()=>{
    try{
      const x=JSON.parse(localStorage.getItem(META_KEY)||"null")||{};
      x.accounts=Array.isArray(x.accounts)?x.accounts:[];
      x.refereeScopes=x.refereeScopes||{};
      x.tournamentOwners=x.tournamentOwners||{};
      x.playerOwners=x.playerOwners||{};
      if(!x.accounts.some(a=>a.id===DEFAULT_OWNER.id||String(a.email||"").toLowerCase()===DEFAULT_OWNER.email)){
        x.accounts.push({...DEFAULT_OWNER});
        localStorage.setItem(META_KEY,JSON.stringify(x));
      }
      return x;
    }catch{
      const x={accounts:[{...DEFAULT_OWNER}],refereeScopes:{},tournamentOwners:{},playerOwners:{}};
      localStorage.setItem(META_KEY,JSON.stringify(x));return x;
    }
  };
  let meta=readMeta();
  const saveMeta=()=>localStorage.setItem(META_KEY,JSON.stringify(meta));
  const readSession=()=>{
    try{return JSON.parse(localStorage.getItem(AUTH_KEY)||"null")}catch{return null}
  };
  const user=()=>readSession()?.user||null;
  const authError=()=>Object.assign(new Error("AUTH_REQUIRED"),{status:401});
  const forbidden=msg=>Object.assign(new Error(msg||"FORBIDDEN"),{status:403});
  const bad=msg=>Object.assign(new Error(msg||"BAD_REQUEST"),{status:400});
  const needUser=()=>{const u=user();if(!u)throw authError();return u};
  const setSession=u=>{
    const session={user:u,createdAt:new Date().toISOString()};
    localStorage.setItem(AUTH_KEY,JSON.stringify(session));
    return clone(session);
  };
  const normalEmail=v=>String(v||"").trim().toLowerCase();
  const currentAccount=()=>meta.accounts.find(a=>a.id===user()?.id)||null;

  const raw={
    login:API.login.bind(API),logout:API.logout.bind(API),session:API.session.bind(API),me:API.me.bind(API),
    changePassword:API.changePassword?.bind(API),
    publicState:API.publicState.bind(API),publicPlayers:API.publicPlayers.bind(API),
    publicSponsors:API.publicSponsors?.bind(API),publicPosts:API.publicPosts?.bind(API),
    adminState:API.adminState.bind(API),players:API.players.bind(API),
    createPlayer:API.createPlayer.bind(API),updatePlayer:API.updatePlayer.bind(API),
    deactivatePlayer:API.deactivatePlayer.bind(API),uploadPlayerAvatar:API.uploadPlayerAvatar.bind(API),
    adjustRating:API.adjustRating.bind(API),
    createTournament:API.createTournament.bind(API),updateTournament:API.updateTournament.bind(API),deleteTournament:API.deleteTournament.bind(API),
    createDivision:API.createDivision.bind(API),updateDivision:API.updateDivision.bind(API),updateDivisionFull:API.updateDivisionFull.bind(API),deleteDivision:API.deleteDivision.bind(API),
    createCourt:API.createCourt.bind(API),updateCourt:API.updateCourt.bind(API),deleteCourt:API.deleteCourt.bind(API),
    createTeam:API.createTeam.bind(API),updateTeam:API.updateTeam.bind(API),deleteTeam:API.deleteTeam.bind(API),addTeamPlayer:API.addTeamPlayer.bind(API),
    createMatch:API.createMatch.bind(API),updateMatch:API.updateMatch.bind(API),deleteMatch:API.deleteMatch.bind(API),assignMatch:API.assignMatch.bind(API),
    autoSeedGroups:API.autoSeedGroups.bind(API),generateRoundRobin:API.generateRoundRobin.bind(API),autoScheduleCourts:API.autoScheduleCourts?.bind(API),generateBracket:API.generateBracket.bind(API),
    point:API.point.bind(API),finishSet:API.finishSet.bind(API),finishMatch:API.finishMatch.bind(API),quickScore:API.quickScore.bind(API),specialResult:API.specialResult.bind(API),undo:API.undo.bind(API),
    referees:API.referees.bind(API),createReferee:API.createReferee.bind(API),updateReferee:API.updateReferee.bind(API),
    registrations:API.registrations.bind(API),createRegistration:API.createRegistration.bind(API),updateRegistration:API.updateRegistration?.bind(API),deleteRegistration:API.deleteRegistration?.bind(API),
    addPayment:API.addPayment?.bind(API),reviewPayment:API.reviewPayment?.bind(API)
  };

  const tournamentIdsFor=(u,s)=>{
    if(!u)return [];
    if(u.role==="super_admin")return s.tournaments.map(t=>t.id);
    if(u.role!=="organizer")return [];
    const assigned=u.tournamentScope||u.tournament_id_scope||meta.accounts.find(a=>a.id===u.id)?.tournament_id_scope||null;
    return s.tournaments.filter(t=>meta.tournamentOwners[t.id]===u.id||(assigned&&t.id===assigned)).map(t=>t.id);
  };
  const tournamentForDivision=(s,id)=>s.divisions.find(d=>d.id===id)?.tournamentId||null;
  const tournamentForCourt=(s,id)=>s.courts.find(c=>c.id===id)?.tournamentId||null;
  const tournamentForTeam=(s,id)=>tournamentForDivision(s,s.teams.find(t=>t.id===id)?.divisionId);
  const tournamentForMatch=(s,id)=>tournamentForDivision(s,s.matches.find(m=>m.id===id)?.divisionId);
  const playerIdsForTeams=(s,teamIds)=>{
    const out=new Set();
    for(const tid of teamIds)(s.teamPlayers?.[tid]||[]).forEach(id=>out.add(id));
    return out;
  };
  const filterState=(s,u)=>{
    if(u?.role==="super_admin")return clone(s);
    if(u?.role==="organizer"){
      const tids=new Set(tournamentIdsFor(u,s));
      const divisions=s.divisions.filter(d=>tids.has(d.tournamentId)),dids=new Set(divisions.map(d=>d.id));
      const teams=s.teams.filter(t=>dids.has(t.divisionId)),teamIds=new Set(teams.map(t=>t.id));
      const pids=playerIdsForTeams(s,teamIds);
      s.players.filter(p=>meta.playerOwners[p.id]===u.id).forEach(p=>pids.add(p.id));
      const teamPlayers={};
      teams.forEach(t=>teamPlayers[t.id]=clone(s.teamPlayers?.[t.id]||[]));
      return clone({
        ...s,
        tournaments:s.tournaments.filter(t=>tids.has(t.id)),
        divisions,
        courts:s.courts.filter(c=>tids.has(c.tournamentId)),
        teams,
        teamPlayers,
        players:s.players.filter(p=>pids.has(p.id)),
        matches:s.matches.filter(m=>dids.has(m.divisionId)),
        referees:(s.referees||[]).filter(r=>tids.has(meta.refereeScopes[r.id]||r.tournament_id_scope)),
        registrations:(s.registrations||[]).filter(r=>[...tids].some(tid=>s.tournaments.find(t=>t.id===tid)?.name===r.tournament_name)),
        audit:[]
      });
    }
    if(u?.role==="referee"){
      const matches=s.matches.filter(m=>m.refereeId===u.id);
      const dids=new Set(matches.map(m=>m.divisionId));
      const tids=new Set(s.divisions.filter(d=>dids.has(d.id)).map(d=>d.tournamentId));
      const teams=s.teams.filter(t=>matches.some(m=>m.a===t.id||m.b===t.id)),teamIds=new Set(teams.map(t=>t.id));
      const pids=playerIdsForTeams(s,teamIds),teamPlayers={};
      teams.forEach(t=>teamPlayers[t.id]=clone(s.teamPlayers?.[t.id]||[]));
      return clone({
        ...s,
        tournaments:s.tournaments.filter(t=>tids.has(t.id)),
        divisions:s.divisions.filter(d=>dids.has(d.id)),
        courts:s.courts.filter(c=>tids.has(c.tournamentId)),
        teams,teamPlayers,
        players:s.players.filter(p=>pids.has(p.id)),
        matches,referees:[],registrations:[],audit:[]
      });
    }
    return clone(s);
  };
  const ensureTournament=async tid=>{
    const u=needUser();if(u.role==="super_admin")return true;
    if(u.role!=="organizer")throw forbidden();
    const s=await raw.publicState();
    if(!tournamentIdsFor(u,s).includes(tid))throw forbidden("TOURNAMENT_SCOPE_FORBIDDEN");
    return true;
  };
  const ensureDivision=async did=>{const s=await raw.publicState();const tid=tournamentForDivision(s,did);if(!tid)throw bad("NOT_FOUND");await ensureTournament(tid);return tid};
  const ensureCourt=async cid=>{const s=await raw.publicState();const tid=tournamentForCourt(s,cid);if(!tid)throw bad("NOT_FOUND");await ensureTournament(tid);return tid};
  const ensureTeam=async teamId=>{const s=await raw.publicState();const tid=tournamentForTeam(s,teamId);if(!tid)throw bad("NOT_FOUND");await ensureTournament(tid);return tid};
  const ensureMatch=async matchId=>{
    const u=needUser(),s=await raw.publicState(),m=s.matches.find(x=>x.id===matchId);
    if(!m)throw bad("NOT_FOUND");
    if(u.role==="super_admin")return m;
    if(u.role==="organizer"){await ensureTournament(tournamentForMatch(s,matchId));return m}
    if(u.role==="referee"&&m.refereeId===u.id)return m;
    throw forbidden();
  };
  const canEditPlayer=async pid=>{
    const u=needUser();if(u.role==="super_admin")return true;
    const s=await raw.publicState();
    if(u.role==="organizer"){
      if(meta.playerOwners[pid]===u.id)return true;
      const allowed=new Set(tournamentIdsFor(u,s));
      return s.teams.some(t=>allowed.has(tournamentForDivision(s,t.divisionId))&&(s.teamPlayers?.[t.id]||[]).includes(pid));
    }
    if(u.role==="referee"){
      return s.matches.some(m=>m.refereeId===u.id&&[m.a,m.b].some(tid=>(s.teamPlayers?.[tid]||[]).includes(pid)));
    }
    return false;
  };

  const decodeShare=token=>{
    if(!token)return null;
    try{
      let b64=token.replace(/-/g,"+").replace(/_/g,"/");
      while(b64.length%4)b64+="=";
      const bin=atob(b64),bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    }catch{return null}
  };
  const encodeShare=obj=>{
    const bytes=new TextEncoder().encode(JSON.stringify(obj));
    let bin="";for(const b of bytes)bin+=String.fromCharCode(b);
    return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  };
  const shared=decodeShare(new URLSearchParams(location.search).get("share"));
  if(shared?.state){
    API.publicState=async()=>clone(shared.state);
    API.publicPlayers=async()=>clone(shared.state.players||[]);
    if(API.publicSponsors)API.publicSponsors=async()=>[];
    if(API.publicPosts)API.publicPosts=async()=>[];
  }

  API.login=async(email,password)=>{
    meta=readMeta();
    const normalized=normalEmail(email);
    const a=meta.accounts.find(x=>x.active!==false&&normalEmail(x.email)===normalized&&String(x.password||"")===String(password||""));
    if(a){
      return setSession({
        id:a.id,email:a.email,name:a.display_name,display_name:a.display_name,role:a.role,
        tournamentScope:a.tournament_id_scope||null,tournament_id_scope:a.tournament_id_scope||null
      });
    }
    const session=await raw.login(email,password);
    const u=session?.user;
    if(u?.role==="referee"){
      u.tournamentScope=meta.refereeScopes[u.id]||null;
      u.tournament_id_scope=u.tournamentScope;
      return setSession(u);
    }
    return session;
  };
  API.session=async()=>{const s=readSession();if(!s?.user?.id)throw authError();return clone(s)};
  API.me=API.session;
  API.logout=async()=>{localStorage.removeItem(AUTH_KEY);return {ok:true}};
  API.changePassword=async(currentPassword,newPassword)=>{
    const u=needUser();if(String(newPassword||"").length<12)throw bad("PASSWORD_POLICY");
    const a=meta.accounts.find(x=>x.id===u.id);
    if(a){
      if(String(a.password)!==String(currentPassword||""))throw bad("INVALID_CURRENT_PASSWORD");
      a.password=String(newPassword);saveMeta();return {ok:true};
    }
    if(u.role==="referee"){
      const refs=await raw.referees(),r=refs.find(x=>x.id===u.id);
      if(!r||String(r.password)!==String(currentPassword||""))throw bad("INVALID_CURRENT_PASSWORD");
      await raw.updateReferee(u.id,{password:String(newPassword)});return {ok:true};
    }
    throw bad("PREVIEW_DEMO_ACCOUNT");
  };

  API.adminState=async()=>filterState(await raw.adminState(),needUser());
  API.players=async()=>filterState(await raw.publicState(),needUser()).players;
  API.createPlayer=async p=>{
    const u=needUser();if(!["super_admin","organizer"].includes(u.role))throw forbidden();
    const x=await raw.createPlayer(p);meta.playerOwners[x.id]=u.id;saveMeta();return x;
  };
  API.updatePlayer=async(id,p)=>{
    const u=needUser();if(!(await canEditPlayer(id)))throw forbidden("PLAYER_SCOPE_FORBIDDEN");
    if(u.role==="referee")p={fullName:p.fullName,nickname:p.nickname,gender:p.gender};
    return raw.updatePlayer(id,p);
  };
  API.uploadPlayerAvatar=async(id,file)=>{if(!(await canEditPlayer(id)))throw forbidden("PLAYER_SCOPE_FORBIDDEN");return raw.uploadPlayerAvatar(id,file)};
  API.deactivatePlayer=async id=>{const u=needUser();if(u.role==="referee"||!(await canEditPlayer(id)))throw forbidden();return raw.deactivatePlayer(id)};
  API.adjustRating=async(id,p)=>{const u=needUser();if(u.role==="referee"||!(await canEditPlayer(id)))throw forbidden();return raw.adjustRating(id,p)};

  API.createTournament=async p=>{
    const u=needUser();if(!["super_admin","organizer"].includes(u.role))throw forbidden();
    const out=await raw.createTournament(p);meta.tournamentOwners[out.tournament.id]=u.id;saveMeta();return out;
  };
  API.updateTournament=async(id,p)=>{await ensureTournament(id);return raw.updateTournament(id,p)};
  API.deleteTournament=async id=>{await ensureTournament(id);return raw.deleteTournament(id)};
  API.createDivision=async(tid,p)=>{await ensureTournament(tid);return raw.createDivision(tid,p)};
  API.updateDivision=async(id,p)=>{await ensureDivision(id);return raw.updateDivision(id,p)};
  API.updateDivisionFull=async(id,p)=>{await ensureDivision(id);return raw.updateDivisionFull(id,p)};
  API.deleteDivision=async id=>{await ensureDivision(id);return raw.deleteDivision(id)};
  API.createCourt=async(tid,p)=>{await ensureTournament(tid);return raw.createCourt(tid,p)};
  API.updateCourt=async(id,p)=>{await ensureCourt(id);return raw.updateCourt(id,p)};
  API.deleteCourt=async id=>{await ensureCourt(id);return raw.deleteCourt(id)};
  API.createTeam=async(did,p)=>{await ensureDivision(did);return raw.createTeam(did,p)};
  API.updateTeam=async(id,p)=>{await ensureTeam(id);return raw.updateTeam(id,p)};
  API.deleteTeam=async id=>{await ensureTeam(id);return raw.deleteTeam(id)};
  API.addTeamPlayer=async(teamId,playerId)=>{await ensureTeam(teamId);if(!(await canEditPlayer(playerId)))throw forbidden("PLAYER_SCOPE_FORBIDDEN");return raw.addTeamPlayer(teamId,playerId)};
  API.createMatch=async(did,p)=>{
    const tid=await ensureDivision(did);
    if(p.refereeUserId){
      const scope=meta.refereeScopes[p.refereeUserId]||null;
      if(scope&&scope!==tid)throw bad("INVALID_REFEREE_SCOPE");
    }
    return raw.createMatch(did,p);
  };
  API.updateMatch=async(id,p)=>{await ensureMatch(id);return raw.updateMatch(id,p)};
  API.deleteMatch=async id=>{await ensureMatch(id);return raw.deleteMatch(id)};
  API.assignMatch=async(id,p)=>{
    const m=await ensureMatch(id),s=await raw.publicState(),tid=tournamentForDivision(s,m.divisionId);
    if(p.refereeUserId){
      const scope=meta.refereeScopes[p.refereeUserId]||null;
      if(scope&&scope!==tid)throw bad("INVALID_REFEREE_SCOPE");
    }
    return raw.assignMatch(id,p);
  };
  API.autoSeedGroups=async(did,n)=>{await ensureDivision(did);return raw.autoSeedGroups(did,n)};
  API.generateRoundRobin=async did=>{await ensureDivision(did);return raw.generateRoundRobin(did)};
  if(raw.autoScheduleCourts)API.autoScheduleCourts=async did=>{await ensureDivision(did);return raw.autoScheduleCourts(did)};
  API.generateBracket=async did=>{await ensureDivision(did);return raw.generateBracket(did)};
  API.point=async(id,p)=>{await ensureMatch(id);return raw.point(id,p)};
  API.finishSet=async(id,p)=>{await ensureMatch(id);return raw.finishSet(id,p)};
  API.finishMatch=async(id,p)=>{await ensureMatch(id);return raw.finishMatch(id,p)};
  API.quickScore=async(id,p)=>{await ensureMatch(id);return raw.quickScore(id,p)};
  API.specialResult=async(id,p)=>{await ensureMatch(id);return raw.specialResult(id,p)};
  API.undo=async id=>{await ensureMatch(id);return raw.undo(id)};

  const enrichRefs=async()=>{
    const s=await raw.publicState(),refs=await raw.referees();
    return refs.map(r=>({...r,tournament_id_scope:meta.refereeScopes[r.id]||null,tournament_name:s.tournaments.find(t=>t.id===(meta.refereeScopes[r.id]||null))?.name||null}));
  };
  API.referees=async()=>{
    const u=needUser(),refs=await enrichRefs();
    if(u.role==="super_admin")return clone(refs);
    if(u.role==="organizer"){
      const s=await raw.publicState(),allowed=new Set(tournamentIdsFor(u,s));
      return clone(refs.filter(r=>allowed.has(r.tournament_id_scope)));
    }
    return [];
  };
  API.createReferee=async p=>{
    const u=needUser(),s=await raw.publicState();
    let tid=p.tournamentId||null;
    if(u.role==="organizer"){
      if(!tid||!tournamentIdsFor(u,s).includes(tid))throw forbidden("TOURNAMENT_SCOPE_FORBIDDEN");
    }else if(u.role!=="super_admin")throw forbidden();
    const r=await raw.createReferee(p);meta.refereeScopes[r.id]=tid;saveMeta();
    return {...r,tournament_id_scope:tid,tournament_name:s.tournaments.find(t=>t.id===tid)?.name||null};
  };
  API.updateReferee=async(id,p)=>{
    const u=needUser(),s=await raw.publicState(),cur=meta.refereeScopes[id]||null;
    if(u.role==="organizer"){
      const allowed=new Set(tournamentIdsFor(u,s));
      if(!allowed.has(cur)||!(p.tournamentId||cur)||!allowed.has(p.tournamentId||cur))throw forbidden("TOURNAMENT_SCOPE_FORBIDDEN");
    }else if(u.role!=="super_admin")throw forbidden();
    const r=await raw.updateReferee(id,p);
    if(p.tournamentId!==undefined)meta.refereeScopes[id]=p.tournamentId||null;
    saveMeta();return {...r,tournament_id_scope:meta.refereeScopes[id]||null,tournament_name:s.tournaments.find(t=>t.id===(meta.refereeScopes[id]||null))?.name||null};
  };

  API.users=async()=>{
    const u=needUser(),refs=await enrichRefs();
    if(u.role==="super_admin"){
      return clone([SUPER,...meta.accounts.map(a=>({...a,club_id:null,club_name:null,tournament_name:(a.tournament_id_scope?(await raw.publicState()).tournaments.find(t=>t.id===a.tournament_id_scope)?.name:null)})),...refs]);
    }
    if(u.role==="organizer"){
      const s=await raw.publicState(),allowed=new Set(tournamentIdsFor(u,s));
      const self=meta.accounts.find(a=>a.id===u.id)||{id:u.id,email:u.email,display_name:u.name,role:"organizer",active:true,tournament_id_scope:u.tournamentScope||null};
      return clone([self,...refs.filter(r=>allowed.has(r.tournament_id_scope))]);
    }
    return [];
  };
  API.createUser=async p=>{
    const u=needUser(),role=String(p.role||"");
    if(u.role==="organizer"){
      if(role!=="referee")throw forbidden("ORGANIZER_CAN_ONLY_CREATE_REFEREE");
      return API.createReferee(p);
    }
    if(u.role!=="super_admin")throw forbidden();
    if(role==="referee")return API.createReferee(p);
    if(role!=="organizer")throw bad("INVALID_CHILD_ROLE");
    if(!p.password||String(p.password).length<12)throw bad("PASSWORD_POLICY");
    const email=normalEmail(p.email);
    if(meta.accounts.some(a=>normalEmail(a.email)===email)||(await raw.referees()).some(r=>normalEmail(r.email)===email))throw Object.assign(new Error("EMAIL_EXISTS"),{status:409});
    const a={id:"owner-"+Date.now()+"-"+Math.random().toString(16).slice(2),email,display_name:String(p.name||"").trim(),role:"organizer",active:true,password:String(p.password),tournament_id_scope:p.tournamentId||null};
    meta.accounts.push(a);saveMeta();return clone(a);
  };
  API.updateUser=async(id,p)=>{
    const u=needUser();
    const ref=(await raw.referees()).find(r=>r.id===id);
    if(ref)return API.updateReferee(id,p);
    if(u.role!=="super_admin")throw forbidden("ORGANIZER_CAN_ONLY_EDIT_REFEREE");
    const a=meta.accounts.find(x=>x.id===id);if(!a)throw bad("NOT_FOUND");
    if(p.email)a.email=normalEmail(p.email);
    if(p.name!==undefined)a.display_name=String(p.name||"").trim();
    if(p.active!==undefined)a.active=Boolean(p.active);
    if(p.password)a.password=String(p.password);
    if(p.tournamentId!==undefined)a.tournament_id_scope=p.tournamentId||null;
    saveMeta();return clone(a);
  };

  API.registrations=async()=>filterState({...await raw.publicState(),registrations:await raw.registrations()},needUser()).registrations||[];
  if(raw.createRegistration)API.createRegistration=async(did,p)=>{await ensureDivision(did);return raw.createRegistration(did,p)};
  if(raw.updateRegistration)API.updateRegistration=async(id,p)=>{
    const regs=await API.registrations();if(!regs.some(r=>r.id===id)&&user()?.role!=="super_admin")throw forbidden();
    return raw.updateRegistration(id,p);
  };
  if(raw.deleteRegistration)API.deleteRegistration=async id=>{
    const regs=await API.registrations();if(!regs.some(r=>r.id===id)&&user()?.role!=="super_admin")throw forbidden();
    return raw.deleteRegistration(id);
  };

  API.shareTournamentRoster=async tid=>{
    const u=needUser();if(u.role!=="super_admin")await ensureTournament(tid);
    const s=await raw.publicState(),t=s.tournaments.find(x=>x.id===tid);if(!t)throw bad("NOT_FOUND");
    const divs=s.divisions.filter(d=>d.tournamentId===tid),dids=new Set(divs.map(d=>d.id));
    const teams=s.teams.filter(x=>dids.has(x.divisionId)),teamIds=new Set(teams.map(x=>x.id));
    const pids=playerIdsForTeams(s,teamIds),teamPlayers={};
    teams.forEach(team=>teamPlayers[team.id]=clone(s.teamPlayers?.[team.id]||[]));
    const safePlayers=s.players.filter(p=>pids.has(p.id)).map(p=>({
      id:p.id,full_name:p.full_name,nickname:p.nickname||"",gender:p.gender||null,rating:p.rating,
      avatar_url:String(p.avatar_url||"").startsWith("data:")?"":(p.avatar_url||""),
      club_name:p.club_name||"Tự do",active:p.active!==false
    }));
    const snap={
      v:1,createdAt:new Date().toISOString(),
      state:{
        tournaments:[{...t,publicVisible:true}],divisions:clone(divs),
        courts:clone(s.courts.filter(c=>c.tournamentId===tid)),
        teams:clone(teams),teamPlayers,players:safePlayers,
        matches:clone(s.matches.filter(m=>dids.has(m.divisionId))),audit:[]
      }
    };
    return encodeShare(snap);
  };

  window.PicklePagesAuth={version:2,meta:()=>clone(meta)};
})();