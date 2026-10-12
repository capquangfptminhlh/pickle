(()=>{
  const KEY="pickle-local-state-v1";
  const uid=()=>crypto.randomUUID?.()||("id-"+Date.now()+"-"+Math.random().toString(16).slice(2));
  const clone=x=>JSON.parse(JSON.stringify(x));
  const registryNameKey=value=>String(value??"").normalize("NFC").trim().toLocaleLowerCase("vi");
  const playerCountRange=eventType=>eventType==="singles"?{min:1,max:1}:(eventType==="doubles"||eventType==="mixed_doubles")?{min:2,max:2}:{min:1,max:4};
  const validatePreviewPlayerIds=(eventType,input)=>{
    const original=(Array.isArray(input)?input:[]).map(value=>String(value||"").trim()).filter(Boolean);
    if(!original.length)throw new Error("PLAYER_SELECTION_REQUIRED");
    const ids=[...new Set(original)];
    if(ids.length!==original.length)throw new Error("DUPLICATE_PLAYER_SELECTION");
    const {min,max}=playerCountRange(eventType);
    if(ids.length<min||ids.length>max)throw new Error("INVALID_PLAYER_COUNT");
    return ids;
  };
  const relayStarted=m=>Boolean(m.startedAt||m.started_at||m.hasHistory||["live","done","completed","walkover","cancelled"].includes(m.status)||m.winner||m.sets?.length||m.current?.some(Number));
  const relaySupported=m=>{const d=state.divisions.find(x=>x.id===m.divisionId);return d?.eventType==="team"&&Number(d.relaySegmentPoints)>0&&Number(d.relayTeamSize||Math.ceil(Number(d.pointsToWin)/Number(d.relaySegmentPoints)))===3};
  const knockoutStarted=m=>{const bye=['done','completed'].includes(m.status)&&(Number(m.roundNo)===1||/^(?:B-)?SE-R1-M/.test(m.bracketSlot||''))&&Boolean(m.a&&m.a!=='TBD')!==Boolean(m.b&&m.b!=='TBD')&&m.winner===(m.a&&m.a!=='TBD'?m.a:m.b);return bye?Boolean(m.hasHistory||m.startedAt||m.current?.some(Number)||m.sets?.length):relayStarted(m)};
  const validRelayOrder=order=>Array.isArray(order)&&order.length===3&&new Set(order).size===3&&order.every(c=>["AB","BC","CA"].includes(c));
  const clearRelay=m=>{m.relayOrderA=null;m.relayOrderB=null;m.relayDrawnAt=null;m.version++};
  const checkScore=(m,p={})=>{if(!m)throw new Error("NOT_FOUND");if(p.expectedVersion!==undefined&&Number(p.expectedVersion)!==m.version)throw new Error("VERSION_CONFLICT");if(relaySupported(m)&&!relayStarted(m)&&!(validRelayOrder(m.relayOrderA)&&validRelayOrder(m.relayOrderB)))throw new Error("RELAY_DRAW_REQUIRED")};
  const shuffledRelay=()=>{const order=["AB","BC","CA"];for(let i=order.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[order[i],order[j]]=[order[j],order[i]]}return order};
  const svgAvatar=(name,bg="#0d2118",fg="#dfff69")=>{
    const ini=(name||"P").split(/\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase();
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="72" fill="'+bg+'"/><circle cx="196" cy="60" r="46" fill="#ffffff12"/><text x="128" y="148" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="82" fill="'+fg+'">'+ini+'</text></svg>';
    return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
  };
  const fileData=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
  const emptyState=()=>({
    tournaments:[],
    divisions:[],
    courts:[],
    clubs:[],
    players:[],
    teams:[],
    teamPlayers:{},
    matches:[],
    referees:[],
    registrations:[],
    sponsors:[],
    posts:[],
    branding:{name:"Pickleup.vn",primaryColor:"#0a8b55",accentColor:"#dfff69",logoUrl:""},
    bookings:[],
    clubEvents:[],
    clubAttendance:{},
    clubTransactions:[],
    ratingHistory:{},
    ratingProcessedKeys:[],
    audit:[]
  });
  let state=JSON.parse(localStorage.getItem(KEY)||"null")||emptyState();
  if(state.branding?.name==="Pickle Tour"){state.branding.name="Pickleup.vn";localStorage.setItem(KEY,JSON.stringify(state));}
  state.clubEvents||=[];state.clubAttendance||={};state.clubTransactions||=[];
  const withLineupSources=value=>({...value,teamLineupSources:Object.fromEntries(Object.keys(value.teamPlayers||{}).map(teamId=>[teamId,"assigned"]))});
  state.ratingProcessedKeys||=[];
  const avatarMigration=state.players?.some(p=>!p.avatar_url);
  if(avatarMigration){
    state.players.forEach(p=>{if(!p.avatar_url)p.avatar_url=svgAvatar(p.full_name||"Player")});
    localStorage.setItem(KEY,JSON.stringify(state));
  }
  const normalizeLegacySmallGroups=()=>{
    let changed=false;
    for(const d of (state.divisions||[])){
      const teams=(state.teams||[]).filter(t=>t.divisionId===d.id&&t.status!=="withdrawn");
      if(teams.length<4)continue;
      const target=Math.max(1,Math.floor(teams.length/4));
      const labels=[...new Set(teams.map(t=>t.group).filter(Boolean))];
      const groupMatches=(state.matches||[]).filter(m=>m.divisionId===d.id&&!m.bracketSlot&&(m.stage||"").startsWith("Bảng "));
      const started=groupMatches.some(m=>m.status==="live"||m.status==="done"||m.status==="completed"||(m.sets||[]).length||(m.current?.[0]||m.current?.[1]));
      const desiredSizes=Array.from({length:target},(_,i)=>Math.floor(teams.length/target)+(i<teams.length%target?1:0));
      const actualSizes=labels.map(g=>teams.filter(t=>t.group===g).length).sort((a,b)=>b-a);
      const expectedSizes=[...desiredSizes].sort((a,b)=>b-a);
      const needsRebalance=labels.length!==target||actualSizes.length!==expectedSizes.length||actualSizes.some((n,i)=>n!==expectedSizes[i]);
      if(started||!needsRebalance)continue;
      state.matches=(state.matches||[]).filter(m=>!(m.divisionId===d.id&&!m.bracketSlot&&(m.stage||"").startsWith("Bảng ")));
      const ordered=[...teams].sort((a,b)=>(a.seed||999)-(b.seed||999)||String(a.name).localeCompare(String(b.name),"vi"));
      ordered.forEach((t,i)=>{t.group=String.fromCharCode(65+(i%target));t.seed=i+1});
      let created=0;
      for(let gi=0;gi<target;gi++){
        const g=String.fromCharCode(65+gi),arr=ordered.filter(t=>t.group===g);
        for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
          const court=(state.courts||[])[created%Math.max(1,(state.courts||[]).length)];
          state.matches.push({id:uid(),divisionId:d.id,stage:"Bảng "+g,court:court?.sortOrder||1,courtId:court?.id||null,time:"--:--",a:arr[i].id,b:arr[j].id,status:"wait",sets:[],current:[0,0],winner:null,version:1,bracketSlot:null});created++;
        }
      }
      changed=true;
    }
    if(changed)localStorage.setItem(KEY,JSON.stringify(state));
  };
  normalizeLegacySmallGroups();
  const validateSeriesRules=d=>{if(d.seriesBEnabled){if((d.format||"pool_to_knockout")!=="pool_to_knockout")throw new Error("SERIES_B_REQUIRES_POOL_FORMAT");if(!Number.isInteger(Number(d.advanceCount??2))||Number(d.advanceCount??2)<1||Number(d.advanceCount??2)>=3)throw new Error("SERIES_B_ADVANCE_COUNT_OVERLAP")}};
  const checkBracketSettings=(d,p)=>{const keys=["format","advanceCount","thirdPlaceMatch","seriesBEnabled","seriesBThirdPlaceMatch"];if(state.matches.some(m=>m.divisionId===d.id&&m.bracketSlot)&&keys.some(key=>p[key]!==undefined&&(key.endsWith("Match")||key==="seriesBEnabled"?Boolean(p[key])!==Boolean(d[key]):p[key]!==d[key])))throw new Error("BRACKET_SETTINGS_LOCKED")};
  const recomputeStats=()=>{
    const stats=new Map(state.teams.map(t=>[t.id,{w:0,l:0,sw:0,sl:0,pf:0,pa:0}]));
    const isGroupMatch=m=>!m.bracketSlot&&((m.stage&&m.stage.startsWith("Bảng"))||/bảng|group|vòng bảng/i.test(m.stage||"")||!/chung kết|bán kết|tứ kết/i.test(m.stage||""));
    for(const m of (state.matches||[]).filter(x=>(x.status==="done"||x.status==="completed")&&isGroupMatch(x)&&x.winner)){
      const ms=m.sets||[];let ap=0,bp=0,asw=0,bsw=0;
      for(const [a,b] of ms){
        ap+=Number(a||0);bp+=Number(b||0);
        if(Number(a)>Number(b))asw++;else if(Number(b)>Number(a))bsw++;
      }
      const sa=stats.get(m.a),sb=stats.get(m.b);
      if(sa){sa.pf+=ap;sa.pa+=bp;sa.sw+=asw;sa.sl+=bsw;m.winner===m.a?sa.w++:sa.l++}
      if(sb){sb.pf+=bp;sb.pa+=ap;sb.sw+=bsw;sb.sl+=asw;m.winner===m.b?sb.w++:sb.l++}
    }
    state.teams.forEach(t=>{
      const s=stats.get(t.id)||{w:0,l:0,sw:0,sl:0,pf:0,pa:0};
      Object.assign(t,{...s,diffSet:s.sw-s.sl,diffPts:s.pf-s.pa});
      delete t.standingRank;
    });
    for(const d of state.divisions)for(const g of new Set(state.teams.filter(t=>t.divisionId===d.id).map(t=>t.group).filter(Boolean)))rankGroupFor(d.id,g).forEach((t,i)=>{t.standingRank=i+1});
  };
  const groupMatchesFor=(did,g)=>state.matches.filter(m=>m.divisionId===did&&!m.bracketSlot&&(m.stage==="Bảng "+g||(m.stage||"").includes("Bảng "+g)));
  const rankGroupFor=(did,g)=>{
    const gm=groupMatchesFor(did,g).filter(m=>(m.status==="done"||m.status==="completed")&&m.winner);
    const teams=state.teams.filter(t=>t.divisionId===did&&t.group===g&&t.status!=="withdrawn");
    // Two tied teams use head-to-head; larger tied buckets use overall point differential.
    const buckets=new Map();for(const t of teams){const wins=Number(t.w||0);if(!buckets.has(wins))buckets.set(wins,[]);buckets.get(wins).push(t)}
    const result=[];
    for(const wins of [...buckets.keys()].sort((a,b)=>b-a)){
      const bucket=buckets.get(wins),mini=new Map(bucket.map(t=>[t.id,{w:0,sw:0,sl:0,pf:0,pa:0}]));
      for(const m of gm){if(!mini.has(m.a)||!mini.has(m.b))continue;const a=mini.get(m.a),b=mini.get(m.b);if(m.winner===m.a)a.w++;else if(m.winner===m.b)b.w++;for(const [x,y] of m.sets||[]){a.pf+=x;a.pa+=y;b.pf+=y;b.pa+=x;if(x>y){a.sw++;b.sl++}else if(y>x){b.sw++;a.sl++}}}
      bucket.sort((a,b)=>{const x=mini.get(a.id),y=mini.get(b.id);if(bucket.length>=3)return ((b.pf||0)-(b.pa||0))-((a.pf||0)-(a.pa||0))||((b.sw||0)-(b.sl||0))-((a.sw||0)-(a.sl||0))||((b.pf||0)-(b.pa||0))-((a.pf||0)-(a.pa||0))||(b.pf||0)-(a.pf||0)||(a.seed||9999)-(b.seed||9999)||String(a.name||" ").localeCompare(String(b.name||" "),"vi");return y.w-x.w||(y.sw-y.sl)-(x.sw-x.sl)||(y.pf-y.pa)-(x.pf-x.pa)||((b.sw||0)-(b.sl||0))-((a.sw||0)-(a.sl||0))||((b.pf||0)-(b.pa||0))-((a.pf||0)-(a.pa||0))||(b.pf||0)-(a.pf||0)||(a.seed||9999)-(b.seed||9999)||String(a.name||'').localeCompare(String(b.name||''),'vi')});result.push(...bucket);
    }
    return result;
  };
  const knockoutTeamsFor=(did,series="A")=>{
    recomputeStats();
    const active=state.teams.filter(t=>t.divisionId===did&&t.status!=="withdrawn");
    const groups=[...new Set(active.map(t=>t.group).filter(Boolean))].sort();
    const gm=state.matches.filter(m=>m.divisionId===did&&!m.bracketSlot&&(m.stage||"").startsWith("Bảng "));
    const division=state.divisions.find(d=>d.id===did);
    if(division?.format==="pool_to_knockout"){
      if(!groups.length||!gm.length||active.some(t=>!t.group)||gm.some(m=>!["done","completed","walkover"].includes(m.status)||!m.winner))throw new Error("GROUP_STAGE_NOT_COMPLETE");
      const q=[];
      for(const g of groups){
        const r=rankGroupFor(did,g);
        const played=groupMatchesFor(did,g);for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++)if(!played.some(m=>(m.a===r[i].id&&m.b===r[j].id)||(m.b===r[i].id&&m.a===r[j].id)))throw new Error("GROUP_STAGE_NOT_COMPLETE");
        if(series==="B"){if(!r[2])throw new Error("NOT_ENOUGH_SERIES_B_QUALIFIERS");q.push({...r[2],qualifierGroup:g,qualifierPlace:3})}
        else for(let i=0;i<Math.max(1,Number(division.advanceCount||2))&&i<r.length;i++)q.push({...r[i],qualifierGroup:g,qualifierPlace:i+1});
      }
      if(q.length<2)throw new Error(series==="B"?"NOT_ENOUGH_SERIES_B_QUALIFIERS":"NOT_ENOUGH_QUALIFIERS");
      return q;
    }
    return [...active].sort((a,b)=>(a.seed||999)-(b.seed||999));
  };
  const progressSingleElim=did=>{
    const ms=state.matches.filter(m=>m.divisionId===did&&/^(?:B-)?SE-/.test(m.bracketSlot||""));
    if(!ms.length)return;
    let changed=true,guard=0;
    while(changed&&guard++<32){
      changed=false;
      for(const m of ms){
        const x=(m.bracketSlot||"").match(/^(B-)?SE-R(\d+)-M(\d+)$/);
        if(!x||!(m.status==="done"||m.status==="completed")||!m.winner)continue;
        const prefix=x[1]||"",round=Number(x[2]),num=Number(x[3]);
        const target=ms.find(n=>n.bracketSlot===`${prefix}SE-R${round+1}-M${Math.ceil(num/2)}`);
        if(!target)continue;
        const side=num%2===1?"a":"b";
        if(target[side]!==m.winner){target[side]=m.winner;target.status="wait";target.version=(target.version||0)+1;changed=true}
        // Semifinal losers drop into the third-place playoff when it exists.
        const third=ms.find(n=>n.bracketSlot===`${prefix}SE-3RD-M1`);
        const isSemi=!ms.some(n=>n.bracketSlot===`${prefix}SE-R${round+2}-M1`);
        if(third&&isSemi&&m.resultReason!=="bye"){
          const loser=m.winner===m.a?m.b:m.a;
          if(loser&&loser!=="TBD"&&third[side]!==loser){third[side]=loser;third.status="wait";third.version=(third.version||0)+1;changed=true}
        }
      }
    }
  };
  const evaluateTournamentRatings=()=>{
    state.ratingProcessedKeys||=[];
    const ensurePlayer=pid=>{
      let pl=state.players.find(x=>x.id===pid);
      if(!pl&&typeof window!=="undefined"&&window.PICKLE_BINH_LOI_MEMBERS?.length){
        const zl=window.PICKLE_BINH_LOI_MEMBERS.find((m,i)=>("zl-"+m.zaloId)===pid||("p-"+i)===pid||m.id===pid);
        if(zl){
          pl={id:pid,full_name:zl.fullName||zl.name,nickname:zl.nickname||"",gender:zl.gender||"male",rating:Number(zl.rating)||(zl.gender==="female"?2.0:2.5),avatar_url:zl.avatarUrl||zl.avatar_url||"",club_id:null,club_name:zl.club||"CLB Pickleball Bình Lợi",active:true};
          state.players.push(pl);
        }
      }
      return pl;
    };
    (state.divisions||[]).forEach(d=>{
      const groups=[...new Set(state.teams.filter(t=>t.divisionId===d.id&&t.status!=="withdrawn").map(t=>t.group).filter(Boolean))];
      groups.forEach(g=>{
        const gMatches=(state.matches||[]).filter(m=>m.divisionId===d.id&&!m.bracketSlot&&(m.stage==="Bảng "+g||(m.stage||"").includes("Bảng "+g)));
        if(gMatches.length>0&&gMatches.every(m=>(m.status==="done"||m.status==="completed")&&m.winner)){
          const gTeams=state.teams.filter(t=>t.divisionId===d.id&&t.group===g&&t.status!=="withdrawn");
          const ranked=[...gTeams].sort((a,b)=>{
            if(b.w!==a.w)return b.w-a.w;
            const sdA=(a.sw||0)-(a.sl||0),sdB=(b.sw||0)-(b.sl||0);
            if(sdB!==sdA)return sdB-sdA;
            const h2h=gMatches.find(m=>((m.a===a.id&&m.b===b.id)||(m.a===b.id&&m.b===a.id))&&m.winner);
            if(h2h){if(h2h.winner===a.id)return -1;if(h2h.winner===b.id)return 1;}
            return ((b.pf-b.pa)-(a.pf-a.pa))||(b.pf-a.pf)||((a.seed||999)-(b.seed||999));
          });
          const advCount=Number(d.advanceCount)||2;
          const eliminated=ranked.slice(advCount);
          eliminated.forEach(t=>{
            const pids=state.teamPlayers[t.id]||[];
            pids.forEach(pid=>{
              const key="elim:"+d.id+":"+t.id+":"+pid;
              if(!state.ratingProcessedKeys.includes(key)){
                const pl=ensurePlayer(pid);
                if(pl){
                  const before=Number(pl.rating||0);
                  pl.rating=Math.max(0,Math.round((before-0.2)*100)/100);
                  (state.ratingHistory[pid]||(state.ratingHistory[pid]=[])).unshift({
                    before_rating:before,
                    delta:-0.2,
                    after_rating:pl.rating,
                    reason:`Dừng bước vòng bảng ${g} (${d.name||"Giải đấu"}) (-0.2)`,
                    created_at:new Date().toISOString()
                  });
                  state.ratingProcessedKeys.push(key);
                }
              }
            });
          });
        }
      });
      const dMatches=(state.matches||[]).filter(m=>m.divisionId===d.id);
      const finalMatch=dMatches.find(m=>m.bracketSlot==="DE-GF")||
        [...dMatches.filter(m=>(m.bracketSlot||"").startsWith("SE-"))].sort((a,b)=>(b.bracketSlot||"").localeCompare(a.bracketSlot||"",undefined,{numeric:true}))[0]||
        dMatches.find(m=>/chung kết/i.test(m.stage||""));
      let champTeamId=null;
      if(finalMatch&&(finalMatch.status==="done"||finalMatch.status==="completed")&&finalMatch.winner){
        champTeamId=finalMatch.winner;
      }else if(d.format==="round_robin"&&dMatches.length>0&&dMatches.every(m=>(m.status==="done"||m.status==="completed")&&m.winner)){
        const allTeams=state.teams.filter(t=>t.divisionId===d.id&&t.status!=="withdrawn");
        const rankedAll=[...allTeams].sort((a,b)=>{
          if(b.w!==a.w)return b.w-a.w;
          const sdA=(a.sw||0)-(a.sl||0),sdB=(b.sw||0)-(b.sl||0);
          if(sdB!==sdA)return sdB-sdA;
          return ((b.pf-b.pa)-(a.pf-a.pa))||(b.pf-a.pf);
        });
        if(rankedAll.length)champTeamId=rankedAll[0].id;
      }
      if(champTeamId){
        const pids=state.teamPlayers[champTeamId]||[];
        pids.forEach(pid=>{
          const key="champ:"+d.id+":"+champTeamId+":"+pid;
          if(!state.ratingProcessedKeys.includes(key)){
            const pl=ensurePlayer(pid);
            if(pl){
              const before=Number(pl.rating||0);
              pl.rating=Math.round((before+0.2)*100)/100;
              (state.ratingHistory[pid]||(state.ratingHistory[pid]=[])).unshift({
                before_rating:before,
                delta:0.2,
                after_rating:pl.rating,
                reason:`Vô địch giải đấu (${d.name||"Nội dung"}) (+0.2)`,
                created_at:new Date().toISOString()
              });
              state.ratingProcessedKeys.push(key);
            }
          }
        });
      }
    });
  };
  recomputeStats();
  evaluateTournamentRatings();
  const persist=()=>{recomputeStats();evaluateTournamentRatings();localStorage.setItem(KEY,JSON.stringify(state));window.dispatchEvent(new CustomEvent("pickle-preview-update",{detail:clone(state)}));};

  const AUTH_KEY="pickle-preview-auth-v1";
  const DEMO_EMAIL="admin@pickle.test";
  const DEMO_PASSWORD="ci-password-123";
  const DEMO_USER={id:"local-admin",email:DEMO_EMAIL,name:"Quản trị viên",role:"super_admin"};
  const authError=()=>Object.assign(new Error("AUTH_REQUIRED"),{status:401});
  const readSession=()=>{
    try{
      const s=JSON.parse(localStorage.getItem(AUTH_KEY)||"null");
      return s?.user?.id?s:null;
    }catch{return null}
  };
  const requireSession=()=>{
    const s=readSession();
    if(!s)throw authError();
    return s;
  };

  const api={
    login:async(email,password)=>{
      const normalized=String(email||"").trim().toLowerCase();
      let user=null;
      if(normalized===DEMO_EMAIL&&String(password||"")===DEMO_PASSWORD)user=DEMO_USER;
      if(!user){
        const ref=(state.referees||[]).find(r=>r.active!==false&&String(r.email||"").toLowerCase()===normalized&&String(r.password||"")===String(password||""));
        if(ref)user={id:ref.id,email:ref.email,name:ref.display_name,role:"referee"};
      }
      if(!user)throw Object.assign(new Error("INVALID_CREDENTIALS"),{status:401});
      const session={user,createdAt:new Date().toISOString()};
      localStorage.setItem(AUTH_KEY,JSON.stringify(session));
      return clone(session);
    },
    session:async()=>clone(requireSession()),
    me:async()=>clone(requireSession()),
    logout:async()=>{localStorage.removeItem(AUTH_KEY);return {ok:true}},
    changePassword:async()=>{throw Object.assign(new Error("PREVIEW_DEMO_ACCOUNT"),{status:400})},
    publicState:async()=>{recomputeStats();evaluateTournamentRatings();return clone(withLineupSources(state))},
    submitTournament:async(payload,bannerFile=null)=>{const isFeatured=payload.sponsorPackage==="top_sponsor"||payload.sponsorPackage==="highlight";const posterUrl=bannerFile?await fileData(bannerFile):(payload.posterUrl||null);const t={id:"tour-"+Date.now(),name:payload.name,date:payload.startAt?new Date(payload.startAt).toLocaleDateString("vi-VN"):"Sắp diễn ra",startAt:payload.startAt,endAt:payload.endAt,venue:payload.venue,format:payload.divisionName||"Open",status:"open",publicVisible:true,teams:0,isFeatured,featuredRank:payload.sponsorPackage==="top_sponsor"?100:50,sponsorPackage:payload.sponsorPackage||"free",posterUrl};state.tournaments.unshift(t);persist();return {success:true,tournament:t};},
    adminState:async()=>{recomputeStats();evaluateTournamentRatings();const s=requireSession();if(s.user.role!=="referee")return clone(withLineupSources(state));const matches=(state.matches||[]).filter(m=>m.refereeId===s.user.id);const dids=new Set(matches.map(m=>m.divisionId));const tids=new Set((state.divisions||[]).filter(d=>dids.has(d.id)).map(d=>d.tournamentId));const teamIds=new Set(matches.flatMap(m=>[m.a,m.b]).filter(Boolean));return clone(withLineupSources({...state,tournaments:(state.tournaments||[]).filter(t=>tids.has(t.id)),divisions:(state.divisions||[]).filter(d=>dids.has(d.id)),courts:(state.courts||[]).filter(c=>tids.has(c.tournamentId)),teams:(state.teams||[]).filter(t=>teamIds.has(t.id)),matches,referees:[]}))},
    publicPlayers:async()=>{
      if(state.players&&state.players.length){
        return clone(state.players.map(p=>({...p,club_city:state.clubs.find(c=>c.id===p.club_id)?.city||""})));
      }
      if(typeof window!=="undefined"&&window.PICKLE_BINH_LOI_MEMBERS?.length){
        return window.PICKLE_BINH_LOI_MEMBERS.map((r,i)=>({
          id:r.zaloId?("zl-"+r.zaloId):("p-"+i),
          full_name:r.fullName||r.name,
          nickname:r.nickname||"",
          gender:r.gender||"male",
          avatar_url:r.avatarUrl||r.avatar_url||"",
          rating:Number(r.rating)||(r.gender==="female"?2.0:2.5),
          club_name:r.club||"CLB Pickleball Bình Lợi",
          club_city:"TP.HCM"
        }));
      }
      return [];
    },
    publicClubs:async()=>clone(state.clubs),
    publicPosts:async()=>clone(state.posts.filter(x=>x.status==="published")),
    publicSponsors:async()=>clone(state.sponsors),
    publicBranding:async()=>clone(state.branding),
    publicCheckin:async token=>{const r=state.registrations.find(x=>x.id===token);if(!r)throw Object.assign(new Error("NOT_FOUND"),{status:404});return clone({...r,start_at:new Date().toISOString()})},
    confirmCheckin:async token=>{const r=state.registrations.find(x=>x.id===token);if(!r)throw Object.assign(new Error("NOT_FOUND"),{status:404});r.checked_in_at=new Date().toISOString();persist();return clone(r)},
    publicPlayer:async id=>{
      let p=state.players.find(x=>x.id===id||x.id===("zl-"+id)||("zl-"+x.id)===id);
      if(!p&&typeof window!=="undefined"&&window.PICKLE_BINH_LOI_MEMBERS?.length){
        const cleanId=String(id||"").replace(/^zl-/,"");
        const zl=window.PICKLE_BINH_LOI_MEMBERS.find((m,i)=>String(m.zaloId)===cleanId||("zl-"+m.zaloId)===id||("p-"+i)===id||m.id===id);
        if(zl){
          p={id,full_name:zl.fullName||zl.name,nickname:zl.nickname||"",gender:zl.gender||"male",rating:Number(zl.rating)||(zl.gender==="female"?2.0:2.5),avatar_url:zl.avatarUrl||zl.avatar_url||"",club_name:zl.club||"CLB Pickleball Bình Lợi"};
        }
      }
      if(!p)throw Object.assign(new Error("NOT_FOUND"),{status:404});
      const myTeams=Object.entries(state.teamPlayers||{}).filter(([,ids])=>ids.includes(id)).map(([tid])=>tid);
      const matches=(state.matches||[]).filter(m=>myTeams.includes(m.a)||myTeams.includes(m.b)).map(m=>{
        const myTeam=myTeams.includes(m.a)?m.a:m.b,side=myTeam===m.a?"A":"B";
        let myPoints=0,oppPoints=0;(m.sets||[]).forEach(s=>{if(side==="A"){myPoints+=s[0];oppPoints+=s[1]}else{myPoints+=s[1];oppPoints+=s[0]}});
        const team=state.teams.find(t=>t.id===myTeam),division=state.divisions.find(d=>d.id===team?.divisionId),tournament=state.tournaments.find(t=>t.id===division?.tournamentId);return {id:m.id,tournamentId:tournament?.id||null,tournamentName:tournament?.name||"",divisionName:division?.name||"",stage:m.stage,status:m.status,teamAName:state.teams.find(t=>t.id===m.a)?.name||"TBD",teamBName:state.teams.find(t=>t.id===m.b)?.name||"TBD",mySide:side,winnerTeamId:m.winner,won:m.status==="done"&&m.winner===myTeam,lost:m.status==="done"&&m.winner&&m.winner!==myTeam,sets:m.sets||[],myPoints,oppPoints};
      });
      const wins=matches.filter(x=>x.won).length,losses=matches.filter(x=>x.lost).length,pf=matches.reduce((a,x)=>a+x.myPoints,0),pa=matches.reduce((a,x)=>a+x.oppPoints,0);
      const partnerIds=[...new Set(myTeams.flatMap(tid=>(state.teamPlayers||{})[tid]||[]).filter(pid=>pid!==id))];
      return {profile:{id:p.id,fullName:p.full_name,nickname:p.nickname,gender:p.gender,rating:p.rating,avatarUrl:p.avatar_url,clubName:p.club_name,clubCity:"TP.HCM"},stats:{wins,losses,matches:wins+losses,winRate:wins+losses?Math.round(wins*1000/(wins+losses))/10:0,pointsFor:pf,pointsAgainst:pa,diff:pf-pa},teams:myTeams.map(tid=>{const team=state.teams.find(t=>t.id===tid),division=state.divisions.find(d=>d.id===team?.divisionId),tournament=state.tournaments.find(t=>t.id===division?.tournamentId);return {id:tid,tournament_id:tournament?.id||null,tournament_name:tournament?.name||"",division_name:division?.name||"",start_at:tournament?.startAt||null}}),partners:partnerIds.map(pid=>{const x=state.players.find(p=>p.id===pid);return {id:x.id,full_name:x.full_name,avatar_url:x.avatar_url,rating:x.rating,club_name:x.club_name}}),matches,ratingHistory:clone((state.ratingHistory||{})[id]||[])};
    },
    players:async()=>clone(state.players),clubs:async()=>clone(state.clubs),
    importPlayers:async rows=>{let created=0;const playerMap=new Map(state.players.map(x=>[x.full_name.toLowerCase(),x])),clubMap=new Map(state.clubs.map(c=>[c.name.toLowerCase(),c]));for(const r of rows){const name=String(r.fullName||r.name||"").trim();if(!name)continue;const avatar=String(r.avatarUrl||r.avatar_url||r.avatar||"").trim(),lName=name.toLowerCase();let p=playerMap.get(lName);if(p){if(avatar)p.avatar_url=avatar;created++;continue;}const cName=String(r.club||"").trim();let club=cName?clubMap.get(cName.toLowerCase()):null;if(!club&&cName){club={id:uid(),name:cName,city:"",active:true};state.clubs.push(club);clubMap.set(cName.toLowerCase(),club)}const newP={id:uid(),full_name:name,nickname:r.nickname||"",gender:["male","female","other"].includes(r.gender)?r.gender:null,rating:Number(r.rating)||3,phone:r.phone||"",club_id:club?.id||null,club_name:club?.name||"Tự do",active:true,avatar_url:avatar||svgAvatar(name)};state.players.push(newP);playerMap.set(lName,newP);created++}persist();return {created}},
    importTeams:async(did,rows)=>{
      const division=state.divisions.find(d=>d.id===did);if(!division)throw new Error("NOT_FOUND");
      const plans=[],issues=[],plannedPlayerRows=new Map();
      for(let index=0;index<rows.length;index++){
        const raw=rows[index],name=String(raw.name||raw.team||"").trim();if(!name)continue;
        const playerIds=[];
        for(let slot=0;slot<4;slot++){
          const playerName=String(raw[`player${slot+1}`]||"").trim();if(!playerName)continue;
          const matches=state.players.filter(player=>player.active!==false&&player.active!==0&&registryNameKey(player.full_name)===registryNameKey(playerName));
          if(matches.length!==1)issues.push({row:index+1,field:`player${slot+1}`,name:playerName,reason:matches.length?"AMBIGUOUS_PLAYER":"PLAYER_NOT_FOUND"});
          else{
            playerIds.push(matches[0].id);
            const refs=plannedPlayerRows.get(matches[0].id)||[];refs.push({row:index+1,field:`player${slot+1}`,name:playerName});plannedPlayerRows.set(matches[0].id,refs);
          }
        }
        try{validatePreviewPlayerIds(division.eventType,playerIds)}catch(error){issues.push({row:index+1,field:"players",reason:error.message})}
        plans.push({raw,name,playerIds,id:uid()});
      }
      const assigned=new Set(state.teams.filter(team=>team.divisionId===did&&team.status!=="withdrawn").flatMap(team=>state.teamPlayers[team.id]||[]));
      for(const [playerId,refs] of plannedPlayerRows){
        if(refs.length>1)for(const ref of refs)issues.push({...ref,reason:"PLAYER_ALREADY_IN_IMPORT"});
        if(assigned.has(playerId))for(const ref of refs)issues.push({...ref,reason:"PLAYER_ALREADY_IN_DIVISION"});
      }
      if(issues.length)throw Object.assign(new Error("IMPORT_PLAYER_ISSUES"),{issues});
      let linkedPlayers=0;
      for(const plan of plans){
        const r=plan.raw,clubName=String(r.club||r.clubName||"").trim();
        let club=state.clubs.find(c=>c.name.toLocaleLowerCase("vi")===clubName.toLocaleLowerCase("vi"));
        if(!club&&clubName){club={id:uid(),name:clubName,city:"",active:true};state.clubs.push(club)}
        const t={id:plan.id,divisionId:did,name:plan.name,club:club?.name||"Tự do",clubId:club?.id||null,group:r.group||"A",seed:Number(r.seed)||null,status:"active",w:0,l:0,pf:0,pa:0};
        state.teams.push(t);state.teamPlayers[plan.id]=[...plan.playerIds];linkedPlayers+=plan.playerIds.length;
      }
      persist();return {created:plans.length,linkedPlayers};
    },
    uploadReceipt:async file=>({url:await fileData(file)}),
    uploadImage:async file=>({url:await fileData(file)}),
    uploadPlayerAvatar:async(id,file)=>{const x=state.players.find(v=>v.id===id);x.avatar_url=await fileData(file);persist();return {avatarUrl:x.avatar_url}},
    createClub:async p=>{const x={id:uid(),name:p.name,city:p.city||"",active:true};state.clubs.push(x);persist();return clone(x)},
    updateClub:async(id,p)=>{const x=state.clubs.find(v=>v.id===id);Object.assign(x,p);state.players.filter(v=>v.club_id===id).forEach(v=>v.club_name=x.name);persist();return clone(x)},
    deleteClub:async id=>{const x=state.clubs.find(v=>v.id===id);const used=state.players.some(v=>v.club_id===id)||state.teams.some(t=>t.clubId===id);if(used){x.active=false;persist();return {mode:"archived",entity:clone(x)}}state.clubs=state.clubs.filter(v=>v.id!==id);persist();return {mode:"deleted"}},
    createPlayer:async p=>{const club=state.clubs.find(c=>c.id===p.clubId);const x={id:uid(),full_name:p.fullName,nickname:p.nickname||"",gender:p.gender||null,rating:Number(p.rating||3),phone:p.phone||"",club_id:p.clubId||null,club_name:club?.name||"Tự do",active:true,avatar_url:""};state.players.push(x);persist();return clone(x)},
    updatePlayer:async(id,p)=>{const x=state.players.find(v=>v.id===id);const club=state.clubs.find(c=>c.id===p.clubId);Object.assign(x,{full_name:p.fullName??x.full_name,nickname:p.nickname??x.nickname,gender:p.gender??x.gender,phone:p.phone??x.phone,club_id:p.clubId===undefined?x.club_id:(p.clubId||null),club_name:p.clubId===undefined?x.club_name:(club?.name||"Tự do"),active:p.active??x.active});persist();return clone(x)},
    deactivatePlayer:async id=>{const x=state.players.find(v=>v.id===id);x.active=false;persist();return {mode:"deactivated",entity:clone(x)}},
    adjustRating:async(id,p)=>{let x=state.players.find(v=>v.id===id);if(!x&&typeof window!=="undefined"&&window.PICKLE_BINH_LOI_MEMBERS?.length){const zl=window.PICKLE_BINH_LOI_MEMBERS.find((m,i)=>("zl-"+m.zaloId)===id||("p-"+i)===id||m.id===id);if(zl){x={id,full_name:zl.fullName||zl.name,nickname:zl.nickname||"",gender:zl.gender||"male",rating:Number(zl.rating)||(zl.gender==="female"?2.0:2.5),avatar_url:zl.avatarUrl||zl.avatar_url||"",club_id:null,club_name:zl.club||"CLB Pickleball Bình Lợi",active:true};state.players.push(x)}}if(!x)throw Object.assign(new Error("PLAYER_NOT_FOUND"),{status:404});const before=Number(x.rating||0);x.rating=Math.round(Math.max(0,before+Number(p.delta||0))*100)/100;(state.ratingHistory[id]||(state.ratingHistory[id]=[])).unshift({before_rating:before,delta:Number(p.delta||0),after_rating:x.rating,reason:p.reason||"",created_at:new Date().toISOString()});persist();return clone(x)},
    createTournament:async p=>{const t={id:uid(),name:p.name,date:p.startAt?new Date(p.startAt).toLocaleDateString("vi-VN"):"Chưa chốt",startAt:p.startAt||null,endAt:null,venue:p.venue||"Chưa chốt",format:"Tournament",status:"open",publicVisible:true,teams:0};state.tournaments.push(t);const d={id:uid(),tournamentId:t.id,name:"Open",eventType:p.eventType||"doubles",format:"pool_to_knockout",bestOf:3,pointsToWin:11,winByTwo:true,advanceCount:2,active:true};state.divisions.push(d);persist();return {tournament:t,division:d}},
    updateTournament:async(id,p)=>{const x=state.tournaments.find(v=>v.id===id);Object.assign(x,{name:p.name??x.name,venue:p.venue??x.venue,startAt:p.startAt??x.startAt,endAt:p.endAt??x.endAt,status:p.status==="registration"?"open":(p.status??x.status),publicVisible:p.publicVisible??x.publicVisible});if(p.startAt)x.date=new Date(p.startAt).toLocaleDateString("vi-VN");persist();return clone(x)},
    deleteTournament:async id=>{const x=state.tournaments.find(v=>v.id===id);const dids=state.divisions.filter(d=>d.tournamentId===id).map(d=>d.id);const hasHistory=state.matches.some(m=>dids.includes(m.divisionId))||state.registrations.some(r=>dids.some(did=>state.divisions.find(d=>d.id===did)?.name===r.division_name));if(hasHistory){x.status="cancelled";x.publicVisible=false;persist();return {mode:"archived",entity:clone(x)}}state.tournaments=state.tournaments.filter(v=>v.id!==id);state.divisions=state.divisions.filter(d=>d.tournamentId!==id);persist();return {mode:"deleted"}},
    createDivision:async(tid,p)=>{validateSeriesRules(p);const d={id:uid(),tournamentId:tid,name:p.name,eventType:p.eventType,format:p.format,bestOf:p.bestOf,pointsToWin:p.pointsToWin,winByTwo:p.winByTwo,advanceCount:p.advanceCount,scoringMode:p.scoringMode||"side_out",minimumRestMinutes:p.minimumRestMinutes??15,matchSlotMinutes:p.matchSlotMinutes??20,relaySegmentPoints:Number(p.relaySegmentPoints||0),relayTeamSize:Number(p.relaySegmentPoints?(p.relayTeamSize||3):0),finalPointOnServe:Boolean(p.finalPointOnServe),thirdPlaceMatch:Boolean(p.thirdPlaceMatch),seriesBEnabled:Boolean(p.seriesBEnabled),seriesBThirdPlaceMatch:Boolean(p.seriesBThirdPlaceMatch),active:true};state.divisions.push(d);persist();return clone(d)},
    updateDivisionFull:async(id,p)=>{const d=state.divisions.find(x=>x.id===id);checkBracketSettings(d,p);validateSeriesRules({...d,...p});Object.assign(d,p);if(Number(d.relaySegmentPoints)>0){d.relayTeamSize=Number(d.relayTeamSize)||3;d.pointsToWin=d.relaySegmentPoints*d.relayTeamSize;d.bestOf=1}persist();return clone(d)},
    deleteDivision:async id=>{const d=state.divisions.find(x=>x.id===id);const used=state.matches.some(m=>m.divisionId===id)||state.teams.some(t=>t.divisionId===id);if(used){d.active=false;persist();return {mode:"archived",entity:clone(d)}}state.divisions=state.divisions.filter(x=>x.id!==id);persist();return {mode:"deleted"}},
    createCourt:async(tid,p)=>{const x={id:uid(),tournamentId:tid,name:p.name,sortOrder:state.courts.filter(c=>c.tournamentId===tid).length+1,active:true};state.courts.push(x);persist();return clone(x)},
    updateCourt:async(id,p)=>{Object.assign(state.courts.find(x=>x.id===id),p);persist();return {}},
    deleteCourt:async id=>{const x=state.courts.find(c=>c.id===id);const used=state.matches.some(m=>m.courtId===id)||state.bookings.some(b=>b.court_id===id);if(used){x.active=false;persist();return {mode:"archived",entity:clone(x)}}state.courts=state.courts.filter(c=>c.id!==id);persist();return {mode:"deleted"}},
    createTeam:async(did,p)=>{
      const division=state.divisions.find(d=>d.id===did);if(!division)throw new Error("NOT_FOUND");
      const playerIds=validatePreviewPlayerIds(division.eventType,p.playerIds);
      const selected=playerIds.map(id=>state.players.find(player=>player.id===id));
      if(selected.some(player=>!player))throw new Error("PLAYER_NOT_FOUND");
      if(selected.some(player=>player.active===false))throw new Error("PLAYER_INACTIVE");
      const used=new Set(state.teams.filter(team=>team.divisionId===did&&team.status!=="withdrawn").flatMap(team=>state.teamPlayers[team.id]||[]));
      if(playerIds.some(id=>used.has(id)))throw new Error("PLAYER_ALREADY_IN_DIVISION");
      const id=uid();let club;
      if(p.clubId){club=state.clubs.find(c=>c.id===p.clubId&&c.active!==false);if(!club)throw new Error("INVALID_CLUB")}
      else if(p.club&&registryNameKey(p.club)!==registryNameKey("Tự do")){
        club=state.clubs.find(c=>c.active!==false&&registryNameKey(c.name)===registryNameKey(p.club));
        if(!club){club={id:uid(),name:String(p.club).normalize("NFC").trim(),active:true,city:""};state.clubs.push(club)}
      }
      const t={id,divisionId:did,name:p.name,club:club?.name||"Tự do",clubId:club?.id||null,group:p.group||"A",seed:p.seed||null,status:"active",w:0,l:0,pf:0,pa:0};
      state.teams.push(t);state.teamPlayers[id]=[...playerIds];state.teamLineupSources||={};state.teamLineupSources[id]="assigned";persist();return clone({...t,playerIds});
    },
    updateTeam:async(id,p)=>{
      const t=state.teams.find(x=>x.id===id);if(!t)throw new Error("NOT_FOUND");
      const division=state.divisions.find(d=>d.id===t.divisionId),oldIds=state.teamPlayers[id]||[],status=p.status??t.status;
      if(!["active","withdrawn"].includes(status))throw new Error("INVALID_TEAM_STATUS");
      const ids=p.playerIds===undefined?oldIds:validatePreviewPlayerIds(division.eventType,p.playerIds);
      const changed=ids.length!==oldIds.length||ids.some((playerId,index)=>playerId!==oldIds[index]);
      if(changed&&state.matches.some(m=>(m.a===id||m.b===id)&&relayStarted(m)))throw new Error("TEAM_ROSTER_LOCKED");
      if(changed||(t.status==='withdrawn'&&status==='active')){
        validatePreviewPlayerIds(division.eventType,ids);
        const selected=ids.map(playerId=>state.players.find(player=>player.id===playerId));
        if(selected.some(player=>!player))throw new Error("PLAYER_NOT_FOUND");
        if(selected.some(player=>player.active===false||player.active===0))throw new Error("PLAYER_INACTIVE");
        const used=new Set(state.teams.filter(team=>team.id!==id&&team.divisionId===t.divisionId&&team.status!=="withdrawn").flatMap(team=>state.teamPlayers[team.id]||[]));
        if(ids.some(playerId=>used.has(playerId)))throw new Error("PLAYER_ALREADY_IN_DIVISION");
      }
      const club=state.clubs.find(c=>c.id===p.clubId);
      if(p.clubId&&p.clubId!==t.clubId&&(!club||club.active===false||club.active===0))throw new Error("INVALID_CLUB");
      const before=clone({...t,playerIds:oldIds});
      Object.assign(t,{name:p.name??t.name,clubId:p.clubId===undefined?t.clubId:(p.clubId||null),club:p.clubId===undefined?t.club:(club?.name||(p.clubId===t.clubId?t.club:"Tự do")),group:p.group??t.group,seed:p.seed??t.seed,status});
      if(changed){state.teamPlayers[id]=[...ids];state.teamLineupSources||={};state.teamLineupSources[id]="assigned";state.matches.filter(m=>m.a===id||m.b===id).forEach(clearRelay)}
      state.audit.unshift({time:new Date().toLocaleTimeString("vi-VN"),user:"Preview Admin",action:"UPDATE_TEAM",detail:t.name,beforeData:before,afterData:clone({...t,playerIds:ids})});
      persist();return clone({...t,playerIds:ids});
    },
    deleteTeam:async id=>{const t=state.teams.find(x=>x.id===id);const used=state.matches.some(m=>m.a===id||m.b===id)||state.registrations.some(r=>r.team_name===t?.name);if(used){t.status="withdrawn";persist();return {mode:"withdrawn",entity:clone(t)}}state.teams=state.teams.filter(x=>x.id!==id);delete state.teamPlayers[id];persist();return {mode:"deleted"}},
    updateDivision:async(id,p)=>{const d=state.divisions.find(x=>x.id===id);checkBracketSettings(d,p);validateSeriesRules({...d,...p});Object.assign(d,p);persist();return {}},
    drawConfig:async id=>{const d=state.divisions.find(x=>x.id===id);if(!d)throw new Error("NOT_FOUND");return clone({...d.drawConfig,advanceCount:d.advanceCount||2,seriesBEnabled:Boolean(d.seriesBEnabled),seriesBThirdPlaceMatch:Boolean(d.seriesBThirdPlaceMatch)})},
    saveDrawConfig:async(id,p)=>{const d=state.divisions.find(x=>x.id===id);if(!d)throw new Error("NOT_FOUND");checkBracketSettings(d,p);validateSeriesRules({...d,...p});if(!Number.isInteger(p.groupCount)||p.groupCount<1||p.groupCount>26||!Number.isInteger(p.teamsPerGroup)||p.teamsPerGroup<2||!Number.isInteger(p.advanceCount)||p.advanceCount<1)throw new Error("INVALID_DRAW_OPTIONS");if(!p.courtIds?.length)throw new Error("NO_COURTS");d.advanceCount=p.advanceCount;d.seriesBEnabled=Boolean(p.seriesBEnabled??d.seriesBEnabled);d.seriesBThirdPlaceMatch=Boolean(p.seriesBThirdPlaceMatch??d.seriesBThirdPlaceMatch);d.drawConfig=clone(p);persist();return clone(p)},
    runDraw:async(id,p)=>{
      const d=state.divisions.find(x=>x.id===id);if(!d)throw new Error("NOT_FOUND");
      if(state.matches.some(m=>m.divisionId===id&&(m.bracketSlot||["live","done","completed","walkover"].includes(m.status)||(m.sets||[]).length)))throw new Error("GROUP_STAGE_ALREADY_STARTED");
      validateSeriesRules({...d,...p});
      const teams=state.teams.filter(t=>t.divisionId===id&&t.status!=="withdrawn");
      const groups=Array.from({length:p.groupCount},(_,i)=>({group:String.fromCharCode(65+i),teams:[]}));
      const order=[...teams];if(p.mode==="seeded")order.sort((a,b)=>(a.seed||9999)-(b.seed||9999));else if(p.mode!=="manual")for(let i=order.length-1;i>0;i--){const n=new Uint32Array(1);crypto.getRandomValues(n);const j=n[0]%(i+1);[order[i],order[j]]=[order[j],order[i]]}
      for(let i=0;i<order.length;i++){const group=p.mode==="manual"?groups.find(g=>g.group===p.manualAssignments?.[order[i].id]):groups[i%groups.length];if(!group)throw new Error("MANUAL_GROUP_ASSIGNMENT_REQUIRED");group.teams.push(order[i])}
      if(groups.some(g=>g.teams.length<2))throw new Error("GROUP_TOO_SMALL");if(groups.some(g=>g.teams.length>p.teamsPerGroup))throw new Error("GROUP_CAPACITY_EXCEEDED");if(groups.some(g=>g.teams.length<p.advanceCount))throw new Error("ADVANCE_COUNT_TOO_HIGH");if((p.seriesBEnabled??d.seriesBEnabled)&&groups.some(g=>g.teams.length<3))throw new Error("NOT_ENOUGH_SERIES_B_QUALIFIERS");
      await window.PickleAPI.saveDrawConfig(id,p);state.matches=state.matches.filter(m=>m.divisionId!==id);let created=0;
      for(const g of groups){for(const t of g.teams)t.group=g.group;for(let i=0;i<g.teams.length;i++)for(let j=i+1;j<g.teams.length;j++){const allowed=p.groupCourts?.[g.group]?.length?p.groupCourts[g.group]:p.courtIds,court=state.courts.find(c=>c.id===allowed[created%allowed.length]);state.matches.push({id:uid(),divisionId:id,stage:"Bảng "+g.group,a:g.teams[i].id,b:g.teams[j].id,courtId:court?.id||null,court:court?.sortOrder||1,time:"--:--",status:"wait",sets:[],current:[0,0],winner:null,version:1,bracketSlot:null,bracketSeries:null});created++}}
      persist();return {groupCount:groups.length,created,advanceCount:d.advanceCount,seriesBEnabled:Boolean(d.seriesBEnabled),seriesBThirdPlaceMatch:Boolean(d.seriesBThirdPlaceMatch),groups:groups.map(g=>({group:g.group,count:g.teams.length}))};
    },
    createMatch:async(did,p)=>{const court=state.courts.find(c=>c.id===p.courtId);const m={id:uid(),divisionId:did,stage:p.stage||"Vòng bảng",court:court?.sortOrder||court?.name||"—",courtId:p.courtId||null,time:p.scheduledAt?new Date(p.scheduledAt).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}):"—",a:p.teamAId,b:p.teamBId,status:"wait",sets:[],current:[0,0],winner:null,version:1,refereeId:p.refereeUserId||null};state.matches.push(m);persist();return clone(m)},
    autoSeedGroups:async(did,groupCount)=>{
      groupCount=Math.max(1,Math.min(26,Number(groupCount)||1));
      const teams=state.teams.filter(t=>t.divisionId===did&&t.status!=="withdrawn").map(t=>{
        const ps=(state.teamPlayers[t.id]||[]).map(id=>state.players.find(p=>p.id===id)).filter(Boolean);
        return {...t,avg:ps.length?ps.reduce((a,p)=>a+Number(p.rating||0),0)/ps.length:0};
      }).sort((a,b)=>b.avg-a.avg||(a.seed||999)-(b.seed||999));
      if(!teams.length)throw new Error("NO_TEAMS");
      if(teams.length<groupCount)throw new Error("MORE_GROUPS_THAN_TEAMS");
      const groups=Array.from({length:groupCount},(_,i)=>({label:String.fromCharCode(65+i),teams:[]}));
      const rnd=max=>{
        if(max<=1)return 0;
        if(globalThis.crypto?.getRandomValues){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%max}
        return Math.floor(Math.random()*max);
      };
      const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
      for(let p=0;p<teams.length;p+=groupCount){
        const pot=shuffle(teams.slice(p,p+groupCount));
        for(const t of pot){
          const minSize=Math.min(...groups.map(g=>g.teams.length));
          const candidates=groups.filter(g=>g.teams.length<=minSize+1).sort((a,b)=>{
            const ac=t.clubId&&a.teams.some(x=>x.clubId===t.clubId)?1:0;
            const bc=t.clubId&&b.teams.some(x=>x.clubId===t.clubId)?1:0;
            return ac-bc||a.teams.length-b.teams.length||(rnd(3)-1);
          });
          const g=candidates[0]||groups[0];
          g.teams.push(t);
          const real=state.teams.find(x=>x.id===t.id);real.group=g.label;
        }
      }
      let seed=1;
      for(const g of groups)for(const t of g.teams){const real=state.teams.find(x=>x.id===t.id);real.seed=seed++}
      persist();return {groupCount,assignments:clone(groups)}
    },
    generateRoundRobin:async did=>{const teams=state.teams.filter(t=>t.divisionId===did&&t.status!=="withdrawn");const groups=[...new Set(teams.map(t=>t.group).filter(Boolean))];let created=0;for(const g of groups){const arr=teams.filter(t=>t.group===g);for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){if(state.matches.some(m=>m.divisionId===did&&((m.a===arr[i].id&&m.b===arr[j].id)||(m.a===arr[j].id&&m.b===arr[i].id))))continue;const court=state.courts[created%Math.max(1,state.courts.length)];state.matches.push({id:uid(),divisionId:did,stage:"Bảng "+g,court:court?.sortOrder||1,courtId:court?.id||null,time:"--:--",a:arr[i].id,b:arr[j].id,status:"wait",sets:[],current:[0,0],winner:null,version:1,bracketSlot:null});created++}}persist();return {created}},
    knockoutResetPreview:async id=>{const matches=state.matches.filter(m=>m.divisionId===id&&m.bracketSlot);return {divisionName:state.divisions.find(d=>d.id===id)?.name,token:JSON.stringify(matches),summary:{matchCount:matches.length,blocked:matches.some(m=>knockoutStarted(m))}}},
    resetKnockout:async(id,p)=>{const matches=state.matches.filter(m=>m.divisionId===id&&m.bracketSlot);if(p.confirmation!=='DAT LAI')throw new Error('DRAW_RESET_CONFIRMATION_REQUIRED');if(p.expectedToken!==JSON.stringify(matches))throw new Error('DRAW_RESET_CONFLICT');if(matches.some(m=>knockoutStarted(m)))throw new Error('BRACKET_ALREADY_STARTED');if(!matches.length)throw new Error('DRAW_ALREADY_EMPTY');state.matches=state.matches.filter(m=>m.divisionId!==id||!m.bracketSlot);state.audit.unshift({action:'RESET_KNOCKOUT',beforeData:clone(matches)});persist();return {ok:true,removedMatches:matches.length}},
    generateBracket:async did=>{
      const d=state.divisions.find(x=>x.id===did);if(!d)throw new Error("NOT_FOUND");
      validateSeriesRules(d);
      const existingBracket=state.matches.filter(m=>m.divisionId===did&&m.bracketSlot);if(existingBracket.length)throw new Error("BRACKET_ALREADY_EXISTS");
      const teams=knockoutTeamsFor(did);
      const bTeams=d.seriesBEnabled?knockoutTeamsFor(did,"B"):[];
      if(teams.length<2)throw new Error("NOT_ENOUGH_QUALIFIERS");
      if(d.format==="round_robin")throw new Error("ROUND_ROBIN_HAS_NO_KNOCKOUT");
      if(d.format==="double_elimination"&&![4,8].includes(teams.length))throw new Error("DOUBLE_ELIM_SUPPORTS_4_OR_8_TEAMS");
      const add=(stage,slot,a=null,b=null)=>{
        const m={id:uid(),divisionId:did,stage,bracketSlot:slot,bracketSeries:slot.startsWith("B-")?"B":"A",court:1,courtId:state.courts[0]?.id||null,time:"--:--",a:a?.id||a||"TBD",b:b?.id||b||"TBD",status:"wait",sets:[],current:[0,0],winner:null,version:1};
        state.matches.push(m);return m;
      };
      if(d.format==="double_elimination"){
        const order=teams.length===4?[teams[0],teams[3],teams[1],teams[2]]:[teams[0],teams[7],teams[3],teams[4],teams[1],teams[6],teams[2],teams[5]];
        if(teams.length===4){
          add("Nhánh thắng - Vòng 1","DE-W-R1-M1",order[0],order[1]);add("Nhánh thắng - Vòng 1","DE-W-R1-M2",order[2],order[3]);add("Nhánh thắng - Chung kết","DE-W-F");add("Nhánh thua - Vòng 1","DE-L-R1-M1");add("Nhánh thua - Chung kết","DE-L-F");add("Chung kết tổng","DE-GF");persist();return {format:"double_elimination",created:6,qualifiers:clone(teams)}
        }
        for(let i=0;i<4;i++)add("Nhánh thắng - Tứ kết","DE-W-QF-M"+(i+1),order[i*2],order[i*2+1]);
        add("Nhánh thắng - Bán kết 1","DE-W-SF-M1");add("Nhánh thắng - Bán kết 2","DE-W-SF-M2");add("Nhánh thắng - Chung kết","DE-W-F");add("Nhánh thua - Vòng 1","DE-L-R1-M1");add("Nhánh thua - Vòng 1","DE-L-R1-M2");add("Nhánh thua - Vòng 2","DE-L-R2-M1");add("Nhánh thua - Vòng 2","DE-L-R2-M2");add("Nhánh thua - Bán kết","DE-L-SF");add("Nhánh thua - Chung kết","DE-L-F");add("Chung kết tổng","DE-GF");persist();return {format:"double_elimination",created:14,qualifiers:clone(teams)}
      }
      const makeBranch=(teams,prefix,withThird)=>{
      let size=2;while(size<teams.length)size*=2;
      let order=[1,2];for(let n=4;n<=size;n*=2){const next=[];for(const seed of order)next.push(seed,n+1-seed);order=next}
      const slots=order.map(n=>teams[n-1]||null),rounds=Math.log2(size);let created=0;
      for(let r=0;r<rounds;r++){
        const count=size/(2**(r+1));
        for(let i=0;i<count;i++){
          const a=r===0?slots[i*2]:null,b=r===0?slots[i*2+1]:null;
          const m=add(count===1?"Chung kết":count===2?"Bán kết "+(i+1):count===4?"Tứ kết "+(i+1):"Knockout R"+(r+1)+" - Trận "+(i+1),prefix+"SE-R"+(r+1)+"-M"+(i+1),a,b);
          if(r===0&&((a&&!b)||(!a&&b))){m.status="done";m.winner=(a||b).id;m.resultReason="bye"}
          created++;
        }
      }
      const semis=rounds>=2?state.matches.filter(m=>m.divisionId===did&&m.bracketSlot&&m.bracketSlot.startsWith(`${prefix}SE-R${rounds-1}-`)):[];
      const thirdPlace=Boolean(withThird)&&semis.length===2&&!semis.some(m=>m.resultReason==="bye");
      if(thirdPlace){add("Tranh hạng ba",prefix+"SE-3RD-M1");created++}
      return {bracketSize:size,created,qualifiers:clone(teams),thirdPlaceMatch:thirdPlace};
      };
      const seriesA=makeBranch(teams,"",d.thirdPlaceMatch),seriesB=d.seriesBEnabled?makeBranch(bTeams,"B-",d.seriesBThirdPlaceMatch):null;
      progressSingleElim(did);persist();return {format:d.format,...seriesA,created:seriesA.created+(seriesB?.created||0),qualifiers:clone([...teams,...bTeams]),seriesBEnabled:Boolean(d.seriesBEnabled),seriesA,seriesB}
    },

    assignMatch:async(id,p)=>{const m=state.matches.find(x=>x.id===id);if(p.courtId!==undefined){const ct=p.courtId?state.courts.find(x=>x.id===p.courtId):null;m.courtId=p.courtId||null;m.court=ct?.sortOrder||ct?.name||"—"}if(p.refereeUserId!==undefined)m.refereeId=p.refereeUserId||null;if(p.scheduledAt!==undefined)m.time=p.scheduledAt?new Date(p.scheduledAt).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}):"—";m.version++;persist();return clone(m)},
    updateMatch:async(id,p)=>{const m=state.matches.find(x=>x.id===id);if(p.expectedVersion!==undefined&&p.expectedVersion!==m.version)throw new Error("VERSION_CONFLICT");const a=p.teamAId??p.a??m.a,b=p.teamBId??p.b??m.b;if(a!==m.a||b!==m.b){if(relayStarted(m))throw new Error("MATCH_ROSTER_LOCKED");clearRelay(m)}Object.assign(m,p,{a,b});if(p.scheduledAt)m.time=new Date(p.scheduledAt).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"});m.version++;persist();return clone(m)},
    deleteMatch:async id=>{const m=state.matches.find(x=>x.id===id);if(m.status==="done")throw Object.assign(new Error("COMPLETED_MATCH_LOCKED"),{status:409});if(m.status==="wait"&&!m.sets.length&&!(m.current?.[0]||m.current?.[1])){state.matches=state.matches.filter(x=>x.id!==id);persist();return {mode:"deleted"}}m.status="cancelled";persist();return {mode:"cancelled",entity:clone(m)}},
    relayDraw:async(id,p={})=>{const m=state.matches.find(x=>x.id===id);if(!m)throw new Error("NOT_FOUND");if(p.expectedVersion!==m.version)throw new Error("VERSION_CONFLICT");if(!relaySupported(m))throw new Error("RELAY_DRAW_UNSUPPORTED");if(relayStarted(m))throw new Error("RELAY_DRAW_LOCKED");if(!m.a||!m.b||m.a==="TBD"||m.b==="TBD")throw new Error("MATCH_TEAMS_REQUIRED");m.relayOrderA=shuffledRelay();m.relayOrderB=[...m.relayOrderA];m.relayDrawnAt=new Date().toISOString();m.version++;state.audit.unshift({time:m.relayDrawnAt,user:"Preview Admin",action:"RELAY_DRAW",detail:m.id,afterData:clone(m)});persist();return clone(m)},
    resetMatch:async(id,p={})=>{const m=state.matches.find(x=>x.id===id);if(p.expectedVersion!==undefined&&p.expectedVersion!==m.version)throw new Error("VERSION_CONFLICT");m.hasHistory=relayStarted(m);m.current=[0,0];m.sets=[];m.winner=null;m.resultReason=null;m.status="wait";m.version++;persist();return clone(m)},
    point:async(id,p)=>{const m=state.matches.find(x=>x.id===id),i=p.side==="A"?0:1;checkScore(m,p);m.current[i]=Math.max(0,m.current[i]+Number(p.delta));m.startedAt||=new Date().toISOString();m.status="live";m.version++;persist();return clone(m)},
    rally:async(id,p)=>{const m=state.matches.find(x=>x.id===id);checkScore(m,p);const d=state.divisions.find(x=>x.id===m.divisionId),side=p.side,index=side==="A"?0:1,serve=m.servingSide||"A";if(d?.scoringMode==="rally"||side===serve){if(!(d?.finalPointOnServe&&m.current[index]===Number(d.pointsToWin)-1&&side!==serve))m.current[index]++}else if(Number(m.serverNumber||2)===1)m.serverNumber=2;else{m.servingSide=side;m.serverNumber=1}if(d?.scoringMode==="rally"){m.servingSide=side;m.serverNumber=1}m.startedAt||=new Date().toISOString();m.status="live";m.version++;persist();return clone(m)},
    service:async(id,p)=>{const m=state.matches.find(x=>x.id===id);checkScore(m,p);m.servingSide=p.side;m.serverNumber=Number(p.serverNumber);m.hasHistory=true;m.version++;persist();return clone(m)},
    timeout:async(id,p)=>{const m=state.matches.find(x=>x.id===id);checkScore(m,p);const key=p.kind==="medical"?"medicalTimeouts":"timeouts";m[key]||={A:0,B:0};m[key][p.side]++;m.hasHistory=true;m.version++;persist();return clone(m)},
    setCourtState:async(id,p)=>{const m=state.matches.find(x=>x.id===id);if(p.expectedVersion!==m.version)throw new Error("VERSION_CONFLICT");m.courtState=p.courtState;m.version++;persist();return clone(m)},
    finishSet:async id=>{const m=state.matches.find(x=>x.id===id);checkScore(m);m.startedAt||=new Date().toISOString();m.sets.push([...m.current]);m.current=[0,0];m.version++;persist();return clone(m)},
    finishMatch:async id=>{const m=state.matches.find(x=>x.id===id);checkScore(m);if(m.current?.some(Number)){m.sets.push([...m.current]);m.current=[0,0]}const aw=m.sets.filter(s=>s[0]>s[1]).length,bw=m.sets.filter(s=>s[1]>s[0]).length;m.winner=aw>=bw?m.a:m.b;m.status="done";m.version++;progressSingleElim(m.divisionId);persist();return clone(m)},
    quickScore:async(id,p)=>{const m=state.matches.find(x=>x.id===id);checkScore(m,p);m.startedAt||=new Date().toISOString();const rawSets=Array.isArray(p.sets)?p.sets:[];m.sets=rawSets.map(s=>[Number(s[0]||0),Number(s[1]||0)]).filter(([a,b])=>a>0||b>0);m.current=[0,0];let aw=0,bw=0;m.sets.forEach(([a,b])=>{if(a>b)aw++;else if(b>a)bw++});m.winner=aw>=bw?m.a:m.b;m.status="done";m.version++;progressSingleElim(m.divisionId);persist();return clone(m)},
    specialResult:async(id,p)=>{const m=state.matches.find(x=>x.id===id);m.winner=p.winnerTeamId;m.status="done";m.resultReason=p.reason;m.resultNote=p.note||"";m.version++;progressSingleElim(m.divisionId);persist();return clone(m)},
    undo:async id=>{const m=state.matches.find(x=>x.id===id);if(m.current[0]||m.current[1]){if(m.current[0]>=m.current[1]&&m.current[0]>0)m.current[0]--;else if(m.current[1]>0)m.current[1]--}m.version++;persist();return clone(m)},
    referees:async()=>clone(state.referees),
    createReferee:async p=>{
      if(!p.password||String(p.password).length<12)throw new Error("PASSWORD_TOO_SHORT");
      const login=String(p.username??p.email??"").trim().toLowerCase();
      if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(login)&&!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)&&login.length<=254))throw new Error("INVALID_USERNAME");
      if(state.referees.some(r=>String(r.email).toLowerCase()===login))throw new Error("EMAIL_EXISTS");
      const r={id:uid(),email:login,username:login.includes('@')?null:login,display_name:p.name,active:true,tournament_id_scope:p.tournamentId||null,password:String(p.password)};
      state.referees.push(r);persist();return clone(r);
    },
    updateReferee:async(id,p)=>{
      const r=state.referees.find(x=>x.id===id);if(!r)throw new Error("NOT_FOUND");
      const login=String(p.username??p.email??r.email).trim().toLowerCase();
      if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(login)&&!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)&&login.length<=254))throw new Error("INVALID_USERNAME");
      if(state.referees.some(x=>x.id!==id&&String(x.email).toLowerCase()===login))throw new Error("EMAIL_EXISTS");
      Object.assign(r,{display_name:p.name??r.display_name,email:login,username:login.includes('@')?null:login,active:p.active??r.active,...(p.password?{password:String(p.password)}:{})});persist();return clone(r);
    },
    registrations:async()=>clone(state.registrations),
    createRegistration:async(did,p)=>{
      const d=state.divisions.find(x=>x.id===did),t=state.tournaments.find(x=>x.id===d?.tournamentId),team=state.teams.find(x=>x.id===p.teamId&&x.divisionId===did&&x.status!=="withdrawn");
      if(!d||!team)throw new Error("TEAM_DIVISION_MISMATCH");
      const ids=validatePreviewPlayerIds(d.eventType,state.teamPlayers[team.id]||[]);
      const players=ids.map(id=>state.players.find(x=>x.id===id));
      if(players.some(x=>!x))throw new Error("PLAYER_NOT_FOUND");
      if(players.some(x=>x.active===false))throw new Error("PLAYER_INACTIVE");
      if(state.registrations.some(r=>r.division_id===did&&r.team_id===team.id&&r.status!=="cancelled"))throw new Error("REGISTRATION_EXISTS");
      const r={id:uid(),team_id:team.id,division_id:did,status:"approved",payment_status:"unpaid",amount:p.amount||null,team_name:team.name,division_name:d.name,tournament_name:t?.name||"",checked_in_at:null,payment_id:null,payment_review_status:null};
      state.registrations.push(r);persist();return clone(r)
    },
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
    clubEvents:async()=>clone(state.clubEvents.map(e=>{const a=state.clubAttendance[e.id]||[];return {...e,club_name:state.clubs.find(c=>c.id===e.club_id)?.name||"",participants:a.filter(x=>x.status!=="cancelled").length,attended:a.filter(x=>x.status==="attended").length}}).sort((a,b)=>new Date(a.start_at)-new Date(b.start_at))),
    createClubEvent:async p=>{const x={id:uid(),club_id:p.clubId,title:p.title,event_type:p.eventType||"social",venue:p.venue||"",start_at:p.startAt,end_at:p.endAt||null,max_participants:p.maxParticipants||null,fee:Number(p.fee)||0,status:"scheduled"};state.clubEvents.push(x);state.clubAttendance[x.id]=[];persist();return clone(x)},
    updateClubEvent:async(id,p)=>{const x=state.clubEvents.find(v=>v.id===id);Object.assign(x,{title:p.title??x.title,event_type:p.eventType??x.event_type,venue:p.venue??x.venue,start_at:p.startAt??x.start_at,end_at:p.endAt===undefined?x.end_at:p.endAt,max_participants:p.maxParticipants??x.max_participants,fee:p.fee??x.fee,status:p.status??x.status});persist();return clone(x)},
    deleteClubEvent:async id=>{const x=state.clubEvents.find(v=>v.id===id);x.status="cancelled";persist();return {mode:"cancelled",entity:clone(x)}},
    clubAttendance:async eventId=>clone((state.clubAttendance[eventId]||[]).map(a=>{const p=state.players.find(x=>x.id===a.player_id)||{};return {...a,full_name:p.full_name||"",nickname:p.nickname||"",avatar_url:p.avatar_url||null,rating:p.rating||0}})),
    addClubAttendance:async(eventId,playerId)=>{const arr=state.clubAttendance[eventId]||(state.clubAttendance[eventId]=[]);let x=arr.find(v=>v.player_id===playerId);if(x){x.status="registered";x.checked_in_at=null}else{x={event_id:eventId,player_id:playerId,status:"registered",checked_in_at:null};arr.push(x)}persist();return clone(x)},
    updateClubAttendance:async(eventId,playerId,status)=>{const x=(state.clubAttendance[eventId]||[]).find(v=>v.player_id===playerId);if(!x)throw new Error("NOT_FOUND");x.status=status;x.checked_in_at=status==="attended"?new Date().toISOString():null;persist();return clone(x)},
    clubTransactions:async()=>clone(state.clubTransactions.map(x=>({...x,club_name:state.clubs.find(c=>c.id===x.club_id)?.name||"",created_by_name:"Quản trị viên"})).sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at))),
    createClubTransaction:async p=>{const x={id:uid(),club_id:p.clubId,direction:p.direction,category:p.category||"other",amount:Number(p.amount)||0,note:p.note||"",occurred_at:p.occurredAt||new Date().toISOString(),created_by_name:"Quản trị viên"};state.clubTransactions.unshift(x);persist();return clone(x)},
    bookings:async()=>clone(state.bookings),createBooking:async p=>{const court=state.courts.find(c=>c.id===p.courtId),tournament=state.tournaments.find(t=>t.id===court?.tournamentId);const x={id:uid(),court_id:p.courtId,court_name:court?.name||"Sân",tournament_name:tournament?.name||"",title:p.title,contact_name:p.contactName,contact_phone:p.contactPhone,start_at:p.startAt,end_at:p.endAt,status:"confirmed",notes:p.notes};state.bookings.unshift(x);persist();return clone(x)},updateBooking:async(id,p)=>{Object.assign(state.bookings.find(x=>x.id===id),p);persist();return {}},deleteBooking:async id=>{const x=state.bookings.find(v=>v.id===id);x.status="cancelled";persist();return {mode:"cancelled",entity:clone(x)}},
    reportOverview:async()=>{const income=state.clubTransactions.filter(x=>x.direction==="income").reduce((a,x)=>a+Number(x.amount||0),0),expense=state.clubTransactions.filter(x=>x.direction==="expense").reduce((a,x)=>a+Number(x.amount||0),0),today=new Date().toDateString();return {players:state.players.filter(p=>p.active!==false).length,members:state.players.filter(p=>p.active!==false).length,registrations:state.registrations.length,checked_in:state.registrations.filter(r=>r.checked_in_at).length,paid_count:state.registrations.filter(r=>r.payment_status==="paid").length,revenue:state.registrations.filter(r=>r.payment_status==="paid").reduce((a,r)=>a+Number(r.amount||0),0),matches:state.matches.length,live:state.matches.filter(m=>m.status==="live").length,completed:state.matches.filter(m=>m.status==="done").length,attendanceToday:Object.values(state.clubAttendance).flat().filter(a=>a.status==="attended"&&a.checked_in_at&&new Date(a.checked_in_at).toDateString()===today).length,upcomingActivities:state.clubEvents.filter(e=>e.status!=="cancelled"&&new Date(e.start_at)>=new Date()).length,clubIncome:income,clubExpense:expense,clubBalance:income-expense}},
    addTeamPlayer:async(teamId,playerId)=>{
      const team=state.teams.find(t=>t.id===teamId),player=state.players.find(p=>p.id===playerId);if(!team||!player)throw new Error("PLAYER_NOT_FOUND");
      if(player.active===false)throw new Error("PLAYER_INACTIVE");
      const arr=state.teamPlayers[teamId]||(state.teamPlayers[teamId]=[]);if(arr.includes(playerId))return {ok:true};
      if(state.matches.some(m=>(m.a===teamId||m.b===teamId)&&relayStarted(m)))throw new Error("TEAM_ROSTER_LOCKED");
      const division=state.divisions.find(d=>d.id===team.divisionId);
      const used=state.teams.filter(t=>t.divisionId===team.divisionId&&t.id!==teamId&&t.status!=="withdrawn").some(t=>(state.teamPlayers[t.id]||[]).includes(playerId));
      if(used)throw new Error("PLAYER_ALREADY_IN_DIVISION");
      if(arr.length>=playerCountRange(division?.eventType).max)throw new Error("INVALID_PLAYER_COUNT");
      arr.push(playerId);state.matches.filter(m=>m.a===teamId||m.b===teamId).forEach(clearRelay);persist();return {ok:true};
    }
  };
  window.PickleAPI=api;
  window.io=()=>({on:(event,cb)=>window.addEventListener("pickle-preview-update",e=>{if(event==="public:state"||event==="match:update")cb(clone(e.detail))})});
  window.addEventListener("storage",e=>{if(e.key===KEY&&e.newValue){state=JSON.parse(e.newValue);window.dispatchEvent(new CustomEvent("pickle-preview-update",{detail:clone(state)}))}});
})();
