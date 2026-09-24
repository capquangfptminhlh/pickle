(()=>{
  const API=window.PickleAPI;
  const $=s=>document.querySelector(s);
  const modal=(title,body)=>{
    $("#genericTitle").textContent=title;
    $("#genericBody").innerHTML=body;
    $("#genericDialog").showModal();
  };
  const close=()=>$("#genericDialog").close();
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const fmtLocal=v=>{
    if(!v)return"";
    const d=new Date(v);if(Number.isNaN(d.getTime()))return"";
    const pad=n=>String(n).padStart(2,"0");
    return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"T"+pad(d.getHours())+":"+pad(d.getMinutes());
  };
  const danger=async(question,fn,ctx)=>{
    if(!confirm(question))return;
    try{
      const r=await fn();
      ctx.toast(r?.mode==="archived"?"Đã khóa và giữ lịch sử.":r?.mode==="cancelled"?"Đã hủy và giữ lịch sử.":r?.mode==="withdrawn"?"Đã rút đội khỏi giải.":"Đã cập nhật.");
      await ctx.refresh();
    }catch(e){
      const map={
        COMPLETED_MATCH_LOCKED:"Trận đã chốt kết quả. Không thể hủy bằng thao tác thường.",
        NOT_FOUND:"Dữ liệu không còn tồn tại."
      };
      ctx.toast(map[e.message]||("Không thể thực hiện: "+e.message));
    }
  };

  async function editTournament(t,ctx){
    modal("Sửa giải đấu",'<div class="form-grid">'+
      '<label class="field full">Tên giải<input id="crudTName" value="'+esc(t.name)+'"></label>'+
      '<label class="field full">Địa điểm<input id="crudTVenue" value="'+esc(t.venue==="Chưa chốt"?"":t.venue)+'"></label>'+
      '<label class="field">Bắt đầu<input id="crudTStart" type="datetime-local" value="'+fmtLocal(t.startAt)+'"></label>'+
      '<label class="field">Kết thúc<input id="crudTEnd" type="datetime-local" value="'+fmtLocal(t.endAt)+'"></label>'+
      '<label class="field">Trạng thái<select id="crudTStatus">'+
        [["draft","Nháp"],["registration","Mở đăng ký"],["live","Đang diễn ra"],["completed","Hoàn tất"],["cancelled","Đã hủy"]].map(([v,l])=>'<option value="'+v+'" '+((t.status==="open"?"registration":t.status)===v?"selected":"")+'>'+l+'</option>').join("")+
      '</select></label>'+
      '<label class="field" style="align-content:end"><span><input id="crudTPublic" type="checkbox" '+(t.publicVisible?"checked":"")+'> Hiển thị công khai</span></label>'+
      '<div class="field full"><button id="crudSaveT" type="button" class="btn primary">Lưu thay đổi</button></div></div>');
    $("#crudSaveT").onclick=async()=>{
      try{
        await API.updateTournament(t.id,{
          name:$("#crudTName").value.trim(),
          venue:$("#crudTVenue").value.trim(),
          startAt:$("#crudTStart").value||null,
          endAt:$("#crudTEnd").value||null,
          status:$("#crudTStatus").value,
          publicVisible:$("#crudTPublic").checked
        });
        close();await ctx.refresh();ctx.toast("Đã cập nhật giải.");
      }catch(e){ctx.toast("Không thể cập nhật: "+e.message)}
    };
  }

  async function editPlayer(p,ctx){
    const clubs=await API.clubs().catch(()=>[]);
    modal("Sửa VĐV",'<div class="form-grid">'+
      '<label class="field full">Họ tên<input id="crudPName" value="'+esc(p.full_name)+'"></label>'+
      '<label class="field">Biệt danh<input id="crudPNick" value="'+esc(p.nickname||"")+'"></label>'+
      '<label class="field">Giới tính<select id="crudPGender"><option value="">Chưa chọn</option><option value="male" '+(p.gender==="male"?"selected":"")+'>Nam</option><option value="female" '+(p.gender==="female"?"selected":"")+'>Nữ</option><option value="other" '+(p.gender==="other"?"selected":"")+'>Khác</option></select></label>'+
      '<label class="field">CLB<select id="crudPClub"><option value="">Tự do</option>'+clubs.map(c=>'<option value="'+c.id+'" '+(c.id===p.club_id?"selected":"")+'>'+esc(c.name)+'</option>').join("")+'</select></label>'+
      '<label class="field">Điện thoại<input id="crudPPhone" value="'+esc(p.phone||"")+'"></label>'+
      '<label class="field" style="align-content:end"><span><input id="crudPActive" type="checkbox" '+(p.active?"checked":"")+'> Hoạt động</span></label>'+
      '<div class="field full"><button id="crudSaveP" type="button" class="btn primary">Lưu VĐV</button></div></div>');
    $("#crudSaveP").onclick=async()=>{
      try{
        await API.updatePlayer(p.id,{
          fullName:$("#crudPName").value.trim(),nickname:$("#crudPNick").value.trim(),
          gender:$("#crudPGender").value||null,clubId:$("#crudPClub").value||null,
          phone:$("#crudPPhone").value.trim(),active:$("#crudPActive").checked
        });
        close();await ctx.refresh();ctx.toast("Đã cập nhật VĐV.");
      }catch(e){ctx.toast("Không thể cập nhật: "+e.message)}
    };
  }

  async function editTeam(t,ctx){
    const clubs=await API.clubs().catch(()=>[]);
    modal("Sửa đội / cặp",'<div class="form-grid">'+
      '<label class="field full">Tên đội / cặp<input id="crudTeamName" value="'+esc(t.name)+'"></label>'+
      '<label class="field">CLB<select id="crudTeamClub"><option value="">Tự do</option>'+clubs.map(c=>'<option value="'+c.id+'" '+(c.id===t.clubId?"selected":"")+'>'+esc(c.name)+'</option>').join("")+'</select></label>'+
      '<label class="field">Bảng<input id="crudTeamGroup" value="'+esc(t.group||"")+'"></label>'+
      '<label class="field">Seed<input id="crudTeamSeed" type="number" min="1" value="'+esc(t.seed||"")+'"></label>'+
      '<label class="field">Trạng thái<select id="crudTeamStatus"><option value="active" '+(t.status==="active"?"selected":"")+'>Hoạt động</option><option value="withdrawn" '+(t.status==="withdrawn"?"selected":"")+'>Rút giải</option></select></label>'+
      '<div class="field full"><button id="crudSaveTeam" type="button" class="btn primary">Lưu đội</button></div></div>');
    $("#crudSaveTeam").onclick=async()=>{
      try{
        await API.updateTeam(t.id,{name:$("#crudTeamName").value.trim(),clubId:$("#crudTeamClub").value||null,group:$("#crudTeamGroup").value.trim(),seed:Number($("#crudTeamSeed").value)||null,status:$("#crudTeamStatus").value});
        close();await ctx.refresh();ctx.toast("Đã cập nhật đội.");
      }catch(e){ctx.toast("Không thể cập nhật: "+e.message)}
    };
  }

  function editCourt(court,ctx){
    modal("Sửa sân",'<div class="form-grid">'+
      '<label class="field full">Tên sân<input id="crudCourtName" value="'+esc(court.name)+'"></label>'+
      '<label class="field">Thứ tự<input id="crudCourtSort" type="number" min="0" value="'+Number(court.sortOrder||0)+'"></label>'+
      '<label class="field" style="align-content:end"><span><input id="crudCourtActive" type="checkbox" '+(court.active?"checked":"")+'> Đang sử dụng</span></label>'+
      '<div class="field full"><button id="crudSaveCourt" type="button" class="btn primary">Lưu sân</button></div></div>');
    $("#crudSaveCourt").onclick=async()=>{
      try{
        await API.updateCourt(court.id,{name:$("#crudCourtName").value.trim(),sortOrder:Number($("#crudCourtSort").value)||0,active:$("#crudCourtActive").checked});
        close();await ctx.refresh();ctx.toast("Đã cập nhật sân.");
      }catch(e){ctx.toast("Không thể cập nhật: "+e.message)}
    };
  }

  async function editDivision(d,ctx){
    modal("Sửa nội dung thi đấu",'<div class="form-grid">'+
      '<label class="field full">Tên nội dung<input id="crudDName" value="'+esc(d.name)+'"></label>'+
      '<label class="field">Loại<select id="crudDType">'+[["singles","Singles"],["doubles","Doubles"],["mixed_doubles","Mixed Doubles"],["team","Team"]].map(([v,l])=>'<option value="'+v+'" '+(d.eventType===v?"selected":"")+'>'+l+'</option>').join("")+'</select></label>'+
      '<label class="field">Thể thức<select id="crudDFormat">'+[["round_robin","Round Robin"],["pool_to_knockout","Bảng + Knockout"],["single_elimination","Single Elimination"],["double_elimination","Double Elimination"]].map(([v,l])=>'<option value="'+v+'" '+(d.format===v?"selected":"")+'>'+l+'</option>').join("")+'</select></label>'+
      '<label class="field">Best of<select id="crudDBest">'+[1,3,5].map(v=>'<option value="'+v+'" '+(d.bestOf===v?"selected":"")+'>'+v+'</option>').join("")+'</select></label>'+
      '<label class="field">Điểm/set<select id="crudDPoints">'+[11,15,21].map(v=>'<option value="'+v+'" '+(d.pointsToWin===v?"selected":"")+'>'+v+'</option>').join("")+'</select></label>'+
      '<label class="field">Top đi tiếp<input id="crudDAdvance" type="number" min="1" value="'+d.advanceCount+'"></label>'+
      '<label class="field" style="align-content:end"><span><input id="crudDWin2" type="checkbox" '+(d.winByTwo?"checked":"")+'> Win by 2</span></label>'+
      '<label class="field full"><span><input id="crudDActive" type="checkbox" '+(d.active!==false?"checked":"")+'> Nội dung đang hoạt động</span></label>'+
      '<div class="field full"><button id="crudSaveD" type="button" class="btn primary">Lưu nội dung</button></div></div>');
    $("#crudSaveD").onclick=async()=>{
      try{
        await API.updateDivisionFull(d.id,{
          name:$("#crudDName").value.trim(),eventType:$("#crudDType").value,format:$("#crudDFormat").value,
          bestOf:Number($("#crudDBest").value),pointsToWin:Number($("#crudDPoints").value),
          advanceCount:Number($("#crudDAdvance").value),winByTwo:$("#crudDWin2").checked,active:$("#crudDActive").checked
        });
        close();await ctx.refresh();ctx.toast("Đã cập nhật nội dung.");
      }catch(e){ctx.toast("Không thể cập nhật: "+e.message)}
    };
  }

  async function decorate(ctx){
    if(!ctx?.user||!["super_admin","organizer"].includes(ctx.user.role))return;
    const page=ctx.page;

    if(page==="tournaments"){
      ctx.state.tournaments.forEach(t=>{
        const card=document.querySelector('[data-tournament-card="'+t.id+'"]');if(!card)return;
        const actions=card.querySelector(".actions");if(!actions||actions.dataset.crud)return;actions.dataset.crud="1";
        actions.insertAdjacentHTML("beforeend",'<button class="mini" data-crud-edit-tournament="'+t.id+'">Sửa</button><button class="mini danger-mini" data-crud-delete-tournament="'+t.id+'">Hủy/Xóa</button>');
      });
      document.querySelectorAll("[data-crud-edit-tournament]").forEach(b=>b.onclick=()=>editTournament(ctx.state.tournaments.find(t=>t.id===b.dataset.crudEditTournament),ctx));
      document.querySelectorAll("[data-crud-delete-tournament]").forEach(b=>b.onclick=()=>danger("Hủy/xóa giải này? Dữ liệu đã có lịch sử sẽ được lưu lại.",()=>API.deleteTournament(b.dataset.crudDeleteTournament),ctx));
    }

    if(page==="players"){
      const roster=await API.players().catch(()=>[]);
      roster.forEach(p=>{
        const row=document.querySelector('[data-player-row="'+p.id+'"]');if(!row)return;
        const cell=row.lastElementChild;if(!cell||cell.dataset.crud)return;cell.dataset.crud="1";
        cell.insertAdjacentHTML("beforeend",' <button class="mini" data-crud-edit-player="'+p.id+'">Sửa</button>'+(p.active?'<button class="mini danger-mini" data-crud-disable-player="'+p.id+'">Khóa</button>':''));
      });
      ctx.state.teams.forEach(t=>{
        const row=document.querySelector('[data-team-row="'+t.id+'"]');if(!row||row.dataset.crud)return;row.dataset.crud="1";
        const td=document.createElement("td");td.innerHTML='<div class="actions"><button class="mini" data-crud-edit-team="'+t.id+'">Sửa</button><button class="mini danger-mini" data-crud-delete-team="'+t.id+'">Rút/Xóa</button></div>';row.appendChild(td);
      });
      const teamTable=document.querySelectorAll(".table")[1];if(teamTable&&!teamTable.querySelector("thead th[data-crud-head]")){const th=document.createElement("th");th.dataset.crudHead="1";th.textContent="Thao tác";teamTable.querySelector("thead tr")?.appendChild(th)}
      document.querySelectorAll("[data-crud-edit-player]").forEach(b=>b.onclick=()=>editPlayer(roster.find(p=>p.id===b.dataset.crudEditPlayer),ctx));
      document.querySelectorAll("[data-crud-disable-player]").forEach(b=>b.onclick=()=>danger("Khóa VĐV này khỏi danh sách công khai?",()=>API.deactivatePlayer(b.dataset.crudDisablePlayer),ctx));
      document.querySelectorAll("[data-crud-edit-team]").forEach(b=>b.onclick=()=>editTeam(ctx.state.teams.find(t=>t.id===b.dataset.crudEditTeam),ctx));
      document.querySelectorAll("[data-crud-delete-team]").forEach(b=>b.onclick=()=>danger("Rút/xóa đội này? Nếu đã có lịch sử thi đấu, hệ thống chỉ đánh dấu rút giải.",()=>API.deleteTeam(b.dataset.crudDeleteTeam),ctx));
    }

    if(page==="courts"){
      ctx.state.courts.forEach(c=>{
        const card=document.querySelector('[data-court-card="'+c.id+'"]');if(!card||card.dataset.crud)return;card.dataset.crud="1";
        card.insertAdjacentHTML("beforeend",'<div class="actions" style="margin-top:12px"><button class="mini" data-crud-edit-court="'+c.id+'">Sửa sân</button><button class="mini danger-mini" data-crud-delete-court="'+c.id+'">Khóa/Xóa</button></div>');
      });
      document.querySelectorAll("[data-crud-edit-court]").forEach(b=>b.onclick=()=>editCourt(ctx.state.courts.find(c=>c.id===b.dataset.crudEditCourt),ctx));
      document.querySelectorAll("[data-crud-delete-court]").forEach(b=>b.onclick=()=>danger("Khóa/xóa sân này? Lịch sử sử dụng sẽ được giữ lại.",()=>API.deleteCourt(b.dataset.crudDeleteCourt),ctx));
    }

    if(page==="matches"){
      document.querySelectorAll("[data-match-card]").forEach(card=>{
        const id=card.dataset.matchCard,m=ctx.state.matches.find(x=>x.id===id);if(!m||m.status==="done")return;
        const actions=card.querySelector(".actions");if(!actions||actions.dataset.crud)return;actions.dataset.crud="1";
        actions.insertAdjacentHTML("beforeend",'<button class="mini danger-mini" data-crud-delete-match="'+id+'">Hủy trận</button>');
      });
      document.querySelectorAll("[data-crud-delete-match]").forEach(b=>b.onclick=()=>danger("Hủy trận này? Nếu trận đã bắt đầu, lịch sử điểm vẫn được giữ.",()=>API.deleteMatch(b.dataset.crudDeleteMatch),ctx));
    }

    if(page==="settings"){
      ctx.state.divisions.forEach(d=>{
        const match=[...document.querySelectorAll(".rules-grid .panel")].find(x=>x.querySelector("h2")?.textContent===d.name);
        if(!match||match.dataset.crud)return;match.dataset.crud="1";
        match.insertAdjacentHTML("beforeend",'<div class="actions" style="margin-top:14px"><button class="mini" data-crud-edit-division="'+d.id+'">Sửa đầy đủ</button><button class="mini danger-mini" data-crud-delete-division="'+d.id+'">Khóa/Xóa</button></div>');
      });
      document.querySelectorAll("[data-crud-edit-division]").forEach(b=>b.onclick=()=>editDivision(ctx.state.divisions.find(d=>d.id===b.dataset.crudEditDivision),ctx));
      document.querySelectorAll("[data-crud-delete-division]").forEach(b=>b.onclick=()=>danger("Khóa/xóa nội dung này? Nếu đã có trận/đăng ký, lịch sử sẽ được giữ.",()=>API.deleteDivision(b.dataset.crudDeleteDivision),ctx));
    }
  }

  window.AdminCrud={decorate};
})();