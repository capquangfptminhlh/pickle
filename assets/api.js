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
    publicState:()=>request("/api/public/state"),
    adminState:()=>request("/api/admin/state"),
    createTournament:payload=>request("/api/tournaments",{method:"POST",body:JSON.stringify(payload)}),
    createDivision:(tournamentId,payload)=>request(`/api/tournaments/${tournamentId}/divisions`,{method:"POST",body:JSON.stringify(payload)}),
    createCourt:(tournamentId,payload)=>request(`/api/tournaments/${tournamentId}/courts`,{method:"POST",body:JSON.stringify(payload)}),
    updateCourt:(courtId,payload)=>request(`/api/courts/${courtId}`,{method:"PATCH",body:JSON.stringify(payload)}),
    createTeam:(divisionId,payload)=>request(`/api/divisions/${divisionId}/teams`,{method:"POST",body:JSON.stringify(payload)}),
    updateDivision:(divisionId,payload)=>request(`/api/divisions/${divisionId}`,{method:"PATCH",body:JSON.stringify(payload)}),
    createMatch:(divisionId,payload)=>request(`/api/divisions/${divisionId}/matches`,{method:"POST",body:JSON.stringify(payload)}),
    generateRoundRobin:(divisionId)=>request(`/api/divisions/${divisionId}/generate-round-robin`,{method:"POST",body:"{}"}),
    generateBracket:(divisionId)=>request(`/api/divisions/${divisionId}/generate-bracket`,{method:"POST",body:"{}"}),
    assignMatch:(id,payload)=>request(`/api/matches/${id}/assignment`,{method:"PATCH",body:JSON.stringify(payload)}),
    point:(id,payload)=>request(`/api/matches/${id}/point`,{method:"POST",body:JSON.stringify(payload)}),
    finishSet:(id,payload)=>request(`/api/matches/${id}/finish-set`,{method:"POST",body:JSON.stringify(payload)}),
    finishMatch:(id,payload)=>request(`/api/matches/${id}/finish`,{method:"POST",body:JSON.stringify(payload)}),
    undo:(id)=>request(`/api/matches/${id}/undo`,{method:"POST",body:"{}"}),
    referees:()=>request("/api/users/referees"),
    createReferee:payload=>request("/api/users/referees",{method:"POST",body:JSON.stringify(payload)}),
    registrations:()=>request("/api/registrations"),
    createRegistration:(divisionId,payload)=>request(`/api/divisions/${divisionId}/registrations`,{method:"POST",body:JSON.stringify(payload)}),
    addPayment:(registrationId,payload)=>request(`/api/registrations/${registrationId}/payment`,{method:"POST",body:JSON.stringify(payload)}),
    reviewPayment:(paymentId,status)=>request(`/api/payment-records/${paymentId}`,{method:"PATCH",body:JSON.stringify({status})})
  };
})();