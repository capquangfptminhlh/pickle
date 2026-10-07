(()=>{
  const MAX_BYTES=3*1024*1024;
  const ALLOWED_TYPES=new Set(["image/jpeg","image/png","image/webp"]);

  function initials(value){
    const parts=String(value||"").trim().split(/\s+/).filter(Boolean);
    return (parts.length?`${parts[0][0]}${parts.length>1?parts.at(-1)[0]:""}`:"VĐV").toLocaleUpperCase("vi");
  }

  function validateFile(file){
    if(!file)return "";
    if(!ALLOWED_TYPES.has(file.type))return "Chỉ nhận ảnh JPG, PNG hoặc WebP.";
    if(file.size>MAX_BYTES)return "Ảnh tối đa 3MB.";
    return "";
  }

  function mount({root,nameInput}){
    if(!root||!nameInput)throw new Error("AVATAR_PICKER_TARGET_REQUIRED");
    root.innerHTML=`
      <div class="player-avatar-create-preview" aria-live="polite">
        <span class="player-avatar-create-initials">VĐV</span>
        <img alt="Ảnh đại diện VĐV đã chọn" hidden>
      </div>
      <div class="player-avatar-create-copy">
        <strong>Ảnh đại diện</strong>
        <span>JPG, PNG hoặc WebP · tối đa 3MB</span>
        <div class="player-avatar-create-actions">
          <label class="mini player-avatar-create-pick">Chọn ảnh<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
          <button type="button" class="mini player-avatar-create-remove" hidden>Xóa ảnh</button>
        </div>
        <span class="player-avatar-create-status" role="status" aria-live="polite"></span>
      </div>`;
    const input=root.querySelector('input[type="file"]');
    const image=root.querySelector("img");
    const fallback=root.querySelector(".player-avatar-create-initials");
    const pick=root.querySelector(".player-avatar-create-pick");
    const remove=root.querySelector(".player-avatar-create-remove");
    const status=root.querySelector(".player-avatar-create-status");
    let selected=null,objectUrl="";

    const updateInitials=()=>{fallback.textContent=initials(nameInput.value)};
    const releaseUrl=()=>{if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=""}};
    const setStatus=(message="",tone="")=>{
      status.textContent=message;
      if(tone)status.dataset.tone=tone;else delete status.dataset.tone;
    };
    const clear=({announce=true}={})=>{
      selected=null;input.value="";releaseUrl();image.removeAttribute("src");image.hidden=true;fallback.hidden=false;
      pick.firstChild.textContent="Chọn ảnh";remove.hidden=true;updateInitials();
      if(announce)setStatus("Đã bỏ ảnh, hệ thống sẽ dùng chữ viết tắt.","success");
    };
    const choose=file=>{
      const error=validateFile(file);
      if(error){input.value="";setStatus(error,"error");return false}
      if(!file)return false;
      selected=file;releaseUrl();objectUrl=URL.createObjectURL(file);image.src=objectUrl;image.hidden=false;fallback.hidden=true;
      pick.firstChild.textContent="Thay ảnh";remove.hidden=false;setStatus(`Đã chọn ${file.name}.`,"success");return true;
    };
    input.addEventListener("change",()=>choose(input.files?.[0]));
    remove.addEventListener("click",()=>clear());
    nameInput.addEventListener("input",updateInitials);
    updateInitials();

    return {
      file:()=>selected,
      clear,
      setStatus,
      setBusy(busy){input.disabled=busy;pick.classList.toggle("is-disabled",busy);remove.disabled=busy;root.setAttribute("aria-busy",String(Boolean(busy)))},
      destroy(){nameInput.removeEventListener("input",updateInitials);releaseUrl()}
    };
  }

  window.PicklePlayerAvatarInput={MAX_BYTES,validateFile,mount};
})();
