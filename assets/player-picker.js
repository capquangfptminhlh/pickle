(()=>{
  const emptyMessage="VĐV chưa có trong hệ thống. Hãy tạo hồ sơ tại Bảng VĐV / Rating trước.";
  const normalize=value=>String(value||"").trim().toLocaleLowerCase("vi");
  const initials=name=>String(name||"VĐV").trim().split(/\s+/).slice(-2).map(part=>part[0]||"").join("").toUpperCase();

  function mount({root,players=[],count=2,slotLabels=[],excludedIds=[],selectedIds=[],onChange=()=>{},formatRating=value=>Number(value||0).toFixed(2)}){
    if(!root)throw new Error("PLAYER_PICKER_ROOT_REQUIRED");
    let slotCount=Math.max(1,Number(count)||1),excluded=new Set(excludedIds),selected=[...selectedIds];
    const initialSelection=new Set(selectedIds);
    const activePlayers=players.filter(player=>player.active!==false&&player.active!==0);
    root.setAttribute("data-player-picker","");

    const values=()=>selected.filter(Boolean);
    const playerById=id=>players.find(player=>player.id===id);
    const availableFor=index=>activePlayers.filter(player=>!excluded.has(player.id)&&!selected.some((id,slot)=>slot!==index&&id===player.id));

    function playerSummary(player){
      const wrap=document.createElement("span");wrap.className="player-picker-person";
      if(player.avatar_url){
        const img=document.createElement("img");img.src=player.avatar_url;img.alt="";wrap.appendChild(img);
      }else{
        const avatar=document.createElement("span");avatar.className="player-picker-avatar";avatar.textContent=initials(player.full_name);wrap.appendChild(avatar);
      }
      const copy=document.createElement("span"),name=document.createElement("strong"),meta=document.createElement("small");
      name.textContent=player.full_name||"VĐV";
      meta.textContent=[player.nickname?`“${player.nickname}”`:"",player.club_name||"Tự do",`Trình ${player.skillLevel||player.skill_level||"chưa nhập"}`,`Rating ${formatRating(player.rating)}`,player.active===false||player.active===0?"Hồ sơ đã khóa":""].filter(Boolean).join(" • ");
      copy.append(name,meta);wrap.appendChild(copy);return wrap;
    }

    function renderResults(index,query){
      const host=root.querySelector(`[data-player-results="${index}"]`);if(!host)return;
      host.innerHTML="";
      const needle=normalize(query);
      const matches=availableFor(index).filter(player=>{
        const haystack=normalize([player.full_name,player.nickname,player.club_name,player.phone].filter(Boolean).join(" "));
        return !needle||haystack.includes(needle);
      }).slice(0,12);
      if(!matches.length){
        const empty=document.createElement("p");empty.className="player-picker-empty";empty.textContent=emptyMessage;host.appendChild(empty);return;
      }
      for(const player of matches){
        const button=document.createElement("button");button.type="button";button.className="player-picker-result";button.setAttribute("data-player-result","");button.dataset.playerId=player.id;
        button.appendChild(playerSummary(player));
        button.addEventListener("click",()=>{selected[index]=player.id;render();onChange(values())});
        host.appendChild(button);
      }
    }

    function render(){
      root.innerHTML="";
      selected=Array.from({length:slotCount},(_,index)=>selected[index]&&(!excluded.has(selected[index])||initialSelection.has(selected[index]))?selected[index]:null);
      for(let index=0;index<slotCount;index++){
        const slot=document.createElement("div");slot.className="player-picker-slot";slot.dataset.playerPickerSlot=String(index);
        const label=document.createElement("label");label.className="field full";label.append(slotLabels[index]||`VĐV ${index+1}`);
        const input=document.createElement("input");input.type="search";input.autocomplete="off";input.placeholder="Tìm tên, biệt danh, CLB hoặc điện thoại";input.dataset.playerSearch=String(index);label.appendChild(input);
        const results=document.createElement("div");results.className="player-picker-results";results.dataset.playerResults=String(index);
        const chosen=document.createElement("div");chosen.className="player-picker-selected";chosen.dataset.playerSelected=String(index);chosen.hidden=true;
        slot.append(label,results,chosen);root.appendChild(slot);
        const player=playerById(selected[index]);
        if(player){
          label.hidden=true;results.hidden=true;chosen.hidden=false;chosen.appendChild(playerSummary(player));
          const remove=document.createElement("button");remove.type="button";remove.className="mini";remove.textContent="Chọn lại";
          remove.addEventListener("click",()=>{selected[index]=null;render();onChange(values());root.querySelector(`[data-player-search="${index}"]`)?.focus()});
          chosen.appendChild(remove);
        }else{
          input.addEventListener("focus",()=>renderResults(index,input.value));
          input.addEventListener("input",()=>renderResults(index,input.value));
        }
      }
    }

    render();
    return {
      values,
      setCount(next){slotCount=Math.max(1,Number(next)||1);selected=selected.slice(0,slotCount);render();onChange(values())},
      setExcluded(ids){excluded=new Set(ids||[]);render();onChange(values())},
      destroy(){root.innerHTML="";root.removeAttribute("data-player-picker")}
    };
  }

  window.PicklePlayerPicker={mount,emptyMessage};
})();
