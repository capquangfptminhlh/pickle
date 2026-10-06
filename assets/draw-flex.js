(function drawFlexExtension(){
  const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));

  function labels(count){
    return Array.from({length:Math.max(1,Math.min(26,Number(count||1)))},(_,i)=>String.fromCharCode(65+i));
  }

  function selectedCourtIds(modal){
    return [...modal.querySelectorAll("[data-flex-court]:checked")].map(x=>x.value);
  }

  async function openFlexibleDraw(btn){
    const divisionId=btn.dataset.autoDraw;
    const division=state.divisions.find(x=>x.id===divisionId);
    if(!division)return toast("Không tìm thấy nội dung thi đấu.");
    const tournamentId=division.tournamentId;
    const teams=state.teams.filter(x=>x.divisionId===divisionId&&x.status!=="withdrawn");
    const n=teams.length;
    if(n<4)return toast("Cần ít nhất 4 cặp/đội để chia bảng.");

    const courts=state.courts
      .filter(x=>x.tournamentId===tournamentId&&x.active!==false)
      .sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)||String(a.name).localeCompare(String(b.name),"vi"));
    if(!courts.length)return toast("Giải chưa có sân hoạt động. Hãy tạo sân trước.");

    const saved=await API.drawConfig(divisionId).catch(()=>({}));
    const defaultPer=Math.max(2,Number(saved.teamsPerGroup||4));
    const defaultGroups=Math.max(1,Math.min(26,Number(saved.groupCount||Math.ceil(n/defaultPer))));

    const modal=document.createElement("dialog");
    modal.className="draw-setup-overlay";
    modal.setAttribute("aria-label",`Thiết lập chia bảng: ${division.name||"Nội dung thi đấu"}`);
    modal.innerHTML=`<div class="draw-setup-card">
      <div class="draw-setup-head">
        <div><span>THIẾT LẬP CHIA BẢNG</span><h2>${esc(division.name||"Nội dung thi đấu")}</h2><p>${n} cặp/đội • setup xong mới quay công khai realtime</p></div>
        <button type="button" class="icon-btn" data-flex-close aria-label="Đóng">✕</button>
      </div>
      <div class="draw-config-grid">
        <label class="field">Cách chia
          <select data-flex-mode>
            <option value="random">🎡 Quay ngẫu nhiên</option>
            <option value="seeded">⚖️ Cân bằng hạt giống</option>
            <option value="manual">✍️ Xếp thủ công</option>
          </select>
        </label>
        <label class="field">Số bảng<input type="number" min="1" max="26" value="${defaultGroups}" data-flex-groups></label>
        <label class="field">Tối đa đội / bảng<input type="number" min="2" max="32" value="${defaultPer}" data-flex-per-group></label>
        <label class="field">Lấy vào vòng trong / bảng<input type="number" min="1" max="16" value="${Math.max(1,Number(saved.advanceCount||division.advanceCount||2))}" data-flex-advance></label>
      </div>
      <div class="draw-setup-section">
        <div class="draw-section-title"><b>🏟 Sân được phép dùng</b><small>Chọn một hoặc nhiều sân</small></div>
        <div class="draw-court-chips" data-flex-courts></div>
      </div>
      <div class="draw-setup-section">
        <div class="draw-section-title"><b>📋 Bảng & sân ưu tiên</b><small>Mỗi bảng có thể khóa 1 sân hoặc luân phiên</small></div>
        <div data-flex-group-courts></div>
      </div>
      <div class="draw-setup-section" data-flex-manual-section hidden>
        <div class="draw-section-title"><b>✍️ Xếp đội thủ công</b><small>Chọn bảng cho từng cặp/đội</small></div>
        <div class="draw-manual-list" data-flex-manual></div>
      </div>
      <div class="draw-setup-summary" data-flex-summary></div>
      <div class="draw-setup-actions">
        <button type="button" class="btn secondary" data-flex-save>💾 Lưu thiết lập</button>
        <button type="button" class="btn primary" data-flex-run>🎡 QUAY & CÔNG KHAI REALTIME</button>
      </div>
    </div>`;
    document.body.appendChild(modal);

    const modeEl=modal.querySelector("[data-flex-mode]");
    const groupsEl=modal.querySelector("[data-flex-groups]");
    const perEl=modal.querySelector("[data-flex-per-group]");
    const advanceEl=modal.querySelector("[data-flex-advance]");
    const courtsHost=modal.querySelector("[data-flex-courts]");
    modeEl.value=["random","seeded","manual"].includes(saved.mode)?saved.mode:"random";

    courtsHost.innerHTML=courts.map(court=>{
      const checked=!saved.courtIds?.length||saved.courtIds.includes(court.id);
      return `<label><input type="checkbox" value="${esc(court.id)}" data-flex-court ${checked?"checked":""}><span>${esc(court.name)}</span></label>`;
    }).join("");

    function rebuild(){
      const gs=labels(groupsEl.value);
      const chosen=selectedCourtIds(modal);
      const groupHost=modal.querySelector("[data-flex-group-courts]");
      groupHost.innerHTML=gs.map(g=>{
        const previous=saved.groupCourts?.[g]?.[0]||"";
        const options=courts
          .filter(c=>chosen.includes(c.id))
          .map(c=>`<option value="${esc(c.id)}" ${previous===c.id?"selected":""}>${esc(c.name)}</option>`)
          .join("");
        return `<div class="draw-group-row"><b>Bảng ${g}</b><select data-flex-group-court="${g}"><option value="">Luân phiên sân đã chọn</option>${options}</select></div>`;
      }).join("");

      const manualHost=modal.querySelector("[data-flex-manual]");
      manualHost.innerHTML=teams.map((team,i)=>{
        const current=saved.manualAssignments?.[team.id]||team.group||gs[i%gs.length];
        const options=gs.map(g=>`<option value="${g}" ${current===g?"selected":""}>Bảng ${g}</option>`).join("");
        return `<label><span><b>${esc(team.name)}</b><small>${esc(team.club||"Tự do")}</small></span><select data-flex-team="${esc(team.id)}">${options}</select></label>`;
      }).join("");

      modal.querySelector("[data-flex-manual-section]").hidden=modeEl.value!=="manual";
      const maxGroupSize=Math.ceil(n/gs.length);
      advanceEl.max=Math.max(1,maxGroupSize);
      if(Number(advanceEl.value)>maxGroupSize)advanceEl.value=Math.max(1,Math.min(2,maxGroupSize));
      const modeName=modeEl.options[modeEl.selectedIndex]?.text||"";
      modal.querySelector("[data-flex-summary]").innerHTML=
        `<b>Dự kiến:</b> ${gs.length} bảng • khoảng ${Math.floor(n/gs.length)}–${Math.ceil(n/gs.length)} đội/bảng • lấy Top ${advanceEl.value} • ${chosen.length} sân • ${esc(modeName)}`;
    }

    function makePayload(){
      const courtIds=selectedCourtIds(modal);
      if(!courtIds.length)throw new Error("Hãy chọn ít nhất 1 sân.");
      const groupCourts={};
      for(const g of labels(groupsEl.value)){
        const courtId=modal.querySelector(`[data-flex-group-court="${g}"]`)?.value;
        groupCourts[g]=courtId?[courtId]:courtIds;
      }
      const manualAssignments={};
      modal.querySelectorAll("[data-flex-team]").forEach(x=>manualAssignments[x.dataset.flexTeam]=x.value);
      return {
        mode:modeEl.value,
        groupCount:Number(groupsEl.value),
        teamsPerGroup:Number(perEl.value),
        advanceCount:Number(advanceEl.value),
        courtIds,
        groupCourts,
        manualAssignments
      };
    }

    modeEl.onchange=rebuild;
    groupsEl.oninput=()=>{
      groupsEl.value=Math.max(1,Math.min(26,Number(groupsEl.value||1)));
      perEl.value=Math.max(2,Math.ceil(n/Number(groupsEl.value)));
      rebuild();
    };
    perEl.oninput=()=>{
      perEl.value=Math.max(2,Math.min(32,Number(perEl.value||4)));
      groupsEl.value=Math.max(1,Math.ceil(n/Number(perEl.value)));
      rebuild();
    };
    advanceEl.oninput=rebuild;
    modal.querySelectorAll("[data-flex-court]").forEach(x=>x.onchange=rebuild);

    function closeModal(){
      modal.close();
      modal.remove();
    }
    modal.querySelector("[data-flex-close]").onclick=closeModal;
    modal.onclick=e=>{if(e.target===modal)closeModal()};
    modal.addEventListener("cancel",e=>{
      e.preventDefault();
      closeModal();
    });

    modal.querySelector("[data-flex-save]").onclick=async()=>{
      try{
        await API.saveDrawConfig(divisionId,makePayload());
        toast("Đã lưu thiết lập chia bảng.");
      }catch(e){toast("Không thể lưu: "+e.message)}
    };

    modal.querySelector("[data-flex-run]").onclick=async()=>{
      let payload;
      try{payload=makePayload()}catch(e){return toast(e.message)}
      const oldMatches=state.matches.filter(m=>m.divisionId===divisionId&&!m.bracketSlot&&((m.stage||"").startsWith("Bảng ")||m.stage==="Vòng bảng"));
      if(oldMatches.some(m=>m.status==="live"||m.status==="done"||m.status==="completed"||m.status==="walkover"||(m.sets||[]).length)){
        return toast("Vòng bảng đã bắt đầu nên không thể bốc thăm lại.");
      }
      if(!confirm(`Bắt đầu quay ${n} cặp/đội thành ${payload.groupCount} bảng và phát realtime cho người đang xem app?`))return;

      const card=modal.querySelector(".draw-setup-card");
      card.innerHTML=`<div class="draw-live-stage"><div class="draw-wheel"><div class="draw-wheel-ring"></div><strong>🎡</strong></div><h2>Đang quay bốc thăm...</h2><p>Mọi người đang online cũng đang thấy phiên quay này.</p></div>`;
      try{
        const result=await API.runDraw(divisionId,payload);
        await new Promise(resolve=>setTimeout(resolve,900));
        card.innerHTML=`<div class="draw-live-stage is-done"><div class="draw-result-icon">✓</div><h2>Đã chia bảng</h2><p>${result.groupCount} bảng • ${result.created} trận vòng bảng • Top ${result.advanceCount} đi tiếp</p><div class="draw-result-groups">${(result.groups||[]).map(g=>`<span><b>Bảng ${esc(g.group)}</b><small>${g.count} đội</small></span>`).join("")}</div></div>`;
        await new Promise(resolve=>setTimeout(resolve,900));
        closeModal();
        await refresh();
        document.querySelector("#genericDialog")?.close();
        await openTournamentDetail(tournamentId);
        toast(`Đã bốc thăm ${result.groupCount} bảng, tạo ${result.created} trận và phát realtime.`);
      }catch(e){
        closeModal();
        const msg={
          GROUP_STAGE_ALREADY_STARTED:"Vòng bảng đã bắt đầu.",
          GROUP_TOO_SMALL:"Mỗi bảng phải có ít nhất 2 đội.",
          GROUP_CAPACITY_EXCEEDED:"Số đội/bảng vượt cấu hình.",
          ADVANCE_COUNT_TOO_HIGH:"Số đội lấy vào vòng trong lớn hơn số đội của bảng.",
          MANUAL_GROUP_ASSIGNMENT_REQUIRED:"Chưa xếp đủ đội vào bảng.",
          NO_COURTS:"Chưa có sân hoạt động."
        }[e.message]||e.message;
        toast("Không thể bốc thăm: "+msg);
      }
    };

    rebuild();
    modal.showModal();
  }

  async function createFlexibleBracket(btn){
    const divisionId=btn.dataset.top2Bracket;
    const division=state.divisions.find(x=>x.id===divisionId);
    const advance=Math.max(1,Number(division?.advanceCount||2));
    if(!confirm(`Tạo nhánh đấu tự động từ Top ${advance} mỗi bảng?`))return;
    try{
      const result=await API.generateBracket(divisionId);
      await refresh();
      const tournamentId=division?.tournamentId;
      if(tournamentId){
        document.querySelector("#genericDialog")?.close();
        await openTournamentDetail(tournamentId);
      }
      toast(`Đã tạo nhánh loại trực tiếp ${result.created||0} trận từ Top ${advance} mỗi bảng.`);
    }catch(e){
      const msg={
        GROUP_STAGE_NOT_COMPLETE:"Vòng bảng chưa thi đấu xong.",
        BRACKET_ALREADY_EXISTS:"Nhánh đấu đã được tạo.",
        BRACKET_ALREADY_STARTED:"Nhánh đã có trận bắt đầu/kết quả nên không thể bốc lại.",
        NOT_ENOUGH_QUALIFIERS:"Chưa đủ đội đi tiếp.",
        ROUND_ROBIN_HAS_NO_KNOCKOUT:"Nội dung này chỉ thi đấu vòng tròn."
      }[e.message]||e.message;
      toast("Không thể tạo nhánh: "+msg);
    }
  }

  function polishButtons(){
    document.querySelectorAll("[data-auto-draw]").forEach(btn=>{
      const label="🎛 Thiết lập & bốc thăm";
      const title="Chọn số bảng, đội/bảng, sân, số đội đi tiếp hoặc xếp thủ công";
      if(btn.textContent!==label)btn.textContent=label;
      if(btn.title!==title)btn.title=title;
    });
    document.querySelectorAll("[data-top2-bracket]").forEach(btn=>{
      const d=state.divisions.find(x=>x.id===btn.dataset.top2Bracket);
      const advance=Math.max(1,Number(d?.advanceCount||2));
      const label=`🏆 Tạo nhánh Top ${advance}`;
      if(btn.textContent!==label)btn.textContent=label;
    });
    document.querySelectorAll("[data-center-draw]").forEach(btn=>{
      const label="🎡 Thiết lập / quay chia bảng";
      if(btn.textContent!==label)btn.textContent=label;
    });
  }

  document.addEventListener("click",e=>{
    const draw=e.target.closest?.("[data-auto-draw]");
    if(draw){
      e.preventDefault();e.stopImmediatePropagation();
      openFlexibleDraw(draw);
      return;
    }
    const center=e.target.closest?.("[data-center-draw]");
    if(center){
      const drawBtn=document.querySelector("[data-auto-draw]");
      if(drawBtn){
        e.preventDefault();e.stopImmediatePropagation();
        openFlexibleDraw(drawBtn);
      }
      return;
    }
    const bracket=e.target.closest?.("[data-top2-bracket]");
    if(bracket){
      e.preventDefault();e.stopImmediatePropagation();
      createFlexibleBracket(bracket);
    }
  },true);

  const observer=new MutationObserver(()=>polishButtons());
  observer.observe(document.documentElement,{subtree:true,childList:true});
  addEventListener("DOMContentLoaded",polishButtons);
  polishButtons();
})();
