(() => {
  const KEY="pickle-preview-state-v3";
  const uid=()=>crypto.randomUUID?.()||("id-"+Date.now()+"-"+Math.random().toString(16).slice(2));
  const seed=()=>({
    tournaments:[
      {id:"t1",name:"Saigon Pickle Open 2026",date:"27/09/2026",venue:"Pickle Hub Bình Thạnh",format:"Doubles 3.0–3.5",status:"live",teams:6}
    ],
    divisions:[
      {id:"d1",tournamentId:"t1",name:"Doubles 3.0–3.5",eventType:"doubles",format:"pool_to_knockout",bestOf:3,pointsToWin:11,winByTwo:true,advanceCount:2}
    ],
    courts:[
      {id:"c1",tournamentId:"t1",name:"Sân 1",sortOrder:1,active:true},
      {id:"c2",tournamentId:"t1",name:"Sân 2",sortOrder:2,active:true},
      {id:"c3",tournamentId:"t1",name:"Sân 3",sortOrder:3,active:true},
      {id:"c4",tournamentId:"t1",name:"Sân 4",sortOrder:4,active:true}
    ],
    clubs:[
      {id:"cl1",name:"Bình Lợi",city:"TP.HCM"},{id:"cl2",name:"Gò Vấp",city:"TP.HCM"},{id:"cl3",name:"Phú Nhuận",city:"TP.HCM"},{id:"cl4",name:"Thủ Đức",city:"TP.HCM"}
    ],
    players:[
      {id:"p1",full_name:"Minh Búa",nickname:"",gender:"male",rating:3.420,club_id:"cl1",club_name:"Bình Lợi",active:true},
      {id:"p2",full_name:"Quốc Anh",nickname:"",gender:"male",rating:3.365,club_id:"cl1",club_name:"Bình Lợi",active:true},
      {id:"p3",full_name:"Hoàng Nam",nickname:"",gender:"male",rating:3.310,club_id:"cl2",club_name:"Gò Vấp",active:true},
      {id:"p4",full_name:"Tuấn Kiệt",nickname:"",gender:"male",rating:3.295,club_id:"cl2",club_name:"Gò Vấp",active:true}
    ],
    teams:[
      {id:"A1",divisionId:"d1",name:"Minh Búa / Quốc Anh",club:"Bình Lợi",group:"A",seed:1,w:1,l:0,pf:22,pa:16},
      {id:"A2",divisionId:"d1",name:"Hoàng Nam / Tuấn Kiệt",club:"Gò Vấp",group:"A",seed:2,w:1,l:1,pf:48,pa:47},
      {id:"A3",divisionId:"d1",name:"Gia Huy / Đức Long",club:"Phú Nhuận",group:"A",seed:3,w:0,l:1,pf:25,pa:33},
      {id:"B1",divisionId:"d1",name:"Bảo Minh / Trọng Nhân",club:"Thủ Đức",group:"B",seed:1,w:0,l:0,pf:0,pa:0},
      {id:"B2",divisionId:"d1",name:"Thanh Tùng / Hải Đăng",club:"Bình Lợi",group:"B",seed:2,w:0,l:0,pf:0,pa:0},
      {id:"B3",divisionId:"d1",name:"Quang Huy / Anh Khoa",club:"Tân Bình",group:"B",seed:3,w:0,l:0,pf:0,pa:0}
    ],
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
    registrations:[],
    audit:[
      {time:"20:04",user:"BTC Nguyễn Hoàng",action:"Cập nhật lịch thi đấu",detail:"M7 → Sân 1 lúc 20:15"},
      {time:"19:52",user:"Trọng tài Lan",action:"Chốt kết quả",detail:"M2: A2 thắng A3 2–1"}
    ]
  });
  const load=()=>JSON.parse(localStorage.getItem(KEY)||"null")||seed();
  let state=load();
  const persist=()=>{localStorage.setItem(KEY,JSON.stringify(state));window.dispatchEvent(new CustomEvent("pickle-preview-update",{detail:structuredClone(state)}));};
  const clone=x=>JSON.parse(JSON.stringify(x));
  const api={
    me:async()=>({user:{id:"preview-admin",email:"preview@local",name:"Preview Admin",role:"super_admin"}}),
    logout:async()=>({ok:true}),
    changePassword:async()=>({ok:true}),
    publicState:async()=>clone(state),
    adminState:async()=>clone(state),
    publicPlayers:async()=>clone(state.players),
    publicClubs:async()=>clone(state.clubs),
    players:async()=>clone(state.players),
    clubs:async()=>clone(state.clubs),
    createClub:async p=>{const x={id:uid(),name:p.name,city:p.city||""};state.clubs.push(x);persist();return x},
    createPlayer:async p=>{const club=state.clubs.find(c=>c.id===p.clubId);const x={id:uid(),full_name:p.fullName,nickname:p.nickname||"",gender:p.gender||null,rating:Number(p.rating||3),phone:p.phone||"",club_id:p.clubId||null,club_name:club?.name||"Tự do",active:true};state.players.push(x);persist();return x},
    adjustRating:async(id,p)=>{const x=state.players.find(v=>v.id===id);x.rating=Math.max(0,Number(x.rating||0)+Number(p.delta||0));state.audit.unshift({time:new Date().toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}),user:"Preview Admin",action:"ADJUST_RATING",detail:p.reason||""});persist();return clone(x)},
    createTournament:async p=>{const t={id:uid(),name:p.name,date:p.startAt?new Date(p.startAt).toLocaleDateString("vi-VN"):"Chưa chốt",venue:p.venue||"Chưa chốt",format:"Tournament",status:"open",teams:0};state.tournaments.push(t);const d={id:uid(),tournamentId:t.id,name:"Open",eventType:p.eventType||"doubles",format:"pool_to_knockout",bestOf:3,pointsToWin:11,winByTwo:true,advanceCount:2};state.divisions.push(d);persist();return {tournament:t,division:d}},
    createDivision:async(tid,p)=>{const d={id:uid(),tournamentId:tid,name:p.name,eventType:p.eventType,format:p.format,bestOf:p.bestOf,pointsToWin:p.pointsToWin,winByTwo:p.winByTwo,advanceCount:p.advanceCount};state.divisions.push(d);persist();return clone(d)},
    createCourt:async(tid,p)=>{const c={id:uid(),tournamentId:tid,name:p.name,sortOrder:state.courts.filter(x=>x.tournamentId===tid).length+1,active:true};state.courts.push(c);persist();return clone(c)},
    updateCourt:async(id,p)=>{const c=state.courts.find(x=>x.id===id);Object.assign(c,p);persist();return clone(c)},
    createTeam:async(did,p)=>{const id=(p.group||"X")+Math.ceil(Math.random()*90);const t={id,divisionId:did,name:p.name,club:p.club||"Tự do",group:p.group||"A",seed:p.seed||null,w:0,l:0,pf:0,pa:0};state.teams.push(t);persist();return clone(t)},
    updateDivision:async(id,p)=>{const d=state.divisions.find(x=>x.id===id);Object.assign(d,p);persist();return clone(d)},
    createMatch:async(did,p)=>{const court=state.courts.find(c=>c.id===p.courtId);const m={id:uid(),divisionId:did,stage:p.stage||"Vòng bảng",court:court?.sortOrder||court?.name||"—",courtId:p.courtId||null,time:p.scheduledAt?new Date(p.scheduledAt).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}):"—",a:p.teamAId,b:p.teamBId,status:"wait",sets:[],current:[0,0],winner:null,version:1,refereeId:p.refereeUserId||null};state.matches.push(m);persist();return clone(m)},
    generateRoundRobin:async()=>({created:0}),
    generateBracket:async()=>({ok:true}),
    assignMatch:async(id,p)=>{const m=state.matches.find(x=>x.id===id);if(p.courtId){const c=state.courts.find(x=>x.id===p.courtId);m.courtId=p.courtId;m.court=c?.sortOrder||c?.name||m.court}if(p.refereeUserId!==undefined)m.refereeId=p.refereeUserId;if(p.scheduledAt)m.time=new Date(p.scheduledAt).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"});m.version++;persist();return clone(m)},
    point:async(id,p)=>{const m=state.matches.find(x=>x.id===id),i=p.side==="A"?0:1;m.current[i]=Math.max(0,m.current[i]+Number(p.delta));m.status="live";m.version++;persist();return clone(m)},
    finishSet:async(id)=>{const m=state.matches.find(x=>x.id===id);m.sets.push([...m.current]);m.current=[0,0];m.version++;persist();return clone(m)},
    finishMatch:async(id)=>{const m=state.matches.find(x=>x.id===id);const aw=m.sets.filter(s=>s[0]>s[1]).length,bw=m.sets.filter(s=>s[1]>s[0]).length;m.winner=aw>=bw?m.a:m.b;m.status="done";m.version++;if(m.id==="m7")state.matches.find(x=>x.id==="m9").a=m.winner;if(m.id==="m8")state.matches.find(x=>x.id==="m9").b=m.winner;state.audit.unshift({time:new Date().toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}),user:"Preview Admin",action:"Chốt kết quả",detail:m.stage});persist();return clone(m)},
    undo:async(id)=>{const m=state.matches.find(x=>x.id===id);if(m.current[0]||m.current[1]){if(m.current[0]>=m.current[1]&&m.current[0]>0)m.current[0]--;else if(m.current[1]>0)m.current[1]--;}m.version++;persist();return clone(m)},
    referees:async()=>clone(state.referees),
    createReferee:async p=>{const r={id:uid(),email:p.email,display_name:p.name,active:true};state.referees.push(r);persist();return clone(r)},
    registrations:async()=>clone(state.registrations),
    createRegistration:async(did,p)=>{const d=state.divisions.find(x=>x.id===did),t=state.tournaments.find(x=>x.id===d?.tournamentId),team=state.teams.find(x=>x.id===p.teamId);const r={id:uid(),status:"approved",payment_status:"unpaid",amount:p.amount||null,team_name:team?.name||"",division_name:d?.name||"",tournament_name:t?.name||"",payment_id:null,payment_review_status:null};state.registrations.push(r);persist();return clone(r)},
    addPayment:async(id,p)=>{const r=state.registrations.find(x=>x.id===id);r.payment_id=uid();r.payment_review_status="pending";r.payment_status="pending";r.method=p.method;r.reference_code=p.referenceCode;persist();return clone(r)},
    reviewPayment:async(pid,status)=>{const r=state.registrations.find(x=>x.payment_id===pid);if(r){r.payment_review_status=status;r.payment_status=status==="approved"?"paid":"unpaid";persist()}return clone(r)},
    addTeamPlayer:async()=>({ok:true})
  };
  window.PickleAPI=api;
  window.io=()=>({on:(event,cb)=>window.addEventListener("pickle-preview-update",e=>{if(event==="public:state"||event==="match:update")cb(clone(e.detail))})});
  window.addEventListener("storage",e=>{if(e.key===KEY&&e.newValue){state=JSON.parse(e.newValue);window.dispatchEvent(new CustomEvent("pickle-preview-update",{detail:clone(state)}));}});
})();