(()=>{
  const KEY="pickle-local-state-v1",API="https://pickleup.vn";
  const $=s=>document.querySelector(s);
  let state=null;
  const counts=()=>({
    "Giải":state?.tournaments?.length||0,"VĐV":state?.players?.length||0,"Cặp/đội":state?.teams?.length||0,"Trận":state?.matches?.length||0,
    "Sân":state?.courts?.length||0,"CLB":state?.clubs?.length||0,"Đăng ký":state?.registrations?.length||0,"Hoạt động":state?.clubEvents?.length||0
  });
  const setResult=(msg,type="")=>{const el=$("#result");el.textContent=msg;el.className="status "+type};
  function load(){
    try{state=JSON.parse(localStorage.getItem(KEY)||"null")}catch{state=null}
    const has=state&&typeof state==="object"&&((state.tournaments?.length||0)||(state.players?.length||0)||(state.clubs?.length||0));
    $("#legacyStatus").textContent=has?"Đã tìm thấy dữ liệu cũ trên trình duyệt này. Có thể sao lưu và chuyển sang D1.":"Không tìm thấy dữ liệu cũ trên trình duyệt này. Hãy mở trang này bằng đúng thiết bị/trình duyệt trước đây từng dùng bản GitHub Pages.";
    $("#legacyStatus").className="status "+(has?"ok":"bad");
    $("#migrateBtn").disabled=!has;$("#backupBtn").disabled=!has;
    $("#metrics").innerHTML=Object.entries(counts()).map(([k,v])=>'<div class="metric"><b>'+v+'</b><span>'+k.toUpperCase()+'</span></div>').join("");
  }
  $("#backupBtn").onclick=()=>{
    if(!state)return;
    const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download="pickleup-legacy-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  $("#migrateBtn").onclick=async()=>{
    if(!state)return;
    const email=$("#email").value.trim(),password=$("#password").value,btn=$("#migrateBtn");
    if(!email||!password)return setResult("Nhập email và mật khẩu Super Admin.","bad");
    btn.disabled=true;btn.textContent="Đang chuyển dữ liệu…";setResult("Đang đăng nhập và chuyển dữ liệu. Không đóng trang này.");
    try{
      const login=await fetch(API+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
      const auth=await login.json();if(!login.ok)throw new Error(auth.error||"LOGIN_FAILED");
      if(auth.user?.role!=="super_admin")throw new Error("SUPER_ADMIN_REQUIRED");
      const res=await fetch(API+"/api/admin/import-legacy-state",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+auth.token},body:JSON.stringify({state})});
      const data=await res.json();if(!res.ok)throw new Error(data.error||"IMPORT_FAILED");
      const c=data.counts||{},summary=["Giải "+(c.tournaments||0),"VĐV "+(c.players||0),"Cặp/đội "+(c.teams||0),"Trận "+(c.matches||0),"Sân "+(c.courts||0)].join(" • ");
      setResult("CHUYỂN DỮ LIỆU THÀNH CÔNG\n"+summary+(data.warnings?.length?"\n\nLưu ý: "+data.warnings.join(" "):""),"ok");
      localStorage.setItem("pickle-legacy-migrated-at",new Date().toISOString());
    }catch(e){
      const map={INVALID_CREDENTIALS:"Sai email hoặc mật khẩu.",SUPER_ADMIN_REQUIRED:"Tài khoản này không phải Super Admin.",LEGACY_STATE_EMPTY:"Dữ liệu cũ đang rỗng.",FORBIDDEN:"Không có quyền import."};
      setResult(map[e.message]||("Chuyển dữ liệu thất bại: "+e.message),"bad");
    }finally{btn.disabled=false;btn.textContent="Chuyển dữ liệu sang D1"}
  };
  load();
})();