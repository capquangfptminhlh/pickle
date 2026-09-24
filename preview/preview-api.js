(()=>{
  const KEY="pickle-preview-state-v5";
  const uid=()=>crypto.randomUUID?.()||("id-"+Date.now()+"-"+Math.random().toString(16).slice(2));
  const clone=x=>JSON.parse(JSON.stringify(x));
  const svgAvatar=(name,bg="#0d2118",fg="#dfff69")=>{
    const ini=(name||"P").split(/\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase();
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="72" fill="'+bg+'"/><circle cx="196" cy="60" r="46" fill="#ffffff12"/><text x="128" y="148" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="82" fill="'+fg+'">'+ini+'</text></svg>';
    return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
  };
  const fileData=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
  const seed=()=>({
    tournaments:[{id:"t1",name:"Saigon Pickle Open 2026",date:"27/09/2026",venue:"Pickle Hub Bình Thạnh",format:"Doubles 3.0–3.5",status:"live",teams:6}],
    divisions:[{id:"d1",tournamentId:"t1",name:"Doubles 3.0–3.5",eventType:"doubles",format:"pool_to_knockout",bestOf:3,pointsToWin:11,winByTwo:true,advanceCount:2}],
    courts:[
      {id:"c1",tournamentId:"t1",name:"Sân 1",sortOrder:1,active:true},
      {id:"c2",tournamentId:"t1",name:"Sân 2",sortOrder:2,active:true},
      {id:"c3",tournamentId:"t1",name:"Sân 3",sortOrder:3,active:true},
      {id:"c4",tournamentId:"t1",name:"Sân 4",sortOrder:4,active:true}
    ],
    clubs:[
      {id:"cl1",name:"Bình Lợi",city:"TP.HCM"},{id:"cl2",name:"Gò Vấp",city:"TP.HCM"},
      {id:"cl3",name:"Phú Nhuận",city:"TP.HCM"},{id:"cl4",name:"Thủ Đức",city:"TP.HCM"},
      {id:"cl5",name:"Tân Bình",city:"TP.HCM"}
    ],
    players:[
      {id:"p1",full_name:"Minh Búa",nickname:"",gender:"male",rating:3.420,club_id:"cl1",club_name:"Bình Lợi",active:true,avatar_url:svgAvatar("Minh Búa","#102a1d")},
      {id:"p2",full_name:"Quốc Anh",nickname:"",gender:"male",rating:3.365,club_id:"cl1",club_name:"Bình Lợi",active:true,avatar_url:svgAvatar("Quốc Anh","#183d2d")},
      {id:"p3",full_name:"Hoàng Nam",nickname:"",gender:"male",rating:3.310,club_id:"cl2",club_name:"Gò Vấp",active:true,avatar_url:svgAvatar("Hoàng Nam","#17314c","#9fd6ff")},
      {id:"p4",full_name:"Tuấn Kiệt",nickname:"",gender:"male",rating:3.295,club_id:"cl2",club_name:"Gò Vấp",active:true,avatar_url:svgAvatar("Tuấn Kiệt","#442b25","#ffc9a9")},
      {id:"p5",full_name:"Gia Huy",nickname:"",gender:"male",rating:3.260,club_id:"cl3",club_name:"Phú Nhuận",active:true,avatar_url:svgAvatar("Gia Huy","#34214a","#e0c5ff")},
      {id:"p6",full_name:"Đức Long",nickname:"",gender:"male",rating:3.245,club_id:"cl3",club_name:"Phú Nhuận",active:true,avatar_url:svgAvatar("Đức Long","#3b3619","#fff19a")}
    ],
    teams:[
      {id:"A1",divisionId:"d1",name:"Minh Búa / Quốc Anh",club:"Bình Lợi",group:"A",seed:1,w:1,l:0,pf:22,pa:16},
      {id:"A2",divisionId:"d1",name:"Hoàng Nam / Tuấn Kiệt",club:"Gò Vấp",group:"A",seed:2,w:1,l:1,pf:48,pa:47},
      {id:"A3",divisionId:"d1",name:"Gia Huy / Đức Long",club:"Phú Nhuận",group:"A",seed:3,w:0,l:1,pf:25,pa:33},
      {id:"B1",divisionId:"d1",name:"Bảo Minh / Trọng Nhân",club:"Thủ Đức",group:"B",seed:1,w:0,l:0,pf:0,pa:0},
      {id:"B2",divisionId:"d1",name:"Thanh Tùng / Hải Đăng",club:"Bình Lợi",group:"B",seed:2,w:0,l:0,pf:0,pa:0},
      {id:"B3",divisionId:"d1",name:"Quang Huy / Anh Khoa",club:"Tân Bình",group:"B",seed:3,w:0,l:0,pf:0,pa:0}
    ],
    teamPlayers:{A1:["p1","p2"],A2:["p3","p4"],A3:["p5","p6"],B1:[],B2:[],B3:[]},
    matches:[
      {id:"m1",divisionId:"d1",stage:"Bảng A",court:1,courtId:"c1",time:"18:00",a:"A1",b:"A2",status:"done",sets:[[11,7],[11,9]],current:[0,0],winner:"A1",version:3},
      {id:"m2",divisionId:"d1",stage:"Bảng A",court:2,courtId:"c2",time:"18:00",a:"A2",b:"A3",status:"done",sets:[[11,6],[10,12],[11,7]],current:[0,0],winner:"A2",version:4},
      {id:"m3",divisionId:"d1",stage:"Bảng A",court:1,courtId:"c1",time:"18:45",a:"A1",b:"A3",status:"live",sets:[[11,8]],current:[7,5],winner:null,version:9},
      {id:"m4",divisionId:"d1",stage:"Bảng B",court:2,courtId:"c2",time:"18:45",a:"B1",b:"B2",status:"live",sets:[],current:[9,6],winner:null,version:16},
      {id:"m5",divisionId:"d1",stage:"Bảng B",court:3,courtId:"c3",time:"19:20",a:"B2",b:"B3",status:"wait",sets:[],current:[0,0],winner:null,version:1},
      {id:"m6",divisionId:"d1",stage:"Bảng B",court:4,courtId:"c4",time:"19:20",a:"B1",b:"B3",status:"wait",sets:[],current:[0,0],winner:null,version:1},
      {id:"m7",divisionId:"d1",stage:"Bán kết 1",court:1,courtId:"c1",time:"20:15",a:"A1",b:"B2",status:"wait",sets:[],current:[0,0],winner:null,version:1},
      {id:"m8",divisionId:"d1",stage:"Bán kết 2",court:2,courtId:"c2",time:"20:15",a:"B1",b:"A2",status:"wait",sets:[],current:[0,0],winner:null,version:1},
      {id:"m9",divisionId:"d1",stage:"Chung kết",court:1,courtId:"c1",time:"21:00",a:"TBD",b:"TBD",status:"wait",sets:[],current:[0,0],winner:null,version:1}
    ],
    referees:[{id:"r1",email:"ref@preview.local",display_name:"Trọng tài Lan",active:true}],
    registrations:[
      {id:"reg1",status:"approved",payment_status:"paid",amount:500000,team_name:"Minh Búa / Quốc Anh",division_name:"Doubles 3.0–3.5",tournament_name:"Saigon Pickle Open 2026",checked_in_at:new Date().toISOString(),payment_id:"pay1",payment_review_status:"approved"},
      {id:"reg2",status:"approved",payment_status:"pending",amount:500000,team_name:"Hoàng Nam / Tuấn Kiệt",division_name:"Doubles 3.0–3.5",tournament_name:"Saigon Pickle Open 2026",checked_in_at:null,payment_id:"pay2",payment_review_status:"pending"}
    ],
    sponsors:[
      {id:"sp1",name:"KITAWA",tier:"Gold",logo_url:null,website_url:"",sort_order:1},
      {id:"sp2",name:"Court Partner",tier:"Partner",logo_url:null,website_url:"",sort_order:2}
    ],
    posts:[
      {id:"post1",title:"Lịch thi đấu vòng bảng đã sẵn sàng",slug:"lich-thi-dau-vong-bang",excerpt:"Theo dõi lịch sân, live score và bảng xếp hạng ngay trên Pickle Tour.",body:"",cover_url:null,status:"published",published_at:new Date().toISOString()},
      {id:"post2",title:"Check-in nhanh bằng QR tại sân",slug:"check-in-qr",excerpt:"BTC có thể kiểm soát đội có mặt và trạng thái thanh toán tại quầy.",body:"",cover_url:null,status:"published",published_at:new Date(Date.now()-86400000).toISOString()}
    ],
    branding:{name:"Pickle Tour",primaryColor:"#0a8b55",accentColor:"#dfff69",logoUrl:""},
    bookings:[
      {id:"bk1",court_id:"c1",court_name:"Sân 1",tournament_name:"Saigon Pickle Open 2026",title:"Warm-up bảng A",contact_name:"BTC",contact_phone:"",start_at:new Date(Date.now()+3600000).toISOString(),end_at:new Date(Date.now()+5400000).toISOString(),status:"confirmed"}
    ],
    ratingHistory:{p1:[{before_rating:3.39,delta:.03,after_rating:3.42,reason:"Kết quả giải gần nhất",created_at:new Date().toISOString()}]},
    audit:[
      {time:"20:04",user:"BTC Nguyễn Hoàng",action:"Cập nhật lịch thi đấu",detail:"M7 → Sân 1 lúc 20:15"},
      {time:"19:52",user:"Trọng tài Lan",action:"Chốt kết quả",detail:"M2: A2 thắng A3 2–1"}
    ]
  });
  let state=JSON.parse(localStorage.getItem(KEY)||"null")||seed();
  const persist=()=>{localStorage.setItem(KEY,JSON.stringify(state));window.dispatchEvent(new CustomEvent("pickle-preview-update",{detail:clone(state)}));};
  const api={
    me:async()=>({user:{id:"preview-admin",email:"preview@local",name:"Preview Admin",role:"super_admin"}}),
    logout:async()=>({ok:true}),changePassword:async()=>({ok:true}),
    publicState:async()=>clone(state),
    adminState:async()=>clone(state),
    publicPlayers:async()=>clone(state.players),
    publicClubs:async()=>clone(state.clubs),
    publicPosts:async()=>clone(state.posts.filter(x=>x.status==="published")),
    publicSponsors:async()=>clone(state.sponsors),
    publicBranding:async()=>clone(state.branding),
    publicCheckin:async token=>{const r=state.registrations.find(x=>x.id===token)||state.registrations[0];return clone({...r,team_name:r.team_name,start_at:new Date().toISOString()})},
    confirmCheckin:async token=>{const r=state.registrations.find(x=>x.id===token)||state.registrations[0];r.checked_in_at=new Date().toISOString();persist();return clone(r)},
    publicPlayer:async id=>{
      const p=state.players.find(x=>x.id===id);if(!p)throw Object.assign(new Error("NOT_FOUND"),{status:404});
      const myTeams=Object.entries(state.teamPlayers).filter(([,ids])=>ids.includes(id)).map(([tid])=>tid);
      const matches=state.matches.filter(m=>myTeams.includes(m.a)||myTeams.includes(m.b)).map(m=>{
        const myTeam=myTeams.includes(m.a)?m.a:m.b,side=myTeam===m.a?"A":"B";
        let myPoints=0,oppPoints=0;(m.sets||[]).forEach(s=>{if(side==="A"){myPoints+=s[0];oppPoints+=s[1]}else{myPoints+=s[1];oppPoints+=s[0]}});
        return {id:m.id,tournamentId:"t1",tournamentName:"Saigon Pickle Open 2026",divisionName:"Doubles 3.0–3.5",stage:m.stage,status:m.status,teamAName:state.teams.find(t=>t.id===m.a)?.name||"TBD",teamBName:state.teams.find(t=>t.id===m.b)?.name||"TBD",mySide:side,winnerTeamId:m.winner,won:m.status==="done"&&m.winner===myTeam,lost:m.status==="done"&&m.winner&&m.winner!==myTeam,sets:m.sets||[],myPoints,oppPoints};
      });
      const wins=matches.filter(x=>x.won).length,losses=matches.filter(x=>x.lost).length,pf=matches.reduce((a,x)=>a+x.myPoints,0),pa=matches.reduce((a,x)=>a+x.oppPoints,0);
      const partnerIds=[...new Set(myTeams.flatMap(tid=>state.teamPlayers[tid]||[]).filter(pid=>pid!==id))];
      return {profile:{id:p.id,fullName:p.full_name,nickname:p.nickname,gender:p.gender,rating:p.rating,avatarUrl:p.avatar_url,clubName:p.club_name,clubCity:"TP.HCM"},stats:{wins,losses,matches:wins+losses,winRate:wins+losses?Math.round(wins*1000/(wins+losses))/10:0,pointsFor:pf,pointsAgainst:pa,diff:pf-pa},teams:myTeams.map(tid=>({id:tid,tournament_id:"t1",tournament_name:"Saigon Pickle Open 2026",division_name:"Doubles 3.0–3.5",start_at:new Date().toISOString()})),partners:partnerIds.map(pid=>{const x=state.players.find(p=>p.id===pid);return {id:x.id,full_name:x.full_name,avatar_url:x.avatar_url,rating:x.rating,club_name:x.club_name}}),matches,ratingHistory:clone(state.ratingHistory[id]||[])};
    },
    players:async()=>clone(state.players),clubs:async()=>clone(state.clubs),
    uploadImage:async file=>({url:await fileData(file)}),
    uploadPlayerAvatar:async(id,file)=>{const x=state.players.find(v=>v.id===id);x.avatar_url=await fileData(file);persist();return {avatarUrl:x.avatar_url}},
    createClub:async p=>{const x={id:uid(),name:p.name,city:p.city||"",active:true};state.clubs.push(x);persist();return clone(x)},
    updateClub:async(id,p)=>{const x=state.clubs.find(v=>v.id===id);Object.assign(x,p);state.players.filter(v=>v.club_id===id).forEach(v=>v.club_name=x.name);persist();return clone(x)},
    deleteClub:async id=>{const x=state.clubs.find(v=>v.id===id);const used=state.players.some(v=>v.club_id===id)||state.teams.some(t=>t.clubId===id);if(used){x.active=false;persist();return {mode:"archived",entity:clone(x)}}state.clubs=state.clubs.filter(v=>v.id!==id);persist();return {mode:"deleted"}},
    createPlayer:async p=>{const club=state.clubs.find(c=>c.id===p.clubId);const x={id:uid(),full_name:p.fullName,nickname:p.nickname||"",gender:p.gender||null,rating:Number(p.rating||3),phone:p.phone||"",club_id:p.clubId||null,club_name:club?.name||"Tự do",active:true,avatar_url:svgAvatar(p.fullName||"P")};state.players.push(x);persist();return clone(x)},
    updatePlayer:async(id,p)=>{const x=state.players.find(v=>v.id===id);const club=state.clubs.find(c=>c.id===p.clubId);Object.assign(x,{full_name:p.fullName??x.full_name,nickname:p.nickname??x.nickname,gender:p.gender??x.gender,phone:p.phone??x.phone,club_id:p.clubId===undefined?x.club_id:(p.clubId||null),club_name:p.clubId===undefined?x.club_name:(club?.name||"Tự do"),active:p.active??x.active});persist();return clone(x)},
    deactivatePlayer:async id=>{const x=state.players.find(v=>v.id===id);x.active=false;persist();return {mode:"deactivated",entity:clone(x)}},
    adjustRating:async(id,p)=>{const x=state.players.find(v=>v.id===id),before=Number(x.rating||0);x.rating=Math.max(0,before+Number(p.delta||0));(state.ratingHistory[id]||(state.ratingHistory[id]=[])).unshift({before_rating:before,delta:Number(p.delta||0),after_rating:x.rating,reason:p.reason||"",created_at:new Date().toISOString()});persist();return clone(x)},
    createTournament:async p=>{const t={id:uid(),name:p.name,date:p.startAt?new Date(p.startAt).toLocaleDateString("vi-VN"):"Chưa chốt",startAt:p.startAt||null,endAt:null,venue:p.venue||"Chưa chốt",format:"Tournament",status:"open",publicVisible:true,teams:0};state.tournaments.push(t);const d={id:uid(),tournamentId:t.id,name:"Open",eventType:p.eventType||"doubles",format:"pool_to_knockout",bestOf:3,pointsToWin:11,winByTwo:true,advanceCount:2,active:true};state.divisions.push(d);persist();return {tournament:t,division:d}},
    updateTournament:async(id,p)=>{const x=state.tournaments.find(v=>v.id===id);Object.assign(x,{name:p.name??x.name,venue:p.venue??x.venue,startAt:p.startAt??x.startAt,endAt:p.endAt??x.endAt,status:p.status==="registration"?"open":(p.status??x.status),publicVisible:p.publicVisible??x.publicVisible});if(p.startAt)x.date=new Date(p.startAt).toLocaleDateString("vi-VN");persist();return clone(x)},
    deleteTournament:async id=>{const x=state.tournaments.find(v=>v.id===id);const dids=state.divisions.filter(d=>d.tournamentId===id).map(d=>d.id);const hasHistory=state.matches.some(m=>dids.includes(m.divisionId))||state.registrations.some(r=>dids.some(did=>state.divisions.find(d=>d.id===did)?.name===r.division_name));if(hasHistory){x.status="cancelled";x.publicVisible=false;persist();return {mode:"archived",entity:clone(x)}}state.tournaments=state.tournaments.filter(v=>v.id!==id);state.divisions=state.divisions.filter(d=>d.tournamentId!==id);persist();return {mode:"deleted"}},
    createDivision:async(tid,p)=>{const d={id:uid(),tournamentId:tid,name:p.name,eventType:p.eventType,format:p.format,bestOf:p.bestOf,pointsToWin:p.pointsToWin,winByTwo:p.winByTwo,advanceCount:p.advanceCount,active:true};state.divisions.push(d);persist();return clone(d)},
    updateDivisionFull:async(id,p)=>{const d=state.divisions.find(x=>x.id===id);Object.assign(d,p);persist();return clone(d)},
    deleteDivision:async id=>{const d=state.divisions.find(x=>x.id===id);const used=state.matches.some(m=>m.divisionId===id)||state.teams.some(t=>t.divisionId===id);if(used){d.active=false;persist();return {mode:"archived",entity:clone(d)}}state.divisions=state.divisions.filter(x=>x.id!==id);persist();return {mode:"deleted"}},
    createCourt:async(tid,p)=>{const x={id:uid(),tournamentId:tid,name:p.name,sortOrder:state.courts.filter(c=>c.tournamentId===tid).length+1,active:true};state.courts.push(x);persist();return clone(x)},
    updateCourt:async(id,p)=>{Object.assign(state.courts.find(x=>x.id===id),p);persist();return {}},
    deleteCourt:async id=>{const x=state.courts.find(c=>c.id===id);const used=state.matches.some(m=>m.courtId===id)||state.bookings.some(b=>b.court_id===id);if(used){x.active=false;persist();return {mode:"archived",entity:clone(x)}}state.courts=state.courts.filter(c=>c.id!==id);persist();return {mode:"deleted"}},
    createTeam:async(did,p)=>{const id=(p.group||"X")+Math.ceil(Math.random()*90);const t={id,divisionId:did,name:p.name,club:p.club||"Tự do",clubId:null,group:p.group||"A",seed:p.seed||null,status:"active",w:0,l:0,pf:0,pa:0};state.teams.push(t);state.teamPlayers[id]=[];persist();return clone(t)},
    updateTeam:async(id,p)=>{const t=state.teams.find(x=>x.id===id);const club=state.clubs.find(c=>c.id===p.clubId);Object.assign(t,{name:p.name??t.name,clubId:p.clubId===undefined?t.clubId:(p.clubId||null),club:p.clubId===undefined?t.club:(club?.name||"Tự do"),group:p.group??t.group,seed:p.seed??t.seed,status:p.status??t.status});persist();return clone(t)},
    deleteTeam:async id=>{const t=state.teams.find(x=>x.id===id);const used=state.matches.some(m=>m.a===id||m.b===id)||state.registrations.some(r=>r.team_name===t?.name);if(used){t.status="withdrawn";persist();return {mode:"withdrawn",entity:clone(t)}}state.teams=state.teams.filter(x=>x.id!==id);delete state.teamPlayers[id];persist();return {mode:"deleted"}},
    updateDivision:async(id,p)=>{Object.assign(state.divisions.find(x=>x.id===id),p);persist();return {}},
    createMatch:async(did,p)=>{const court=state.courts.find(c=>c.id===p.courtId);const m={id:uid(),divisionId:did,stage:p.stage||"Vòng bảng",court:court?.sortOrder||court?.name||"—",courtId:p.courtId||null,time:p.scheduledAt?new Date(p.scheduledAt).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}):"—",a:p.teamAId,b:p.teamBId,status:"wait",sets:[],current:[0,0],winner:null,version:1,refereeId:p.refereeUserId||null};state.matches.push(m);persist();return clone(m)},
    generateRoundRobin:async()=>({created:0}),generateBracket:async()=>({ok:true}),
    assignMatch:async(id,p)=>{const m=state.matches.find(x=>x.id===id);if(p.courtId){const ct=state.courts.find(x=>x.id===p.courtId);m.courtId=p.courtId;m.court=ct?.sortOrder||ct?.name||m.court}if(p.refereeUserId!==undefined)m.refereeId=p.refereeUserId;if(p.scheduledAt)m.time=new Date(p.scheduledAt).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"});m.version++;persist();return clone(m)},
    updateMatch:async(id,p)=>{const m=state.matches.find(x=>x.id===id);Object.assign(m,p);if(p.scheduledAt)m.time=new Date(p.scheduledAt).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"});m.version++;persist();return clone(m)},
    deleteMatch:async id=>{const m=state.matches.find(x=>x.id===id);if(m.status==="done")throw Object.assign(new Error("COMPLETED_MATCH_LOCKED"),{status:409});if(m.status==="wait"&&!m.sets.length&&!(m.current?.[0]||m.current?.[1])){state.matches=state.matches.filter(x=>x.id!==id);persist();return {mode:"deleted"}}m.status="cancelled";persist();return {mode:"cancelled",entity:clone(m)}},
    point:async(id,p)=>{const m=state.matches.find(x=>x.id===id),i=p.side==="A"?0:1;m.current[i]=Math.max(0,m.current[i]+Number(p.delta));m.status="live";m.version++;persist();return clone(m)},
    finishSet:async id=>{const m=state.matches.find(x=>x.id===id);m.sets.push([...m.current]);m.current=[0,0];m.version++;persist();return clone(m)},
    finishMatch:async id=>{const m=state.matches.find(x=>x.id===id);const aw=m.sets.filter(s=>s[0]>s[1]).length,bw=m.sets.filter(s=>s[1]>s[0]).length;m.winner=aw>=bw?m.a:m.b;m.status="done";m.version++;if(m.id==="m7")state.matches.find(x=>x.id==="m9").a=m.winner;if(m.id==="m8")state.matches.find(x=>x.id==="m9").b=m.winner;persist();return clone(m)},
    specialResult:async(id,p)=>{const m=state.matches.find(x=>x.id===id);m.winner=p.winnerTeamId;m.status="done";m.resultReason=p.reason;m.resultNote=p.note||"";m.version++;if(m.id==="m7")state.matches.find(x=>x.id==="m9").a=m.winner;if(m.id==="m8")state.matches.find(x=>x.id==="m9").b=m.winner;persist();return clone(m)},
    undo:async id=>{const m=state.matches.find(x=>x.id===id);if(m.current[0]||m.current[1]){if(m.current[0]>=m.current[1]&&m.current[0]>0)m.current[0]--;else if(m.current[1]>0)m.current[1]--}m.version++;persist();return clone(m)},
    referees:async()=>clone(state.referees),createReferee:async p=>{const r={id:uid(),email:p.email,display_name:p.name,active:true};state.referees.push(r);persist();return clone(r)},
    registrations:async()=>clone(state.registrations),
    createRegistration:async(did,p)=>{const d=state.divisions.find(x=>x.id===did),t=state.tournaments.find(x=>x.id===d?.tournamentId),team=state.teams.find(x=>x.id===p.teamId);const r={id:uid(),status:"approved",payment_status:"unpaid",amount:p.amount||null,team_name:team?.name||"",division_name:d?.name||"",tournament_name:t?.name||"",checked_in_at:null,payment_id:null,payment_review_status:null};state.registrations.push(r);persist();return clone(r)},
    updateRegistration:async(id,p)=>{const r=state.registrations.find(x=>x.id===id);Object.assign(r,{status:p.status??r.status,payment_status:p.paymentStatus??r.payment_status,amount:p.amount??r.amount});persist();return clone(r)},
    deleteRegistration:async id=>{const r=state.registrations.find(x=>x.id===id);if(r.checked_in_at||r.payment_id){r.status="cancelled";persist();return {mode:"cancelled",entity:clone(r)}}state.registrations=state.registrations.filter(x=>x.id!==id);persist();return {mode:"deleted"}},
    checkin:async id=>{const r=state.registrations.find(x=>x.id===id);r.checked_in_at=new Date().toISOString();persist();return clone(r)},
    undoCheckin:async id=>{const r=state.registrations.find(x=>x.id===id);r.checked_in_at=null;persist();return clone(r)},
    checkinQr:async id=>{const data='<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420"><rect width="420" height="420" fill="white"/><rect x="45" y="45" width="330" height="330" rx="22" fill="#0d2118"/><text x="210" y="200" fill="#dfff69" font-size="58" font-family="Arial" font-weight="900" text-anchor="middle">QR</text><text x="210" y="250" fill="white" font-size="18" font-family="Arial" text-anchor="middle">'+id+'</text></svg>';return {token:id,url:location.href.split("/preview/")[0]+"/preview/checkin.html?token="+id,dataUrl:"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(data)}},
    addPayment:async(id,p)=>{const r=state.registrations.find(x=>x.id===id);r.payment_id=uid();r.payment_review_status="pending";r.payment_status="pending";persist();return clone(r)},
    reviewPayment:async(pid,status)=>{const r=state.registrations.find(x=>x.payment_id===pid);if(r){r.payment_review_status=status;r.payment_status=status==="approved"?"paid":"unpaid";persist()}return clone(r)},
    sponsors:async()=>clone(state.sponsors),createSponsor:async p=>{const x={id:uid(),name:p.name,tier:p.tier,logo_url:p.logoUrl||null,website_url:p.websiteUrl||"",sort_order:state.sponsors.length+1};state.sponsors.push(x);persist();return clone(x)},updateSponsor:async(id,p)=>{Object.assign(state.sponsors.find(x=>x.id===id),p);persist();return {}},deleteSponsor:async id=>{state.sponsors=state.sponsors.filter(x=>x.id!==id);persist();return {ok:true}},
    posts:async()=>clone(state.posts),createPost:async p=>{const x={id:uid(),title:p.title,slug:uid(),excerpt:p.excerpt||"",body:p.body||"",cover_url:p.coverUrl||null,status:p.status||"draft",published_at:p.status==="published"?new Date().toISOString():null};state.posts.unshift(x);persist();return clone(x)},updatePost:async(id,p)=>{const x=state.posts.find(v=>v.id===id);Object.assign(x,p);if(p.status==="published"&&!x.published_at)x.published_at=new Date().toISOString();persist();return clone(x)},deletePost:async id=>{state.posts=state.posts.filter(x=>x.id!==id);persist();return {ok:true}},
    branding:async()=>clone(state.branding),saveBranding:async p=>{state.branding={...state.branding,...p};persist();return clone(state.branding)},
    bookings:async()=>clone(state.bookings),createBooking:async p=>{const court=state.courts.find(c=>c.id===p.courtId);const x={id:uid(),court_id:p.courtId,court_name:court?.name||"Sân",tournament_name:"Saigon Pickle Open 2026",title:p.title,contact_name:p.contactName,contact_phone:p.contactPhone,start_at:p.startAt,end_at:p.endAt,status:"confirmed",notes:p.notes};state.bookings.unshift(x);persist();return clone(x)},updateBooking:async(id,p)=>{Object.assign(state.bookings.find(x=>x.id===id),p);persist();return {}},deleteBooking:async id=>{const x=state.bookings.find(v=>v.id===id);x.status="cancelled";persist();return {mode:"cancelled",entity:clone(x)}},
    reportOverview:async()=>({players:state.players.length,registrations:state.registrations.length,checked_in:state.registrations.filter(r=>r.checked_in_at).length,paid_count:state.registrations.filter(r=>r.payment_status==="paid").length,revenue:state.registrations.filter(r=>r.payment_status==="paid").reduce((a,r)=>a+Number(r.amount||0),0),matches:state.matches.length,live:state.matches.filter(m=>m.status==="live").length,completed:state.matches.filter(m=>m.status==="done").length}),
    addTeamPlayer:async()=>({ok:true})
  };
  window.PickleAPI=api;
  window.io=()=>({on:(event,cb)=>window.addEventListener("pickle-preview-update",e=>{if(event==="public:state"||event==="match:update")cb(clone(e.detail))})});
  window.addEventListener("storage",e=>{if(e.key===KEY&&e.newValue){state=JSON.parse(e.newValue);window.dispatchEvent(new CustomEvent("pickle-preview-update",{detail:clone(state)}))}});
})();