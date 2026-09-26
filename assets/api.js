(() => {
  async function request(url, options={}){
    const res=await fetch(url,{credentials:"include",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
    const data=await res.json().catch(()=>({}));
    if(res.status===401&&location.pathname!="/login"&&!location.pathname.endsWith("login.html")){
      location.href="/login"; throw new Error("AUTH_REQUIRED");
    }
    if(!res.ok){
      const err=new Error(data.error||"REQUEST_FAILED");
      err.status=res.status;err.data=data;throw err;
    }
    return data;
  }
  window.PickleAPI={
    request,
    login:(email,password)=>request("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})}),
    logout:()=>request("/api/auth/logout",{method:"POST"}),
    changePassword:(currentPassword,newPassword)=>request("/api/auth/change-password",{method:"POST",body:JSON.stringify({currentPassword,newPassword})}),
    me:()=>request("/api/auth/me"),
    session:()=>request("/api/auth/session"),
    publicState:()=>request("/api/public/state"),
    publicPlayers:async()=>{
      try{
        const data=await request("/api/public/players");
        if(Array.isArray(data)&&data.length)return data;
      }catch(e){}
      const localState=JSON.parse(localStorage.getItem("pickle-local-state-v1")||"null");
      if(localState?.players?.length)return localState.players;
      if(typeof window!=="undefined"&&window.PICKLE_BINH_LOI_MEMBERS?.length){
        return window.PICKLE_BINH_LOI_MEMBERS.map((r,i)=>({
          id:r.zaloId?("zl-"+r.zaloId):("p-"+i),
          full_name:r.fullName||r.name,
          avatar_url:r.avatarUrl||r.avatar_url||"",
          rating:Number(r.rating)||3.0,
          club_name:r.club||"CLB Pickleball Bình Lợi",
          club_city:"TP.HCM",
          nickname:r.role!=="Thành viên"?r.role:""
        }));
      }
      return [];
    },
    publicPlayer:async(id)=>{
      try{
        const data=await request(`/api/public/players/${encodeURIComponent(id)}`);
        if(data&&data.profile)return data;
      }catch(e){}
      const all=await window.PickleAPI.publicPlayers();
      const p=all.find(x=>x.id===id||x.full_name===id);
      if(p)return {profile:{id:p.id,fullName:p.full_name,nickname:p.nickname||"",gender:null,rating:p.rating,avatarUrl:p.avatar_url,clubName:p.club_name,clubCity:p.club_city||"TP.HCM"},stats:{wins:0,losses:0,matches:0,winRate:0,pointsFor:0,pointsAgainst:0,diff:0},teams:[],partners:[],matches:[],ratingHistory:[]};
      throw Object.assign(new Error("NOT_FOUND"),{status:404});
    },
    publicClubs:async()=>{
      try{
        const data=await request("/api/public/clubs");
        if(Array.isArray(data)&&data.length)return data;
      }catch(e){}
      return [{id:"club-binh-loi",name:"CLB Pickleball Bình Lợi",city:"TP.HCM",active:true}];
    },
    publicPosts:()=>request("/api/public/posts"),
    publicSponsors:()=>request("/api/public/sponsors"),
    publicBranding:()=>request("/api/public/branding"),
    publicCheckin:token=>request(`/api/checkin/${encodeURIComponent(token)}`),
    confirmCheckin:token=>request(`/api/checkin/${encodeURIComponent(token)}/confirm`,{method:"POST",body:"{}"}),
    submitTournament:payload=>request("/api/public/tournaments/submit",{method:"POST",body:JSON.stringify(payload)}),
    adminState:()=>request("/api/admin/state"),
    players:()=>request("/api/players"),
    importPlayers:rows=>request("/api/import/players",{method:"POST",body:JSON.stringify({rows})}),
    importTeams:(divisionId,rows)=>request(`/api/divisions/${divisionId}/import-teams`,{method:"POST",body:JSON.stringify({rows})}),
    clubs:()=>request("/api/clubs"),
    createPlayer:payload=>request("/api/players",{method:"POST",body:JSON.stringify(payload)}),
    uploadReceipt:async(file)=>{
      const form=new FormData();form.append("receipt",file);
      const res=await fetch("/api/uploads/receipt",{method:"POST",body:form,credentials:"include"});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw Object.assign(new Error(data.error||"UPLOAD_FAILED"),{status:res.status,data});
      return data;
    },
    uploadImage:async(file)=>{
      const form=new FormData();form.append("image",file);
      const res=await fetch("/api/uploads/image",{method:"POST",body:form,credentials:"include"});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw Object.assign(new Error(data.error||"UPLOAD_FAILED"),{status:res.status,data});
      return data;
    },
    uploadPlayerAvatar:async(playerId,file)=>{
      const form=new FormData();form.append("avatar",file);
      const res=await fetch(`/api/players/${encodeURIComponent(playerId)}/avatar`,{method:"POST",body:form,credentials:"include"});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw Object.assign(new Error(data.error||"UPLOAD_FAILED"),{status:res.status,data});
      return data;
    },
    adjustRating:(playerId,payload)=>request(`/api/players/${playerId}/rating-adjust`,{method:"POST",body:JSON.stringify(payload)}),
    createClub:payload=>request("/api/clubs",{method:"POST",body:JSON.stringify(payload)}),
    sponsors:()=>request("/api/sponsors"),
    createSponsor:payload=>request("/api/sponsors",{method:"POST",body:JSON.stringify(payload)}),
    updateSponsor:(id,payload)=>request(`/api/sponsors/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
    deleteSponsor:id=>request(`/api/sponsors/${id}`,{method:"DELETE"}),
    posts:()=>request("/api/posts"),
    createPost:payload=>request("/api/posts",{method:"POST",body:JSON.stringify(payload)}),
    updatePost:(id,payload)=>request(`/api/posts/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
    deletePost:id=>request(`/api/posts/${id}`,{method:"DELETE"}),
    branding:()=>request("/api/settings/branding"),
    saveBranding:payload=>request("/api/settings/branding",{method:"PUT",body:JSON.stringify(payload)}),
    clubEvents:(clubId="")=>request("/api/club-events"+(clubId?`?clubId=${encodeURIComponent(clubId)}`:"")),
    createClubEvent:payload=>request("/api/club-events",{method:"POST",body:JSON.stringify(payload)}),
    updateClubEvent:(id,payload)=>request(`/api/club-events/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
    deleteClubEvent:id=>request(`/api/club-events/${id}`,{method:"DELETE"}),
    clubAttendance:eventId=>request(`/api/club-events/${eventId}/attendance`),
    addClubAttendance:(eventId,playerId)=>request(`/api/club-events/${eventId}/attendance`,{method:"POST",body:JSON.stringify({playerId})}),
    updateClubAttendance:(eventId,playerId,status)=>request(`/api/club-events/${eventId}/attendance/${playerId}`,{method:"PATCH",body:JSON.stringify({status})}),
    clubTransactions:(clubId="")=>request("/api/club-transactions"+(clubId?`?clubId=${encodeURIComponent(clubId)}`:"")),
    createClubTransaction:payload=>request("/api/club-transactions",{method:"POST",body:JSON.stringify(payload)}),
    bookings:()=>request("/api/bookings"),
    createBooking:payload=>request("/api/bookings",{method:"POST",body:JSON.stringify(payload)}),
    updateBooking:(id,payload)=>request(`/api/bookings/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
    reportOverview:(tournamentId="")=>request("/api/reports/overview"+(tournamentId?`?tournamentId=${encodeURIComponent(tournamentId)}`:"")),
    checkin:id=>request(`/api/registrations/${id}/checkin`,{method:"POST",body:"{}"}),
    undoCheckin:id=>request(`/api/registrations/${id}/undo-checkin`,{method:"POST",body:"{}"}),
    checkinQr:id=>request(`/api/registrations/${id}/checkin-qr`),
    addTeamPlayer:(teamId,playerId)=>request(`/api/teams/${teamId}/players`,{method:"POST",body:JSON.stringify({playerId})}),
    createTournament:payload=>request("/api/tournaments",{method:"POST",body:JSON.stringify(payload)}),
    updateTournament:(id,payload)=>request(`/api/tournaments/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
    deleteTournament:id=>request(`/api/tournaments/${id}`,{method:"DELETE"}),
    updateDivisionFull:(id,payload)=>request(`/api/divisions/${id}/full`,{method:"PATCH",body:JSON.stringify(payload)}),
    deleteDivision:id=>request(`/api/divisions/${id}`,{method:"DELETE"}),
    deleteCourt:id=>request(`/api/courts/${id}`,{method:"DELETE"}),
    updatePlayer:(id,payload)=>request(`/api/players/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
    deactivatePlayer:id=>request(`/api/players/${id}`,{method:"DELETE"}),
    updateClub:(id,payload)=>request(`/api/clubs/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
    deleteClub:id=>request(`/api/clubs/${id}`,{method:"DELETE"}),
    updateTeam:(id,payload)=>request(`/api/teams/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
    deleteTeam:id=>request(`/api/teams/${id}`,{method:"DELETE"}),
    updateMatch:(id,payload)=>request(`/api/matches/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
    deleteMatch:id=>request(`/api/matches/${id}`,{method:"DELETE"}),
    updateRegistration:(id,payload)=>request(`/api/registrations/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
    deleteRegistration:id=>request(`/api/registrations/${id}`,{method:"DELETE"}),
    deleteBooking:id=>request(`/api/bookings/${id}`,{method:"DELETE"}),
    createDivision:(tournamentId,payload)=>request(`/api/tournaments/${tournamentId}/divisions`,{method:"POST",body:JSON.stringify(payload)}),
    createCourt:(tournamentId,payload)=>request(`/api/tournaments/${tournamentId}/courts`,{method:"POST",body:JSON.stringify(payload)}),
    updateCourt:(courtId,payload)=>request(`/api/courts/${courtId}`,{method:"PATCH",body:JSON.stringify(payload)}),
    createTeam:(divisionId,payload)=>request(`/api/divisions/${divisionId}/teams`,{method:"POST",body:JSON.stringify(payload)}),
    updateDivision:(divisionId,payload)=>request(`/api/divisions/${divisionId}`,{method:"PATCH",body:JSON.stringify(payload)}),
    createMatch:(divisionId,payload)=>request(`/api/divisions/${divisionId}/matches`,{method:"POST",body:JSON.stringify(payload)}),
    generateRoundRobin:(divisionId)=>request(`/api/divisions/${divisionId}/generate-round-robin`,{method:"POST",body:"{}"}),
    autoSeedGroups:(divisionId,groupCount)=>request(`/api/divisions/${divisionId}/auto-seed-groups`,{method:"POST",body:JSON.stringify({groupCount})}),
    generateBracket:(divisionId)=>request(`/api/divisions/${divisionId}/generate-bracket`,{method:"POST",body:"{}"}),
    assignMatch:(id,payload)=>request(`/api/matches/${id}/assignment`,{method:"PATCH",body:JSON.stringify(payload)}),
    point:(id,payload)=>request(`/api/matches/${id}/point`,{method:"POST",body:JSON.stringify(payload)}),
    finishSet:(id,payload)=>request(`/api/matches/${id}/finish-set`,{method:"POST",body:JSON.stringify(payload)}),
    finishMatch:(id,payload)=>request(`/api/matches/${id}/finish`,{method:"POST",body:JSON.stringify(payload)}),
    quickScore:(id,payload)=>request(`/api/matches/${id}/quick-score`,{method:"POST",body:JSON.stringify(payload)}),
    specialResult:(id,payload)=>request(`/api/matches/${id}/special-result`,{method:"POST",body:JSON.stringify(payload)}),
    undo:(id)=>request(`/api/matches/${id}/undo`,{method:"POST",body:"{}"}),
    users:()=>request("/api/users"),
    createUser:payload=>request("/api/users",{method:"POST",body:JSON.stringify(payload)}),
    updateUser:(id,payload)=>request(`/api/users/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
    referees:()=>request("/api/users/referees"),
    createReferee:payload=>request("/api/users/referees",{method:"POST",body:JSON.stringify(payload)}),
    updateReferee:(id,payload)=>request(`/api/users/referees/${id}`,{method:"PATCH",body:JSON.stringify(payload)}),
    registrations:()=>request("/api/registrations"),
    createRegistration:(divisionId,payload)=>request(`/api/divisions/${divisionId}/registrations`,{method:"POST",body:JSON.stringify(payload)}),
    addPayment:(registrationId,payload)=>request(`/api/registrations/${registrationId}/payment`,{method:"POST",body:JSON.stringify(payload)}),
    reviewPayment:(paymentId,status)=>request(`/api/payment-records/${paymentId}`,{method:"PATCH",body:JSON.stringify({status})})
  };
})();