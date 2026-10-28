/* Keyboard-friendly command launcher. Draws internal actions from role-filtered navigation. */
(()=>{
  "use strict";
  const dialog=document.getElementById("opsLauncher");
  const openButton=document.getElementById("opsOpenLauncher");
  const closeButton=document.getElementById("opsLauncherClose");
  const input=document.getElementById("opsLauncherSearch");
  const results=document.getElementById("opsLauncherResults");
  if(!dialog||!openButton||!closeButton||!input||!results)return;

  const safeNormalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  const external=[
    {label:"Open Play Studio",url:"/open-play-admin.html"},
    {label:"Tìm buổi Open Play",url:"/open-play-discover.html"},
    {label:"Bảng điểm Open Play",url:"/open-play-referee.html"},
    {label:"Trang công khai",url:"/"}
  ];
  const internal=()=>[...document.querySelectorAll("#nav button[data-page]")].map(node=>({
    label:node.textContent.trim(),node
  }));
  const render=()=>{
    results.replaceChildren();
    const query=safeNormalize(input.value);
    let count=0;
    for(const entry of internal()){
      if(!safeNormalize(entry.label).includes(query))continue;
      const button=document.createElement("button");
      button.type="button";
      button.textContent=entry.label;
      button.addEventListener("click",()=>{
        dialog.close();
        entry.node.click();
      });
      results.appendChild(button);count++;
    }
    for(const entry of external){
      if(!safeNormalize(entry.label).includes(query))continue;
      const link=document.createElement("a");
      link.textContent=entry.label;
      link.href=entry.url;
      results.appendChild(link);count++;
    }
    if(!count){
      const note=document.createElement("p");
      note.textContent="Không tìm thấy chức năng phù hợp với quyền hiện tại.";
      note.setAttribute("role","status");
      results.appendChild(note);
    }
  };
  const open=()=>{
    render();
    if(!dialog.open)dialog.showModal();
    input.focus();
  };
  openButton.addEventListener("click",open);
  closeButton.addEventListener("click",()=>dialog.close());
  input.addEventListener("input",render);
  input.addEventListener("keydown",event=>{
    if(event.key==="Enter"){
      const first=results.querySelector("button,a");
      if(first){event.preventDefault();first.click()}
    }
  });
  dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});
  document.addEventListener("keydown",event=>{
    const el=event.target;
    const typing=el?.matches?.("input,textarea,select,[contenteditable]");
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){
      event.preventDefault();dialog.open?dialog.close():open();
    }else if(event.key==="/"&&!typing&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!dialog.open){
      event.preventDefault();open();
    }
  });
})();
