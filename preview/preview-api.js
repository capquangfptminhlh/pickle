(()=>{
  const KEY="pickle-local-state-v1";
  const uid=()=>crypto.randomUUID?.()||("id-"+Date.now()+"-"+Math.random().toString(16).slice(2));
  const clone=x=>JSON.parse(JSON.stringify(x));
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

  if(typeof window!=="undefined"&&window.ZALO_CRAWLED_TOURNAMENTS?.length){
    state.tournaments||=[];
    const validZaloIds = new Set(window.ZALO_CRAWLED_TOURNAMENTS.map(t=>t.id));
    const todayStr = "2026-09-30";
    const initialLen = state.tournaments.length;
    // Purge any outdated or removed zalo tournaments from local cache
    state.tournaments = state.tournaments.filter(t => {
      if(t.source === "zalo_crm"){
        if(!validZaloIds.has(t.id)) return false;
        if(t.startAt && t.startAt < todayStr) return false;
      }
      return true;
    });
    let tourChanged = (state.tournaments.length !== initialLen);

    const existingTourNames=new Set(state.tournaments.map(t=>(t.name||"").toLowerCase().trim()));
    const pickleTours=window.ZALO_CRAWLED_TOURNAMENTS.filter(t=>t.sport==="pickleball");
    for(const zt of pickleTours.slice(0, 10)){
      const norm=(zt.name||"").toLowerCase().trim();
      const existing = state.tournaments.find(t=>t.id===zt.id||(t.name||"").toLowerCase().trim()===norm);
      if(!existing){
        state.tournaments.push({
          id:zt.id,
          name:zt.name,
          date:zt.date,
          startAt:zt.startAt,
          endAt:zt.endAt,
          venue:zt.venue,
          format:zt.divisionName||"Open",
          status:zt.status||"open",
          publicVisible:true,
          teams:zt.teams||16,
          isFeatured:Boolean(zt.isFeatured),
          featuredRank:zt.featuredRank||50,
          sponsorPackage:zt.sponsorPackage||"free",
          source:"zalo_crm",
          coverUrl:zt.coverUrl||"",
          isBanner:Boolean(zt.isBanner),
          entryFee:zt.entryFee,
          prizePool:zt.prizePool,
          contactName:zt.contactName,
          contactPhone:zt.contactPhone
        });
        existingTourNames.add(norm);
        tourChanged=true;
      } else if(zt.coverUrl && !existing.coverUrl){
        existing.coverUrl = zt.coverUrl;
        existing.isBanner = Boolean(zt.isBanner);
        tourChanged=true;
      }
    }
    if(tourChanged){
      localStorage.setItem(KEY,JSON.stringify(state));
    }
  }
  const recomputeStats=()=>{
    const stats=new Map(state.teams.map(t=>[t.id,{w:0,l:0,sw:0,sl:0,pf:0,pa:0}]));
    const isGroupMatch=m=>!m.bracketSlot&&((m.stage&&m.stage.startsWith("Bảng"))||/bảng|group|vòng bảng/i.test(m.stage||"")||!/chung kết|bán kết|tứ kết/i.test(m.stage||""));
    for(const m of (state.matches||[]).filter(x=>(x.status==="done"||x.status==="completed")&&isGroupMatch(x)&&x.winner)){
      const ms=m.sets||[];let ap=0,bp=0,asw=0,bsw=0;
      const d=state.divisions.find(x=>x.id===m.divisionId);
      const isMlp=d?.eventType==="team"||d?.format==="minigame_mlp"||/mlp/i.test(d?.name||"")||/mlp/i.test(m.stage||"");
      if(isMlp&&ms.length){
        const last=ms[ms.length-1];
        ap=Number(last[0]||0);bp=Number(last[1]||0);
        asw=m.winner===m.a?1:0;bsw=m.winner===m.b?1:0;
      }else{
        for(const [a,b] of ms){
          ap+=Number(a||0);bp+=Number(b||0);
          if(Number(a)>Number(b))asw++;else if(Number(b)>Number(a))bsw++;
        }
      }
      const sa=stats.get(m.a),sb=stats.get(m.b);
      if(sa){sa.pf+=ap;sa.pa+=bp;sa.sw+=asw;sa.sl+=bsw;m.winner===m.a?sa.w++:sa.l++}
      if(sb){sb.pf+=bp;sb.pa+=ap;sb.sw+=bsw;sb.sl+=asw;m.winner===m.b?sb.w++:sb.l++}
    }
    state.teams.forEach(t=>{
      const s=stats.get(t.id)||{w:0,l:0,sw:0,sl:0,pf:0,pa:0};
      Object.assign(t,{...s,diffSet:s.sw-s.sl,diffPts:s.pf-s.pa});
    });
  };
  const rankGroupTeams=(teamList,gm)=>{
    const getH2H=(idA,idB)=>{
      const m=gm.find(x=>((x.a===idA&&x.b===idB)||(x.a===idB&&x.b===idA))&&x.winner);
      if(!m)return 0;
      return m.winner===idA?-1:1;
    };
    function resolveTied(subTeams){
      if(subTeams.length<=1)return subTeams;
      if(subTeams.length===2){
        const h2h=getH2H(subTeams[0].id,subTeams[1].id);
        if(h2h!==0)return h2h<0?[subTeams[0],subTeams[1]]:[subTeams[1],subTeams[0]];
        return [...subTeams].sort((a,b)=>
          ((b.sw||0)-(b.sl||0))-((a.sw||0)-(a.sl||0))||
          ((b.pf||0)-(b.pa||0))-((a.pf||0)-(a.pa||0))||
          (b.pf||0)-(a.pf||0)||
          (a.seed||999)-(b.seed||999)
        );
      }
      const setDiffs=new Set(subTeams.map(t=>(t.sw||0)-(t.sl||0)));
      if(setDiffs.size>1){
        const buckets=new Map();
        subTeams.forEach(t=>{
          const sd=(t.sw||0)-(t.sl||0);
          if(!buckets.has(sd))buckets.set(sd,[]);
          buckets.get(sd).push(t);
        });
        const sortedDiffs=[...buckets.keys()].sort((a,b)=>b-a);
        return sortedDiffs.flatMap(sd=>resolveTied(buckets.get(sd)));
      }
      const ptDiffs=new Map(subTeams.map(t=>[t.id,(t.pf||0)-(t.pa||0)]));
      const sortedByPt=[...subTeams].sort((a,b)=>(ptDiffs.get(b.id)-ptDiffs.get(a.id))||((b.pf||0)-(a.pf||0)));
      const topPd=ptDiffs.get(sortedByPt[0].id);
      const topTeams=sortedByPt.filter(t=>ptDiffs.get(t.id)===topPd);
      if(topTeams.length===1){
        const winner=topTeams[0];
        const remaining=subTeams.filter(t=>t.id!==winner.id);
        return [winner,...resolveTied(remaining)];
      }
      const minPd=ptDiffs.get(sortedByPt[sortedByPt.length-1].id);
      const bottomTeams=sortedByPt.filter(t=>ptDiffs.get(t.id)===minPd);
      if(bottomTeams.length===1&&subTeams.length>2){
        const loser=bottomTeams[0];
        const remaining=subTeams.filter(t=>t.id!==loser.id);
        return [...resolveTied(remaining),loser];
      }
      return [...subTeams].sort((a,b)=>{
        const pdA=(a.pf||0)-(a.pa||0),pdB=(b.pf||0)-(b.pa||0);
        if(pdB!==pdA)return pdB-pdA;
        const h2h=getH2H(a.id,b.id);
        if(h2h!==0)return h2h;
        return (b.pf||0)-(a.pf||0)||(a.seed||999)-(b.seed||999);
      });
    }

    const winBuckets=new Map();
    teamList.forEach(t=>{
      const w=t.w||0;
      if(!winBuckets.has(w))winBuckets.set(w,[]);
      winBuckets.get(w).push(t);
    });
    const sortedWins=[...winBuckets.keys()].sort((a,b)=>b-a);
    return sortedWins.flatMap(w=>resolveTied(winBuckets.get(w)));
  };
  const groupMatchesFor=(did,g)=>state.matches.filter(m=>m.divisionId===did&&!m.bracketSlot&&(m.stage==="Bảng "+g||(m.stage||"").includes("Bảng "+g)));
  const rankGroupFor=(did,g)=>{
    const gm=groupMatchesFor(did,g).filter(m=>(m.status==="done"||m.status==="completed")&&m.winner);
    const teams=state.teams.filter(t=>t.divisionId===did&&t.group===g&&t.status!=="withdrawn");
    return rankGroupTeams(teams,gm);
  };
  const rankCrossGroupTeams=(teamList)=>{
    return [...teamList].sort((a,b)=>{
      const gA=(a.w||0)+(a.l||0)||1, gB=(b.w||0)+(b.l||0)||1;
      const wrA=(a.w||0)/gA, wrB=(b.w||0)/gB;
      if(Math.abs(wrB-wrA)>0.0001)return wrB-wrA;
      if((b.w||0)!==(a.w||0))return (b.w||0)-(a.w||0);
      const sA=(a.sw||0)+(a.sl||0)||1, sB=(b.sw||0)+(b.sl||0)||1;
      const sdA=(a.sw||0)-(a.sl||0), sdB=(b.sw||0)-(b.sl||0);
      const srA=sdA/sA, srB=sdB/sB;
      if(Math.abs(srB-srA)>0.0001)return srB-srA;
      if(sdB!==sdA)return sdB-sdA;
      const pdA=(a.pf||0)-(a.pa||0), pdB=(b.pf||0)-(b.pa||0);
      const pdrA=pdA/gA, pdrB=pdB/gB;
      if(Math.abs(pdrB-pdrA)>0.0001)return pdrB-pdrA;
      if(pdB!==pdA)return pdB-pdA;
      const pfrA=(a.pf||0)/gA, pfrB=(b.pf||0)/gB;
      if(Math.abs(pfrB-pfrA)>0.0001)return pfrB-pfrA;
      if((b.pf||0)!==(a.pf||0))return (b.pf||0)-(a.pf||0);
      return (a.seed||999)-(b.seed||999);
    });
  };
  const knockoutTeamsFor=(did,series="A")=>{
    recomputeStats();
    const d=state.divisions.find(x=>x.id===did);
    const active=state.teams.filter(t=>t.divisionId===did&&t.status!=="withdrawn");
    const groups=[...new Set(active.map(t=>t.group).filter(Boolean))].sort();
    const gm=state.matches.filter(m=>m.divisionId===did&&!m.bracketSlot&&(m.stage||"").startsWith("Bảng "));
    if(groups.length&&gm.length){
      if(gm.some(m=>!(m.status==="done"||m.status==="completed")||!m.winner))throw new Error("GROUP_STAGE_NOT_COMPLETE");
      const firsts=[],seconds=[],thirds=[],others=[];
      for(const g of groups){
        const r=rankGroupFor(did,g);
        if(r[0])firsts.push({...r[0],qualifierGroup:g,qualifierPlace:1});
        if(r[1])seconds.push({...r[1],qualifierGroup:g,qualifierPlace:2});
        if(r[2])thirds.push({...r[2],qualifierGroup:g,qualifierPlace:3});
        for(let i=3;i<r.length;i++){
          others.push({...r[i],qualifierGroup:g,qualifierPlace:i+1});
        }
      }
      const sortedFirsts=rankCrossGroupTeams(firsts);
      const sortedSeconds=rankCrossGroupTeams(seconds);
      const sortedThirds=rankCrossGroupTeams(thirds);

      const baseCount=sortedFirsts.length+sortedSeconds.length;
      let targetSize=2;
      while(targetSize<baseCount)targetSize*=2;
      const allowBestThirds=Boolean(d?.allowBestThirds);
      const neededThirds=allowBestThirds?Math.max(0,targetSize-baseCount):0;
      const bestThirds=neededThirds>0?sortedThirds.slice(0,neededThirds).map(t=>({...t,isBestThird:true})):[];
      const remainingThirds=neededThirds>0?sortedThirds.slice(neededThirds):sortedThirds;

      const seriesAQualifiers=[...sortedFirsts,...sortedSeconds,...bestThirds];
      const seriesBTeams=rankCrossGroupTeams([...remainingThirds,...others]);

      if(series==="B")return seriesBTeams;
      return seriesAQualifiers;
    }
    return [...active].sort((a,b)=>(a.seed||999)-(b.seed||999));
  };
  const progressSingleElim=did=>{
    const ms=state.matches.filter(m=>m.divisionId===did&&(m.bracketSlot||"").startsWith("SE-"));
    if(!ms.length)return;
    let changed=true,guard=0;
    while(changed&&guard++<32){
      changed=false;
      for(const m of ms){
        const x=(m.bracketSlot||"").match(/^SE-(?:([AB])-)?R(\d+)-M(\d+)$/);
        if(!x||!(m.status==="done"||m.status==="completed")||!m.winner)continue;
        const pfx=x[1]?("SE-"+x[1]+"-"):"SE-";
        const round=Number(x[2]),num=Number(x[3]);
        const target=ms.find(n=>n.bracketSlot===`${pfx}R${round+1}-M${Math.ceil(num/2)}`);
        if(target){
          const side=num%2===1?"a":"b";
          if(target[side]!==m.winner){target[side]=m.winner;target.status="wait";target.version=(target.version||0)+1;changed=true}
        }
        const bronze=ms.find(n=>n.bracketSlot===`${pfx}BRONZE`);
        if(bronze){
          const isSemifinal=Boolean(target&&!ms.some(n=>n.bracketSlot===`${pfx}R${round+1}-M2`));
          if(isSemifinal){
            const loser=m.winner===m.a?m.b:m.a;
            const bSide=num===1?"a":"b";
            if(loser&&bronze[bSide]!==loser){bronze[bSide]=loser;bronze.status="wait";bronze.version=(bronze.version||0)+1;changed=true}
          }
        }
      }
    }
  };
  const progressDoubleElim=did=>{
    const ms=state.matches.filter(m=>m.divisionId===did&&(m.bracketSlot||"").startsWith("DE-"));
    if(!ms.length)return;
    let changed=true,guard=0;
    const isDone=m=>m&&(m.status==="done"||m.status==="completed")&&m.winner;
    const loserOf=m=>m.winner===m.a?m.b:m.a;
    const setSide=(target,side,teamId)=>{
      if(!target||!teamId||target[side]===teamId)return;
      target[side]=teamId;target.status="wait";target.version=(target.version||0)+1;changed=true;
    };
    while(changed&&guard++<32){
      changed=false;
      const bySlot=s=>ms.find(m=>m.bracketSlot===s);
      const wR1M1=bySlot("DE-W-R1-M1"),wR1M2=bySlot("DE-W-R1-M2");
      const wF=bySlot("DE-W-F"),lR1M1=bySlot("DE-L-R1-M1"),lF=bySlot("DE-L-F"),gf=bySlot("DE-GF");
      if(wR1M1&&wR1M2){
        if(isDone(wR1M1)){setSide(wF,"a",wR1M1.winner);setSide(lR1M1,"a",loserOf(wR1M1));}
        if(isDone(wR1M2)){setSide(wF,"b",wR1M2.winner);setSide(lR1M1,"b",loserOf(wR1M2));}
        if(isDone(lR1M1)){setSide(lF,"a",lR1M1.winner);}
        if(isDone(wF)){setSide(gf,"a",wF.winner);setSide(lF,"b",loserOf(wF));}
        if(isDone(lF)){setSide(gf,"b",lF.winner);}
      }
      const qf1=bySlot("DE-W-QF-M1"),qf2=bySlot("DE-W-QF-M2"),qf3=bySlot("DE-W-QF-M3"),qf4=bySlot("DE-W-QF-M4");
      const sf1=bySlot("DE-W-SF-M1"),sf2=bySlot("DE-W-SF-M2");
      const lr1m1=bySlot("DE-L-R1-M1"),lr1m2=bySlot("DE-L-R1-M2");
      const lr2m1=bySlot("DE-L-R2-M1"),lr2m2=bySlot("DE-L-R2-M2");
      const lsf=bySlot("DE-L-SF");
      if(qf1&&qf2&&qf3&&qf4){
        if(isDone(qf1)){setSide(sf1,"a",qf1.winner);setSide(lr1m1,"a",loserOf(qf1));}
        if(isDone(qf2)){setSide(sf1,"b",qf2.winner);setSide(lr1m1,"b",loserOf(qf2));}
        if(isDone(qf3)){setSide(sf2,"a",qf3.winner);setSide(lr1m2,"a",loserOf(qf3));}
        if(isDone(qf4)){setSide(sf2,"b",qf4.winner);setSide(lr1m2,"b",loserOf(qf4));}
        if(isDone(lr1m1)){setSide(lr2m1,"a",lr1m1.winner);}
        if(isDone(lr1m2)){setSide(lr2m2,"a",lr1m2.winner);}
        if(isDone(sf1)){setSide(wF,"a",sf1.winner);setSide(lr2m1,"b",loserOf(sf1));}
        if(isDone(sf2)){setSide(wF,"b",sf2.winner);setSide(lr2m2,"b",loserOf(sf2));}
        if(isDone(lr2m1)){setSide(lsf,"a",lr2m1.winner);}
        if(isDone(lr2m2)){setSide(lsf,"b",lr2m2.winner);}
        if(isDone(lsf)){setSide(lF,"a",lsf.winner);}
        if(isDone(wF)){setSide(gf,"a",wF.winner);setSide(lF,"b",loserOf(wF));}
        if(isDone(lF)){setSide(gf,"b",lF.winner);}
      }
    }
  };
  const arrangeKnockoutSlots=(teamList,size)=>{
    const getGroup=t=>t?.qualifierGroup||(typeof t==="string"?(t.match(/bảng\s+([A-Za-z0-9]+)/i)?.[1]||""):"");
    const getPlace=t=>t?.qualifierPlace||(typeof t==="string"?(/nhất/i.test(t)?1:(/nhì/i.test(t)?2:3)):1);
    const groups=[...new Set(teamList.map(getGroup).filter(Boolean))];
    if(groups.length<2){
      let order=[1,2];for(let n=4;n<=size;n*=2){const next=[];for(const seed of order)next.push(seed,n+1-seed);order=next}
      return order.map(n=>teamList[n-1]||null);
    }
    const firsts=teamList.filter(t=>getPlace(t)===1);
    const seconds=teamList.filter(t=>getPlace(t)===2);
    const groupOrder=[...groups].sort((a,b)=>{
      const idxA=firsts.findIndex(t=>getGroup(t)===a);
      const idxB=firsts.findIndex(t=>getGroup(t)===b);
      return (idxA===-1?999:idxA)-(idxB===-1?999:idxB);
    });
    const upperGroups=[],lowerGroups=[];
    groupOrder.forEach((g,idx)=>{
      if(idx%4===0||idx%4===3)upperGroups.push(g);
      else lowerGroups.push(g);
    });
    const upperFirsts=upperGroups.map(g=>firsts.find(t=>getGroup(t)===g)).filter(Boolean);
    const upperSeconds=lowerGroups.map(g=>seconds.find(t=>getGroup(t)===g)).filter(Boolean);
    const lowerFirsts=lowerGroups.map(g=>firsts.find(t=>getGroup(t)===g)).filter(Boolean);
    const lowerSeconds=upperGroups.map(g=>seconds.find(t=>getGroup(t)===g)).filter(Boolean);
    const halfMatchCount=size/4;
    const slots=new Array(size).fill(null);
    for(let i=0;i<halfMatchCount;i++){
      slots[i*2]=upperFirsts[i]||null;
      slots[i*2+1]=upperSeconds[upperSeconds.length-1-i]||upperSeconds[i]||null;
    }
    for(let i=0;i<halfMatchCount;i++){
      slots[size/2+i*2]=lowerFirsts[i]||null;
      slots[size/2+i*2+1]=lowerSeconds[lowerSeconds.length-1-i]||lowerSeconds[i]||null;
    }
    const assignedIds=new Set(slots.filter(Boolean).map(t=>t.id||t));
    const remaining=teamList.filter(t=>!assignedIds.has(t.id||t));
    for(const rem of remaining){
      const gRem=getGroup(rem);
      let target=-1;
      for(let s=0;s<size;s++){
        if(!slots[s]){
          const oppSlot=(s%2===0)?s+1:s-1;
          const opp=slots[oppSlot];
          if(!opp||getGroup(opp)!==gRem){target=s;break;}
        }
      }
      if(target===-1)target=slots.indexOf(null);
      if(target!==-1){slots[target]=rem;assignedIds.add(rem.id||rem);}
    }
    return slots;
  };
  const autoProgressGroupToKnockout=did=>{
    const d=state.divisions.find(x=>x.id===did);
    if(!d||d.format==="round_robin")return;
    const gm=state.matches.filter(m=>m.divisionId===did&&!m.bracketSlot&&(m.stage||"").startsWith("Bảng "));
    if(!gm.length)return;
    if(gm.every(m=>(m.status==="done"||m.status==="completed")&&m.winner)){
      const existingBracket=state.matches.filter(m=>m.divisionId===did&&m.bracketSlot);
      if(!existingBracket.length){
        try{api.generateBracket(did)}catch(e){}
      }else{
        try{
          const populate=(prefix,teamList)=>{
            if(!teamList||!teamList.length)return;
            let size=2;while(size<teamList.length)size*=2;
            const slots=arrangeKnockoutSlots(teamList,size);
            for(let i=0;i<size/2;i++){
              const bm=existingBracket.find(m=>m.bracketSlot===`${prefix}R1-M${i+1}`);
              if(bm&&bm.status==="wait"){
                const a=slots[i*2],b=slots[i*2+1];
                if(a&&(bm.a==="TBD"||!bm.a))bm.a=a.id;
                if(b&&(bm.b==="TBD"||!bm.b))bm.b=b.id;
                if((a&&!b)||(!a&&b)){
                  bm.status="done";
                  bm.winner=(a||b).id;
                  bm.resultReason="bye";
                  if(!a)bm.a=null;
                  if(!b)bm.b=null;
                }
              }
            }
          };
          const hasSeriesA=existingBracket.some(m=>(m.bracketSlot||"").startsWith("SE-A-"));
          const hasSeriesB=existingBracket.some(m=>(m.bracketSlot||"").startsWith("SE-B-"));
          if(hasSeriesA){
            populate("SE-A-",knockoutTeamsFor(did,"A"));
          }else{
            populate("SE-",knockoutTeamsFor(did,"A"));
          }
          if(hasSeriesB){
            populate("SE-B-",knockoutTeamsFor(did,"B"));
          }
          progressSingleElim(did);
          progressDoubleElim(did);
        }catch(e){}
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
          const ranked=rankGroupFor(d.id,g);
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
    publicState:async()=>{recomputeStats();evaluateTournamentRatings();return clone(state)},
    submitTournament:async(payload)=>{const isFeatured=payload.sponsorPackage==="top_sponsor"||payload.sponsorPackage==="highlight";const t={id:"tour-"+Date.now(),name:payload.name,date:payload.startAt?new Date(payload.startAt).toLocaleDateString("vi-VN"):"Sắp diễn ra",startAt:payload.startAt,endAt:payload.endAt,venue:payload.venue,format:payload.divisionName||"Open",status:"open",publicVisible:true,teams:0,isFeatured,featuredRank:payload.sponsorPackage==="top_sponsor"?100:50,sponsorPackage:payload.sponsorPackage||"free"};state.tournaments.unshift(t);persist();return {success:true,tournament:t};},
    adminState:async()=>{recomputeStats();evaluateTournamentRatings();const s=requireSession();if(s.user.role!=="referee")return clone(state);const matches=(state.matches||[]).filter(m=>m.refereeId===s.user.id);const dids=new Set(matches.map(m=>m.divisionId));const tids=new Set((state.divisions||[]).filter(d=>dids.has(d.id)).map(d=>d.tournamentId));const teamIds=new Set(matches.flatMap(m=>[m.a,m.b]).filter(Boolean));return clone({...state,tournaments:(state.tournaments||[]).filter(t=>tids.has(t.id)),divisions:(state.divisions||[]).filter(d=>dids.has(d.id)),courts:(state.courts||[]).filter(c=>tids.has(c.tournamentId)),teams:(state.teams||[]).filter(t=>teamIds.has(t.id)),matches,referees:[]})},
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
    players:async()=>{
      if(state.players&&state.players.length)return clone(state.players);
      if(typeof window!=="undefined"&&window.PICKLE_BINH_LOI_MEMBERS?.length){
        return window.PICKLE_BINH_LOI_MEMBERS.map((r,i)=>({
          id:r.zaloId?("zl-"+r.zaloId):("p-"+i),
          full_name:r.fullName||r.name,
          nickname:r.nickname||"",
          gender:r.gender||"male",
          avatar_url:r.avatarUrl||r.avatar_url||"",
          rating:Number(r.rating)||(r.gender==="female"?2.0:2.5),
          club_name:r.club||"CLB Pickleball Bình Lợi",
          active:true
        }));
      }
      return [];
    },clubs:async()=>clone(state.clubs),
    importPlayers:async rows=>{let created=0;const playerMap=new Map(state.players.map(x=>[x.full_name.toLowerCase(),x])),clubMap=new Map(state.clubs.map(c=>[c.name.toLowerCase(),c]));for(const r of rows){const name=String(r.fullName||r.name||"").trim();if(!name)continue;const avatar=String(r.avatarUrl||r.avatar_url||r.avatar||"").trim(),lName=name.toLowerCase();let p=playerMap.get(lName);if(p){if(avatar)p.avatar_url=avatar;created++;continue;}const cName=String(r.club||"").trim();let club=cName?clubMap.get(cName.toLowerCase()):null;if(!club&&cName){club={id:uid(),name:cName,city:"",active:true};state.clubs.push(club);clubMap.set(cName.toLowerCase(),club)}const newP={id:uid(),full_name:name,nickname:r.nickname||"",gender:["male","female","other"].includes(r.gender)?r.gender:null,rating:Number(r.rating)||3,phone:r.phone||"",club_id:club?.id||null,club_name:club?.name||"Tự do",active:true,avatar_url:avatar||svgAvatar(name)};state.players.push(newP);playerMap.set(lName,newP);created++}persist();return {created}},
    importTeams:async(did,rows)=>{let created=0,linkedPlayers=0;for(const r of rows){const name=String(r.name||"").trim();if(!name)continue;let club=state.clubs.find(c=>c.name.toLowerCase()===String(r.club||"").trim().toLowerCase());if(!club&&r.club){club={id:uid(),name:r.club,city:"",active:true};state.clubs.push(club)}const id=uid(),t={id,divisionId:did,name,club:club?.name||"Tự do",clubId:club?.id||null,group:r.group||"A",seed:Number(r.seed)||null,status:"active",w:0,l:0,pf:0,pa:0};state.teams.push(t);state.teamPlayers[id]=[];for(const pn of [r.player1,r.player2,r.player3,r.player4].filter(Boolean)){let p=state.players.find(x=>x.full_name.toLowerCase()===String(pn).trim().toLowerCase());if(!p){p={id:uid(),full_name:String(pn).trim(),nickname:"",gender:null,rating:3,club_id:club?.id||null,club_name:club?.name||"Tự do",active:true,avatar_url:svgAvatar(String(pn).trim())};state.players.push(p)}state.teamPlayers[id].push(p.id);linkedPlayers++}created++}persist();return {created,linkedPlayers}},
    uploadReceipt:async file=>({url:await fileData(file)}),
    uploadImage:async file=>({url:await fileData(file)}),
    uploadPlayerAvatar:async(id,file)=>{const x=state.players.find(v=>v.id===id);x.avatar_url=await fileData(file);persist();return {avatarUrl:x.avatar_url}},
    createClub:async p=>{const x={id:uid(),name:p.name,city:p.city||"",active:true};state.clubs.push(x);persist();return clone(x)},
    updateClub:async(id,p)=>{const x=state.clubs.find(v=>v.id===id);Object.assign(x,p);state.players.filter(v=>v.club_id===id).forEach(v=>v.club_name=x.name);persist();return clone(x)},
    deleteClub:async id=>{const x=state.clubs.find(v=>v.id===id);const used=state.players.some(v=>v.club_id===id)||state.teams.some(t=>t.clubId===id);if(used){x.active=false;persist();return {mode:"archived",entity:clone(x)}}state.clubs=state.clubs.filter(v=>v.id!==id);persist();return {mode:"deleted"}},
    createPlayer:async p=>{const club=state.clubs.find(c=>c.id===p.clubId);const x={id:uid(),full_name:p.fullName,nickname:p.nickname||"",gender:p.gender||null,rating:Number(p.rating||3),phone:p.phone||"",club_id:p.clubId||null,club_name:club?.name||"Tự do",active:true,avatar_url:svgAvatar(p.fullName||"P")};state.players.push(x);persist();return clone(x)},
    updatePlayer:async(id,p)=>{
      let x=state.players.find(v=>v.id===id);
      if(!x&&typeof window!=="undefined"&&window.PICKLE_BINH_LOI_MEMBERS?.length){
        const zl=window.PICKLE_BINH_LOI_MEMBERS.find((m,i)=>("zl-"+m.zaloId)===id||("p-"+i)===id||m.id===id);
        if(zl){
          x={id,full_name:zl.fullName||zl.name,nickname:zl.nickname||"",gender:zl.gender||"male",rating:Number(zl.rating)||(zl.gender==="female"?2.0:2.5),avatar_url:zl.avatarUrl||zl.avatar_url||"",club_id:null,club_name:zl.club||"CLB Pickleball Bình Lợi",active:true};
          state.players.push(x);
        }
      }
      if(!x)throw Object.assign(new Error("PLAYER_NOT_FOUND"),{status:404});
      const club=state.clubs.find(c=>c.id===p.clubId);
      Object.assign(x,{
        full_name:p.fullName??x.full_name,
        nickname:p.nickname??x.nickname,
        gender:p.gender??x.gender,
        rating:p.rating!==undefined?Number(p.rating):x.rating,
        phone:p.phone??x.phone,
        club_id:p.clubId===undefined?x.club_id:(p.clubId||null),
        club_name:p.clubId===undefined?x.club_name:(club?.name||p.club_name||"Tự do"),
        active:p.active!==undefined?Boolean(p.active):(x.active!==false)
      });
      persist();
      return clone(x);
    },
    deletePlayer:async id=>{
      const x=state.players.find(v=>v.id===id);
      if(!x)return {mode:"deleted"};
      const used=Object.values(state.teamPlayers||{}).some(ids=>(ids||[]).includes(id));
      if(used){x.active=false;persist();return {mode:"archived",entity:clone(x)}}
      state.players=state.players.filter(v=>v.id!==id);
      persist();
      return {mode:"deleted"};
    },
    setTeamPlayers:async(teamId,playerIds)=>{
      const team=state.teams.find(t=>t.id===teamId);
      if(!team)throw new Error("NOT_FOUND");
      state.teamPlayers[teamId]=Array.isArray(playerIds)?playerIds.filter(Boolean):[];
      persist();
      return {ok:true,playerIds:state.teamPlayers[teamId]};
    },
    deactivatePlayer:async id=>{const x=state.players.find(v=>v.id===id);x.active=false;persist();return {mode:"deactivated",entity:clone(x)}},
    adjustRating:async(id,p)=>{let x=state.players.find(v=>v.id===id);if(!x&&typeof window!=="undefined"&&window.PICKLE_BINH_LOI_MEMBERS?.length){const zl=window.PICKLE_BINH_LOI_MEMBERS.find((m,i)=>("zl-"+m.zaloId)===id||("p-"+i)===id||m.id===id);if(zl){x={id,full_name:zl.fullName||zl.name,nickname:zl.nickname||"",gender:zl.gender||"male",rating:Number(zl.rating)||(zl.gender==="female"?2.0:2.5),avatar_url:zl.avatarUrl||zl.avatar_url||"",club_id:null,club_name:zl.club||"CLB Pickleball Bình Lợi",active:true};state.players.push(x)}}if(!x)throw Object.assign(new Error("PLAYER_NOT_FOUND"),{status:404});const before=Number(x.rating||0);x.rating=Math.round(Math.max(0,before+Number(p.delta||0))*100)/100;(state.ratingHistory[id]||(state.ratingHistory[id]=[])).unshift({before_rating:before,delta:Number(p.delta||0),after_rating:x.rating,reason:p.reason||"",created_at:new Date().toISOString()});persist();return clone(x)},
    createTournament:async p=>{const t={id:uid(),name:p.name,date:p.startAt?new Date(p.startAt).toLocaleDateString("vi-VN"):"Chưa chốt",startAt:p.startAt||null,endAt:null,venue:p.venue||"Chưa chốt",format:"Tournament",status:"open",publicVisible:true,teams:0};state.tournaments.push(t);const d={id:uid(),tournamentId:t.id,name:"Open",eventType:p.eventType||"doubles",format:"pool_to_knockout",bestOf:3,pointsToWin:11,winByTwo:true,advanceCount:2,active:true};state.divisions.push(d);persist();return {tournament:t,division:d}},
    updateTournament:async(id,p)=>{const x=state.tournaments.find(v=>v.id===id);Object.assign(x,{name:p.name??x.name,venue:p.venue??x.venue,startAt:p.startAt??x.startAt,endAt:p.endAt??x.endAt,status:p.status==="registration"?"open":(p.status??x.status),publicVisible:p.publicVisible??x.publicVisible});if(p.startAt)x.date=new Date(p.startAt).toLocaleDateString("vi-VN");persist();return clone(x)},
    deleteTournament:async id=>{const x=state.tournaments.find(v=>v.id===id);const dids=state.divisions.filter(d=>d.tournamentId===id).map(d=>d.id);const hasHistory=state.matches.some(m=>dids.includes(m.divisionId))||state.registrations.some(r=>dids.some(did=>state.divisions.find(d=>d.id===did)?.name===r.division_name));if(hasHistory){x.status="cancelled";x.publicVisible=false;persist();return {mode:"archived",entity:clone(x)}}state.tournaments=state.tournaments.filter(v=>v.id!==id);state.divisions=state.divisions.filter(d=>d.tournamentId!==id);persist();return {mode:"deleted"}},
    createDivision:async(tid,p)=>{const d={id:uid(),tournamentId:tid,name:p.name,eventType:p.eventType,format:p.format,bestOf:p.bestOf,pointsToWin:p.pointsToWin,winByTwo:p.winByTwo,hardCap:p.hardCap?Number(p.hardCap):null,hasBronzeMatch:p.hasBronzeMatch!==undefined?Boolean(p.hasBronzeMatch):true,advanceCount:Number(p.advanceCount)||2,groupCount:Number(p.groupCount)||null,expectedTeams:Number(p.expectedTeams)||null,drawMethod:p.drawMethod||"rating",allowBestThirds:Boolean(p.allowBestThirds),hasSeriesB:Boolean(p.hasSeriesB),active:true};state.divisions.push(d);persist();return clone(d)},
    updateDivisionFull:async(id,p)=>{const d=state.divisions.find(x=>x.id===id);Object.assign(d,p,{hardCap:p.hardCap!==undefined?(p.hardCap?Number(p.hardCap):null):(d.hardCap||null),hasBronzeMatch:p.hasBronzeMatch!==undefined?Boolean(p.hasBronzeMatch):(d.hasBronzeMatch!==undefined?Boolean(d.hasBronzeMatch):true),allowBestThirds:p.allowBestThirds!==undefined?Boolean(p.allowBestThirds):Boolean(d.allowBestThirds),hasSeriesB:p.hasSeriesB!==undefined?Boolean(p.hasSeriesB):Boolean(d.hasSeriesB),drawMethod:p.drawMethod||d.drawMethod||"rating"});persist();return clone(d)},
    deleteDivision:async id=>{const d=state.divisions.find(x=>x.id===id);const used=state.matches.some(m=>m.divisionId===id)||state.teams.some(t=>t.divisionId===id);if(used){d.active=false;persist();return {mode:"archived",entity:clone(d)}}state.divisions=state.divisions.filter(x=>x.id!==id);persist();return {mode:"deleted"}},
    createCourt:async(tid,p)=>{const x={id:uid(),tournamentId:tid,name:p.name,sortOrder:state.courts.filter(c=>c.tournamentId===tid).length+1,active:true};state.courts.push(x);persist();return clone(x)},
    updateCourt:async(id,p)=>{Object.assign(state.courts.find(x=>x.id===id),p);persist();return {}},
    deleteCourt:async id=>{const x=state.courts.find(c=>c.id===id);const used=state.matches.some(m=>m.courtId===id)||state.bookings.some(b=>b.court_id===id);if(used){x.active=false;persist();return {mode:"archived",entity:clone(x)}}state.courts=state.courts.filter(c=>c.id!==id);persist();return {mode:"deleted"}},
    createTeam:async(did,p)=>{const id=uid();const club=state.clubs.find(c=>c.id===p.clubId);const t={id,divisionId:did,name:p.name,club:club?.name||p.club||"Tự do",clubId:p.clubId||club?.id||null,group:p.group||"A",seed:p.seed||null,status:"active",w:0,l:0,pf:0,pa:0};state.teams.push(t);state.teamPlayers[id]=[];persist();return clone(t)},
    updateTeam:async(id,p)=>{const t=state.teams.find(x=>x.id===id);const club=state.clubs.find(c=>c.id===p.clubId);Object.assign(t,{name:p.name??t.name,clubId:p.clubId===undefined?t.clubId:(p.clubId||null),club:p.clubId===undefined?t.club:(club?.name||"Tự do"),group:p.group??t.group,seed:p.seed??t.seed,status:p.status??t.status});persist();return clone(t)},
    deleteTeam:async id=>{const t=state.teams.find(x=>x.id===id);const used=state.matches.some(m=>m.a===id||m.b===id)||state.registrations.some(r=>r.team_name===t?.name);if(used){t.status="withdrawn";persist();return {mode:"withdrawn",entity:clone(t)}}state.teams=state.teams.filter(x=>x.id!==id);delete state.teamPlayers[id];persist();return {mode:"deleted"}},
    updateDivision:async(id,p)=>{Object.assign(state.divisions.find(x=>x.id===id),p);persist();return {}},
    createMatch:async(did,p)=>{const court=state.courts.find(c=>c.id===p.courtId);const m={id:uid(),divisionId:did,stage:p.stage||"Vòng bảng",court:court?.sortOrder||court?.name||"—",courtId:p.courtId||null,time:p.scheduledAt?new Date(p.scheduledAt).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}):"—",a:p.teamAId,b:p.teamBId,status:"wait",sets:[],current:[0,0],winner:null,version:1,refereeId:p.refereeUserId||null};state.matches.push(m);persist();return clone(m)},
    autoSeedGroups:async(did,groupCount,opts={})=>{
      const d=state.divisions.find(x=>x.id===did);
      const rawGroupCount=groupCount||opts.groupCount||d?.groupCount||2;
      const count=Math.max(1,Math.min(26,Number(rawGroupCount)||1));
      const method=opts.method||opts.drawMethod||d?.drawMethod||"rating";
      const rawTeams=state.teams.filter(t=>t.divisionId===did&&t.status!=="withdrawn");
      if(!rawTeams.length)throw new Error("NO_TEAMS");
      if(rawTeams.length<count)throw new Error("MORE_GROUPS_THAN_TEAMS");

      const rnd=max=>{
        if(max<=1)return 0;
        if(globalThis.crypto?.getRandomValues){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%max}
        return Math.floor(Math.random()*max);
      };
      const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};

      const groups=Array.from({length:count},(_,i)=>({label:String.fromCharCode(65+i),teams:[]}));

      if(method==="random"||method==="pure_random"){
        const randomized=shuffle([...rawTeams]);
        randomized.forEach((t,i)=>{
          const g=groups[i%count];
          g.teams.push(t);
          const real=state.teams.find(x=>x.id===t.id);
          real.group=g.label;
          real.seed=i+1;
        });
      }else{
        const teams=rawTeams.map(t=>{
          const ps=(state.teamPlayers[t.id]||[]).map(id=>state.players.find(p=>p.id===id)).filter(Boolean);
          return {...t,avg:ps.length?ps.reduce((a,p)=>a+Number(p.rating||0),0)/ps.length:0};
        }).sort((a,b)=>b.avg-a.avg||(a.seed||999)-(b.seed||999));

        for(let p=0;p<teams.length;p+=count){
          const pot=shuffle(teams.slice(p,p+count));
          for(const t of pot){
            const minSize=Math.min(...groups.map(g=>g.teams.length));
            const candidates=groups.filter(g=>g.teams.length<=minSize+1).sort((a,b)=>{
              const ac=t.clubId&&a.teams.some(x=>x.clubId===t.clubId)?1:0;
              const bc=t.clubId&&b.teams.some(x=>x.clubId===t.clubId)?1:0;
              return ac-bc||a.teams.length-b.teams.length||(rnd(3)-1);
            });
            const g=candidates[0]||groups[0];
            g.teams.push(t);
            const real=state.teams.find(x=>x.id===t.id);
            real.group=g.label;
          }
        }
        let seed=1;
        for(const g of groups)for(const t of g.teams){const real=state.teams.find(x=>x.id===t.id);real.seed=seed++}
      }
      persist();return {groupCount:count,method,assignments:clone(groups)}
    },
    generateRoundRobin:async did=>{
      const d=state.divisions.find(x=>x.id===did);if(!d)throw new Error("NOT_FOUND");
      const tournament=state.tournaments.find(x=>x.id===d.tournamentId);
      const courts=state.courts.filter(c=>c.tournamentId===d.tournamentId&&c.active!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
      if(!courts.length)throw new Error("NO_ACTIVE_COURTS");
      const teams=state.teams.filter(t=>t.divisionId===did&&t.status!=="withdrawn");
      const groups=[...new Set(teams.map(t=>t.group).filter(Boolean))].sort();
      if(!groups.length)throw new Error("NO_GROUPS");
      const rounds=[];
      for(const g of groups){
        let ids=teams.filter(t=>t.group===g).sort((a,b)=>(a.seed||999)-(b.seed||999)).map(t=>t.id);
        if(ids.length<2)continue;
        if(ids.length%2===1)ids=[...ids,null];
        const n=ids.length;let arr=[...ids];
        for(let round=0;round<n-1;round++){
          const pairs=[];
          for(let i=0;i<n/2;i++){const a=arr[i],b=arr[n-1-i];if(a&&b)pairs.push({a,b,group:g,round})}
          (rounds[round]||(rounds[round]=[])).push(...pairs);
          arr=[arr[0],arr[n-1],...arr.slice(1,n-1)];
        }
      }
      const start=tournament?.startAt?new Date(tournament.startAt):null;
      const fmt=min=>{if(!start||Number.isNaN(start.getTime()))return "--:--";const x=new Date(start.getTime()+min*60000);return x.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})};
      let created=0,slot=0;
      for(const pairs of rounds){
        if(!pairs?.length)continue;
        for(let i=0;i<pairs.length;i++){
          const p=pairs[i];
          if(state.matches.some(m=>m.divisionId===did&&((m.a===p.a&&m.b===p.b)||(m.a===p.b&&m.b===p.a))))continue;
          const batch=Math.floor(i/courts.length),court=courts[i%courts.length];
          state.matches.push({id:uid(),divisionId:did,stage:"Bảng "+p.group,court:court.sortOrder||court.name||1,courtId:court.id,time:fmt((slot+batch)*35),a:p.a,b:p.b,status:"wait",sets:[],current:[0,0],winner:null,version:1,bracketSlot:null,roundNo:p.round+1});
          created++;
        }
        slot+=Math.max(1,Math.ceil(pairs.length/courts.length))+1;
      }
      persist();return {created,courts:courts.length,slots:slot}
    },
    autoScheduleCourts:async did=>{
      const d=state.divisions.find(x=>x.id===did);if(!d)throw new Error("NOT_FOUND");
      const tournament=state.tournaments.find(x=>x.id===d.tournamentId);
      const courts=state.courts.filter(c=>c.tournamentId===d.tournamentId&&c.active!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
      if(!courts.length)throw new Error("NO_ACTIVE_COURTS");
      const pending=state.matches.filter(m=>m.divisionId===did&&!m.bracketSlot&&(m.stage||"").startsWith("Bảng ")&&m.status==="wait"&&!(m.sets||[]).length);
      if(!pending.length)throw new Error("NO_UNSTARTED_MATCHES");
      const slots=[];
      const ordered=[...pending].sort((a,b)=>(a.roundNo||999)-(b.roundNo||999)||String(a.stage).localeCompare(String(b.stage),"vi"));
      for(const m of ordered){
        let si=0;
        while(true){
          const s=slots[si]||(slots[si]={matches:[],teams:new Set()});
          if(s.matches.length<courts.length&&!s.teams.has(m.a)&&!s.teams.has(m.b)){s.matches.push(m);s.teams.add(m.a);s.teams.add(m.b);break}
          si++;
        }
      }
      const start=tournament?.startAt?new Date(tournament.startAt):null;
      const fmt=min=>{if(!start||Number.isNaN(start.getTime()))return "--:--";const x=new Date(start.getTime()+min*60000);return x.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})};
      let updated=0;
      slots.forEach((s,si)=>s.matches.forEach((m,i)=>{const court=courts[i%courts.length];m.court=court.sortOrder||court.name||1;m.courtId=court.id;m.time=fmt(si*35);updated++}));
      persist();return {updated,courts:courts.length,slots:slots.length}
    },
    rankGroup:async(did,g)=>clone(rankGroupFor(did,g)),
    knockoutTeams:async(did,series="A")=>clone(knockoutTeamsFor(did,series)),
    generateBracket:async(did,opts={})=>{
      const d=state.divisions.find(x=>x.id===did);if(!d)throw new Error("NOT_FOUND");
      const existingBracket=state.matches.filter(m=>m.divisionId===did&&m.bracketSlot);
      const isStarted=m=>m.status==="live"||(m.sets||[]).length>0||((m.status==="done"||m.status==="completed")&&m.resultReason!=="bye");
      if(existingBracket.some(isStarted))throw new Error("BRACKET_ALREADY_STARTED");
      if(existingBracket.length)state.matches=state.matches.filter(m=>!(m.divisionId===did&&m.bracketSlot));
      const hasSeriesB=opts.hasSeriesB!==undefined?Boolean(opts.hasSeriesB):(Boolean(d.hasSeriesB)||d.format==="pool_series_ab");
      const teamsA=knockoutTeamsFor(did,"A");
      if(teamsA.length<2)throw new Error("NOT_ENOUGH_QUALIFIERS");
      if(d.format==="round_robin")throw new Error("ROUND_ROBIN_HAS_NO_KNOCKOUT");
      if(d.format==="double_elimination"&&![4,8].includes(teamsA.length))throw new Error("DOUBLE_ELIM_SUPPORTS_4_OR_8_TEAMS");
      const add=(stage,slot,a=null,b=null)=>{
        const m={id:uid(),divisionId:did,stage,bracketSlot:slot,court:1,courtId:state.courts[0]?.id||null,time:"--:--",a:a?.id||a||"TBD",b:b?.id||b||"TBD",status:"wait",sets:[],current:[0,0],winner:null,version:1};
        state.matches.push(m);return m;
      };
      if(d.format==="double_elimination"){
        const order=teamsA.length===4?[teamsA[0],teamsA[3],teamsA[1],teamsA[2]]:[teamsA[0],teamsA[7],teamsA[3],teamsA[4],teamsA[1],teamsA[6],teamsA[2],teamsA[5]];
        if(teamsA.length===4){
          add("Nhánh thắng - Vòng 1","DE-W-R1-M1",order[0],order[1]);add("Nhánh thắng - Vòng 1","DE-W-R1-M2",order[2],order[3]);add("Nhánh thắng - Chung kết","DE-W-F");add("Nhánh thua - Vòng 1","DE-L-R1-M1");add("Nhánh thua - Chung kết","DE-L-F");add("Chung kết tổng","DE-GF");persist();return {format:"double_elimination",created:6,qualifiers:clone(teamsA)}
        }
        for(let i=0;i<4;i++)add("Nhánh thắng - Tứ kết","DE-W-QF-M"+(i+1),order[i*2],order[i*2+1]);
        add("Nhánh thắng - Bán kết 1","DE-W-SF-M1");add("Nhánh thắng - Bán kết 2","DE-W-SF-M2");add("Nhánh thắng - Chung kết","DE-W-F");add("Nhánh thua - Vòng 1","DE-L-R1-M1");add("Nhánh thua - Vòng 1","DE-L-R1-M2");add("Nhánh thua - Vòng 2","DE-L-R2-M1");add("Nhánh thua - Vòng 2","DE-L-R2-M2");add("Nhánh thua - Bán kết","DE-L-SF");add("Nhánh thua - Chung kết","DE-L-F");add("Chung kết tổng","DE-GF");persist();return {format:"double_elimination",created:14,qualifiers:clone(teamsA)}
      }

      const buildSe=(prefix,teamList,labelPrefix="")=>{
        let size=2;while(size<teamList.length)size*=2;
        const slots=arrangeKnockoutSlots(teamList,size),rounds=Math.log2(size);let created=0;
        for(let r=0;r<rounds;r++){
          const count=size/(2**(r+1));
          for(let i=0;i<count;i++){
            const a=r===0?slots[i*2]:null,b=r===0?slots[i*2+1]:null;
            const roundTitle=count===1?"Chung kết":count===2?"Bán kết "+(i+1):count===4?"Tứ kết "+(i+1):"Knockout R"+(r+1)+" - Trận "+(i+1);
            const stageName=labelPrefix?(labelPrefix+" - "+roundTitle):roundTitle;
            const slotName=prefix+"R"+(r+1)+"-M"+(i+1);
            const m=add(stageName,slotName,a,b);
            if(r===0&&((a&&!b)||(!a&&b))){m.status="done";m.winner=(a||b).id;m.resultReason="bye"}
            created++;
          }
        }
        if(rounds>=2&&d.hasBronzeMatch!==false){
          const bronzeStage=labelPrefix?(labelPrefix+" - Tranh Hạng Ba"):"Tranh Hạng Ba";
          add(bronzeStage,prefix+"BRONZE");
          created++;
        }
        return {size,created};
      };

      const pfxA=hasSeriesB?"SE-A-":"SE-";
      const lblA=hasSeriesB?"Series A":"";
      const resA=buildSe(pfxA,teamsA,lblA);
      let resB=null;
      if(hasSeriesB){
        const teamsB=knockoutTeamsFor(did,"B");
        if(teamsB.length>=2){
          resB=buildSe("SE-B-",teamsB,"Series B");
        }
      }
      progressSingleElim(did);progressDoubleElim(did);persist();
      return {format:d.format,hasSeriesB,bracketSize:resA.size,created:resA.created+(resB?.created||0),qualifiers:clone(teamsA),seriesBTeams:hasSeriesB?clone(knockoutTeamsFor(did,"B")):[]}
    },

    podium:async did=>{
      const d=state.divisions.find(x=>x.id===did);if(!d)throw new Error("NOT_FOUND");
      const ms=state.matches.filter(m=>m.divisionId===did);
      const getTeam=id=>state.teams.find(t=>t.id===id)||null;
      const finalMatch=ms.find(m=>m.bracketSlot==="DE-GF"||m.bracketSlot==="SE-A-R3-M1"||m.bracketSlot==="SE-R3-M1"||(m.bracketSlot==="SE-R2-M1"&&!ms.some(n=>n.bracketSlot==="SE-R3-M1"))||((m.bracketSlot||"").startsWith("SE-")&&/chung kết/i.test(m.stage||"")))||ms.find(m=>/chung kết/i.test(m.stage||"")&&!/bán/i.test(m.stage||"")&&!/hạng ba/i.test(m.stage||""));
      const bronzeMatch=ms.find(m=>(m.bracketSlot||"").endsWith("BRONZE")||/hạng ba|tranh hạng 3/i.test(m.stage||""));
      const finalB=ms.find(m=>(m.bracketSlot||"").startsWith("SE-B-")&&/chung kết/i.test(m.stage||""));
      const champ=finalMatch?.winner?getTeam(finalMatch.winner):null;
      const runnerUp=finalMatch?.winner?getTeam(finalMatch.winner===finalMatch.a?finalMatch.b:finalMatch.a):null;
      const bronze=bronzeMatch?.winner?getTeam(bronzeMatch.winner):null;
      const fourth=bronzeMatch?.winner?getTeam(bronzeMatch.winner===bronzeMatch.a?bronzeMatch.b:bronzeMatch.a):null;
      const seriesBChamp=finalB?.winner?getTeam(finalB.winner):null;
      return {
        division:clone(d),
        champion:champ?clone(champ):null,
        runnerUp:runnerUp?clone(runnerUp):null,
        bronze:bronze?clone(bronze):null,
        fourth:fourth?clone(fourth):null,
        seriesBChampion:seriesBChamp?clone(seriesBChamp):null,
        isComplete:Boolean(champ)
      };
    },

    withdrawTeam:async(teamId,reason="Rút lui khỏi giải")=>{
      const t=state.teams.find(x=>x.id===teamId);if(!t)throw new Error("NOT_FOUND");
      t.status="withdrawn";
      const affectedMatches=[];
      state.matches.forEach(m=>{
        if((m.a===teamId||m.b===teamId)&&(m.status==="wait"||m.status==="live")){
          const oppId=m.a===teamId?m.b:m.a;
          if(oppId&&oppId!=="TBD"){
            m.winner=oppId;
            m.status="done";
            m.resultReason="walkover";
            m.resultNote=`${t.name} ${reason}`;
            const walkoverScore=m.a===teamId?[0,11]:[11,0];
            m.sets=m.sets.length?m.sets:[walkoverScore];
            affectedMatches.push(m.id);
          }else{
            m.status="cancelled";
            m.resultReason="cancelled";
            m.resultNote=`${t.name} ${reason}`;
          }
          m.version++;
          progressSingleElim(m.divisionId);
          progressDoubleElim(m.divisionId);
          autoProgressGroupToKnockout(m.divisionId);
        }
      });
      persist();
      return {team:clone(t),affectedMatches,walkoversAwarded:affectedMatches.length};
    },

    emergencyCompressSchedule:async(divisionId,opts={})=>{
      const d=state.divisions.find(x=>x.id===divisionId);if(!d)throw new Error("NOT_FOUND");
      d.bestOf=Number(opts.bestOf)||1;
      d.pointsToWin=Number(opts.pointsToWin)||11;
      d.hardCap=opts.hardCap?Number(opts.hardCap):15;
      if(opts.winByTwo!==undefined)d.winByTwo=Boolean(opts.winByTwo);
      let count=0;
      state.matches.forEach(m=>{
        if(m.divisionId===divisionId&&m.status==="wait"&&(!m.sets||!m.sets.length)){
          count++;
        }
      });
      persist();
      return {division:clone(d),unstartedCount:count,matchesUpdated:count};
    },

    exportDuprCsv:async targetId=>{
      const isTour=state.tournaments.some(t=>t.id===targetId);
      const divIds=isTour
        ?new Set(state.divisions.filter(d=>d.tournamentId===targetId).map(d=>d.id))
        :new Set([targetId]);
      const tourName=isTour
        ?state.tournaments.find(t=>t.id===targetId)?.name
        :state.tournaments.find(t=>t.id===state.divisions.find(d=>d.id===targetId)?.tournamentId)?.name;
      const matches=state.matches.filter(m=>divIds.has(m.divisionId)&&(m.status==="done"||m.status==="completed")&&m.winner);
      const getPlayers=tid=>{
        const pids=state.teamPlayers[tid]||[];
        return pids.map(id=>state.players.find(p=>p.id===id)).filter(Boolean);
      };
      const header=[
        "Match Date","Tournament Name","Division","Stage",
        "Player 1 Name","Player 1 DUPR","Player 2 Name","Player 2 DUPR",
        "Opponent 1 Name","Opponent 1 DUPR","Opponent 2 Name","Opponent 2 DUPR",
        "Score","Winning Team","Outcome Reason"
      ].join(",");
      const rows=matches.map(m=>{
        const d=state.divisions.find(x=>x.id===m.divisionId);
        const teamA=state.teams.find(t=>t.id===m.a);
        const teamB=state.teams.find(t=>t.id===m.b);
        const psA=getPlayers(m.a),psB=getPlayers(m.b);
        const winnerName=m.winner===m.a?teamA?.name:teamB?.name;
        const scoreStr=(m.sets||[]).map(s=>`${s[0]}-${s[1]}`).join(" ");
        const p1=psA[0]?.full_name||teamA?.name||"Player 1",r1=psA[0]?.rating||"";
        const p2=psA[1]?.full_name||(psA.length>1?"":""),r2=psA[1]?.rating||"";
        const op1=psB[0]?.full_name||teamB?.name||"Opponent 1",or1=psB[0]?.rating||"";
        const op2=psB[1]?.full_name||(psB.length>1?"":""),or2=psB[1]?.rating||"";
        return [
          `"${m.time||new Date().toLocaleDateString("vi-VN")}"`,
          `"${tourName||""}"`,
          `"${d?.name||""}"`,
          `"${m.stage||""}"`,
          `"${p1}"`,`"${r1}"`,`"${p2}"`,`"${r2}"`,
          `"${op1}"`,`"${or1}"`,`"${op2}"`,`"${or2}"`,
          `"${scoreStr}"`,`"${winnerName||""}"`,`"${m.resultReason||"Normal"}"`
        ].join(",");
      });
      return "\uFEFF" + [header,...rows].join("\r\n");
    },

    assignMatch:async(id,p)=>{const m=state.matches.find(x=>x.id===id);if(p.courtId!==undefined){const ct=p.courtId?state.courts.find(x=>x.id===p.courtId):null;m.courtId=p.courtId||null;m.court=ct?.sortOrder||ct?.name||"—"}if(p.refereeUserId!==undefined)m.refereeId=p.refereeUserId||null;if(p.scheduledAt!==undefined)m.time=p.scheduledAt?new Date(p.scheduledAt).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}):"—";m.version++;persist();return clone(m)},
    updateMatch:async(id,p)=>{const m=state.matches.find(x=>x.id===id);Object.assign(m,p);if(p.scheduledAt)m.time=new Date(p.scheduledAt).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"});m.version++;persist();return clone(m)},
    deleteMatch:async id=>{const m=state.matches.find(x=>x.id===id);if(!m)throw new Error("NOT_FOUND");if(m.status==="done"||m.status==="completed")throw Object.assign(new Error("COMPLETED_MATCH_LOCKED"),{status:409});if(m.status==="wait"&&!m.sets.length&&!(m.current?.[0]||m.current?.[1])){state.matches=state.matches.filter(x=>x.id!==id);persist();return {mode:"deleted"}}m.status="cancelled";persist();return {mode:"cancelled",entity:clone(m)}},
    point:async(id,p)=>{const m=state.matches.find(x=>x.id===id);if(!m)throw new Error("NOT_FOUND");if(p?.expectedVersion!==undefined&&Number(p.expectedVersion)!==m.version)throw Object.assign(new Error("VERSION_CONFLICT"),{status:409,currentVersion:m.version});const i=p.side==="A"?0:1;m.current[i]=Math.max(0,m.current[i]+Number(p.delta));m.status="live";if(p.servingSide)m.servingSide=p.servingSide;m.version++;persist();return clone(m)},
    finishSet:async(id,p)=>{const m=state.matches.find(x=>x.id===id);if(!m)throw new Error("NOT_FOUND");if(p?.expectedVersion!==undefined&&Number(p.expectedVersion)!==m.version)throw Object.assign(new Error("VERSION_CONFLICT"),{status:409,currentVersion:m.version});const d=state.divisions.find(x=>x.id===m.divisionId);const isMlp=d?.eventType==="team"||d?.format==="minigame_mlp"||/mlp/i.test(d?.name||"")||/mlp/i.test(m.stage||"");m.sets.push([...m.current]);if(!isMlp)m.current=[0,0];m.version++;persist();return clone(m)},
    finishMatch:async(id,p)=>{const m=state.matches.find(x=>x.id===id);if(!m)throw new Error("NOT_FOUND");if(p?.expectedVersion!==undefined&&Number(p.expectedVersion)!==m.version)throw Object.assign(new Error("VERSION_CONFLICT"),{status:409,currentVersion:m.version});const d=state.divisions.find(x=>x.id===m.divisionId);const isMlp=d?.eventType==="team"||d?.format==="minigame_mlp"||/mlp/i.test(d?.name||"")||/mlp/i.test(m.stage||"");let winner=null;if(isMlp){if(!m.sets.length||m.current[0]>0||m.current[1]>0)m.sets.push([...m.current]);const last=m.sets[m.sets.length-1]||m.current;winner=Number(last[0]||0)>=Number(last[1]||0)?m.a:m.b}else{const aw=m.sets.filter(s=>s[0]>s[1]).length,bw=m.sets.filter(s=>s[1]>s[0]).length;winner=aw>=bw?m.a:m.b}m.winner=winner;m.status="done";m.version++;progressSingleElim(m.divisionId);progressDoubleElim(m.divisionId);autoProgressGroupToKnockout(m.divisionId);persist();return clone(m)},
    quickScore:async(id,p)=>{const m=state.matches.find(x=>x.id===id);if(!m)throw new Error("NOT_FOUND");if(p?.expectedVersion!==undefined&&Number(p.expectedVersion)!==m.version)throw Object.assign(new Error("VERSION_CONFLICT"),{status:409,currentVersion:m.version});const d=state.divisions.find(x=>x.id===m.divisionId);const isMlp=d?.eventType==="team"||d?.format==="minigame_mlp"||/mlp/i.test(d?.name||"")||/mlp/i.test(m.stage||"");const rawSets=Array.isArray(p.sets)?p.sets:[];m.sets=rawSets.map(s=>[Number(s[0]||0),Number(s[1]||0)]).filter(([a,b])=>a>0||b>0);m.current=[0,0];let winner=null;if(isMlp&&m.sets.length){const last=m.sets[m.sets.length-1];winner=Number(last[0]||0)>=Number(last[1]||0)?m.a:m.b}else{let aw=0,bw=0;m.sets.forEach(([a,b])=>{if(a>b)aw++;else if(b>a)bw++});winner=aw>=bw?m.a:m.b}m.winner=winner;m.status="done";m.version++;progressSingleElim(m.divisionId);progressDoubleElim(m.divisionId);autoProgressGroupToKnockout(m.divisionId);persist();return clone(m)},
    specialResult:async(id,p)=>{const m=state.matches.find(x=>x.id===id);if(!m)throw new Error("NOT_FOUND");if(p?.expectedVersion!==undefined&&Number(p.expectedVersion)!==m.version)throw Object.assign(new Error("VERSION_CONFLICT"),{status:409,currentVersion:m.version});m.winner=p.winnerTeamId;m.status="done";m.resultReason=p.reason;m.resultNote=p.note||"";m.version++;progressSingleElim(m.divisionId);progressDoubleElim(m.divisionId);autoProgressGroupToKnockout(m.divisionId);persist();return clone(m)},
    undo:async id=>{const m=state.matches.find(x=>x.id===id);if(m.current[0]||m.current[1]){if(m.current[0]>=m.current[1]&&m.current[0]>0)m.current[0]--;else if(m.current[1]>0)m.current[1]--}m.version++;persist();return clone(m)},
    referees:async()=>clone(state.referees),createReferee:async p=>{if(!p.password||String(p.password).length<12)throw new Error("PASSWORD_TOO_SHORT");const r={id:uid(),email:p.email,display_name:p.name,active:true,password:String(p.password)};state.referees.push(r);persist();return clone(r)},updateReferee:async(id,p)=>{const r=state.referees.find(x=>x.id===id);if(!r)throw new Error("NOT_FOUND");Object.assign(r,{display_name:p.name??r.display_name,email:p.email??r.email,active:p.active??r.active,...(p.password?{password:String(p.password)}:{})});persist();return clone(r)},
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
    addTeamPlayer:async(teamId,playerId)=>{const team=state.teams.find(t=>t.id===teamId),player=state.players.find(p=>p.id===playerId);if(!team||!player)throw new Error("NOT_FOUND");const arr=state.teamPlayers[teamId]||(state.teamPlayers[teamId]=[]);if(!arr.includes(playerId))arr.push(playerId);persist();return {ok:true}},
    zaloTournaments:async()=>(typeof window!=="undefined"?(window.ZALO_CRAWLED_TOURNAMENTS||[]):[]),
    importZaloTournament:async(zaloId)=>{
      const list=(typeof window!=="undefined"?(window.ZALO_CRAWLED_TOURNAMENTS||[]):[]);
      const zt=list.find(t=>t.id===zaloId);
      if(!zt)throw Object.assign(new Error("ZALO_TOURNAMENT_NOT_FOUND"),{status:404});
      let existing=state.tournaments.find(t=>t.id===zaloId||(t.name||"").toLowerCase().trim()===(zt.name||"").toLowerCase().trim());
      if(existing)return {tournament:existing,alreadyExisted:true};
      const t={
        id:zt.id||("zalo-"+Date.now()),
        name:zt.name,
        date:zt.date,
        startAt:zt.startAt,
        endAt:zt.endAt,
        venue:zt.venue,
        format:zt.divisionName||"Open",
        status:"open",
        publicVisible:true,
        teams:zt.teams||16,
        isFeatured:Boolean(zt.isFeatured),
        featuredRank:zt.featuredRank||50,
        sponsorPackage:zt.sponsorPackage||"free",
        source:"zalo_crm",
        coverUrl:zt.coverUrl||"",
        isBanner:Boolean(zt.isBanner),
        entryFee:zt.entryFee,
        prizePool:zt.prizePool,
        contactName:zt.contactName,
        contactPhone:zt.contactPhone
      };
      state.tournaments.unshift(t);
      const d={
        id:uid(),
        tournamentId:t.id,
        name:zt.divisionName||"Open",
        eventType:zt.eventType||"doubles",
        format:zt.format||"pool_to_knockout",
        bestOf:3,
        pointsToWin:11,
        winByTwo:true,
        advanceCount:2,
        active:true
      };
      state.divisions.push(d);
      persist();
      return {tournament:t,division:d,created:true};
    },
    syncAllZaloTournaments:async(sport="pickleball")=>{
      const list=(typeof window!=="undefined"?(window.ZALO_CRAWLED_TOURNAMENTS||[]):[]);
      const filtered=list.filter(t=>!sport||t.sport===sport);
      let count=0;
      for(const zt of filtered){
        const norm=(zt.name||"").toLowerCase().trim();
        const existing = state.tournaments.find(t=>t.id===zt.id||(t.name||"").toLowerCase().trim()===norm);
        if(!existing){
          state.tournaments.push({
            id:zt.id,
            name:zt.name,
            date:zt.date,
            startAt:zt.startAt,
            endAt:zt.endAt,
            venue:zt.venue,
            format:zt.divisionName||"Open",
            status:"open",
            publicVisible:true,
            teams:zt.teams||16,
            isFeatured:Boolean(zt.isFeatured),
            featuredRank:zt.featuredRank||50,
            sponsorPackage:zt.sponsorPackage||"free",
            source:"zalo_crm",
            coverUrl:zt.coverUrl||"",
            isBanner:Boolean(zt.isBanner),
            entryFee:zt.entryFee,
            prizePool:zt.prizePool,
            contactName:zt.contactName,
            contactPhone:zt.contactPhone
          });
          count++;
        } else if(zt.coverUrl && !existing.coverUrl){
          existing.coverUrl = zt.coverUrl;
          existing.isBanner = Boolean(zt.isBanner);
          count++;
        }
      }
      if(count>0)persist();
      return {syncedCount:count,total:state.tournaments.length};
    }
  };
  // DEFAULT_SIX_COURTS_V1 — existing static demo tournaments start with six courts.
  // This runs once only; after that admins can freely change the court count.
  if(state.courtDefaultsVersion!==1){
    for(const t of (state.tournaments||[])){
      const active=(state.courts||[]).filter(c=>c.tournamentId===t.id&&c.active!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
      for(let i=active.length+1;i<=6;i++)state.courts.push({id:uid(),tournamentId:t.id,name:"Sân "+i,sortOrder:i,active:true});
    }
    state.courtDefaultsVersion=1;
    persist();
  }

  // SEED_BINH_LOI_MEMBERS_V1 — Ensure 1,015 CRM members are populated in state.players
  const ensureDefaultMembers=()=>{
    const list=(typeof window!=="undefined"&&window.PICKLE_BINH_LOI_MEMBERS)||[];
    if(!list.length)return;
    if(state.players&&state.players.length>=100&&state.membersSeededVersion===1)return;
    const playerMap=new Map((state.players||[]).map(p=>[(p.full_name||"").toLowerCase(),p]));
    let count=0;
    list.forEach((r,i)=>{
      const name=String(r.fullName||r.name||"").trim();
      if(!name||playerMap.has(name.toLowerCase()))return;
      const pid=r.zaloId?("zl-"+r.zaloId):("p-"+i);
      const newP={
        id:pid,
        full_name:name,
        nickname:r.nickname||"",
        gender:r.gender||"male",
        rating:Number(r.rating)||(r.gender==="female"?2.0:2.5),
        phone:r.phone||"",
        club_id:null,
        club_name:r.club||"CLB Pickleball Bình Lợi",
        active:true,
        avatar_url:r.avatarUrl||r.avatar_url||svgAvatar(name)
      };
      state.players.push(newP);
      playerMap.set(name.toLowerCase(),newP);
      count++;
    });
    state.membersSeededVersion=1;
    if(count>0)persist();
  };
  ensureDefaultMembers();

  // VISIBLE_16_PAIR_DEMO_V1 — one-time GitHub Pages demo upgrade requested by owner.
  // Keeps real/production backend untouched. If the currently viewed static demo has exactly
  // four untouched teams, expand that same division to 16 pairs, draw 4 pools, play the
  // group stage with deterministic demo scores, and generate the 8-team bracket to the final.
  const ensureVisible16PairDemo=()=>{
    if(typeof location==="undefined"||!location.hostname.endsWith(".github.io"))return;
    if(state.demo16Version===1)return;
    const params=new URLSearchParams(location.search||"");
    const currentTournamentId=params.get("id");
    const candidateDivisions=(state.divisions||[]).filter(d=>d.active!==false&&d.format==="pool_to_knockout")
      .sort((a,b)=>{
        const ac=a.tournamentId===currentTournamentId?0:1,bc=b.tournamentId===currentTournamentId?0:1;
        return ac-bc;
      });
    const d=candidateDivisions.find(d=>{
      const teams=(state.teams||[]).filter(t=>t.divisionId===d.id&&t.status!=="withdrawn");
      const matches=(state.matches||[]).filter(m=>m.divisionId===d.id);
      const started=matches.some(m=>m.status==="live"||m.status==="done"||m.status==="completed"||(m.sets||[]).length||(m.current?.[0]||m.current?.[1]));
      return teams.length===4&&!started;
    });
    if(!d)return;
    const t=state.tournaments.find(x=>x.id===d.tournamentId);if(!t)return;

    // Keep the four existing pairs and add 12 more to this exact tournament.
    let teams=(state.teams||[]).filter(x=>x.divisionId===d.id&&x.status!=="withdrawn");
    for(let i=teams.length+1;i<=16;i++){
      const teamId=uid();
      const team={id:teamId,divisionId:d.id,name:"Cặp "+String(i).padStart(2,"0"),club:"CLB Pickleball Bình Lợi",clubId:null,group:"A",seed:i,status:"active",w:0,l:0,pf:0,pa:0};
      state.teams.push(team);state.teamPlayers[teamId]=[];
      for(let k=0;k<2;k++){
        const n=(i-1)*2+k+1,name="VĐV "+String(n).padStart(2,"0");
        const p={id:uid(),full_name:name,nickname:"",gender:null,rating:Math.round((2+((n*7)%17)/10)*100)/100,phone:"",club_id:null,club_name:"CLB Pickleball Bình Lợi",active:true,avatar_url:svgAvatar(name)};
        state.players.push(p);state.teamPlayers[teamId].push(p.id);
      }
      state.registrations.push({id:uid(),status:"approved",payment_status:"unpaid",amount:0,team_name:team.name,division_name:d.name,tournament_name:t.name,checked_in_at:null,payment_id:null,payment_review_status:null});
    }

    // Remove only untouched schedule for this demo division, then run the real draw methods.
    state.matches=(state.matches||[]).filter(m=>m.divisionId!==d.id);
    teams=(state.teams||[]).filter(x=>x.divisionId===d.id&&x.status!=="withdrawn");
    teams.forEach((x,i)=>{x.seed=i+1;x.group="A";x.w=0;x.l=0;x.sw=0;x.sl=0;x.pf=0;x.pa=0});
    api.autoSeedGroups(d.id,4);
    api.generateRoundRobin(d.id);

    // Finish all 24 group matches so the Top 2 and knockout bracket are visible immediately.
    const gm=state.matches.filter(m=>m.divisionId===d.id&&!m.bracketSlot&&(m.stage||"").startsWith("Bảng "));
    gm.forEach((m,i)=>api.quickScore(m.id,{sets:[[11,5+(i%4)],[11,6+(i%3)]]}));
    api.generateBracket(d.id);

    t.name=t.name.includes("16 CẶP")?t.name:t.name+" • TEST 16 CẶP";
    t.teams=16;
    state.demo16Version=1;
    persist();
  };
  ensureVisible16PairDemo();

  window.PickleAPI=api;
  window.io=()=>({on:(event,cb)=>window.addEventListener("pickle-preview-update",e=>{if(event==="public:state"||event==="match:update")cb(clone(e.detail))})});
  window.addEventListener("storage",e=>{if(e.key===KEY&&e.newValue){state=JSON.parse(e.newValue);window.dispatchEvent(new CustomEvent("pickle-preview-update",{detail:clone(state)}))}});
})();