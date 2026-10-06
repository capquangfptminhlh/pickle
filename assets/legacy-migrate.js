(()=>{
  const KEY="pickle-local-state-v1",API="https://pickleup.vn";
  const $=s=>document.querySelector(s);
  let state=null,sourceName="trình duyệt này",selectionVersion=0;
  const hasData=value=>value&&typeof value==="object"&&!Array.isArray(value)&&["tournaments","players","clubs"].some(key=>Array.isArray(value[key])&&value[key].length);
  const collectionCount=key=>Array.isArray(state?.[key])?state[key].length:0;
  const counts=()=>({
    "Giải":collectionCount("tournaments"),"VĐV":collectionCount("players"),"Cặp/đội":collectionCount("teams"),"Trận":collectionCount("matches"),
    "Sân":collectionCount("courts"),"CLB":collectionCount("clubs"),"Đăng ký":collectionCount("registrations"),"Hoạt động":collectionCount("clubEvents")
  });
  const setResult=(msg,type="")=>{const el=$("#result");el.textContent=msg;el.className="status "+type};
  function showSource(error=""){
    const has=hasData(state);
    $("#legacyStatus").textContent=error||(has?"Đã nhận dữ liệu từ "+sourceName+". Bạn có thể sao lưu và khôi phục lên Pickleup.vn.":"Chưa tìm thấy dữ liệu trên trình duyệt này. Hãy chọn tệp sao lưu JSON để tiếp tục.");
    $("#legacyStatus").className="status "+(has?"ok":"bad");
    $("#migrateBtn").disabled=!has;$("#backupBtn").disabled=!has;
    $("#metrics").innerHTML=Object.entries(counts()).map(([k,v])=>'<div class="metric"><b>'+v+'</b><span>'+k.toUpperCase()+'</span></div>').join("");
  }
  $("#backupFile").onchange=async()=>{
    const version=++selectionVersion,file=$("#backupFile").files?.[0];
    state=null;showSource();
    if(!file)return;
    try{
      if(file.size>20*1024*1024)throw new Error("Tệp JSON vượt quá 20 MB.");
      const parsed=JSON.parse(await file.text());
      if(version!==selectionVersion)return;
      if(!hasData(parsed))throw new Error("Tệp sao lưu không hợp lệ hoặc không có dữ liệu giải, VĐV, CLB.");
      state=parsed;sourceName=file.name;showSource();setResult("Đã đọc tệp. Chưa gửi dữ liệu lên website.");
    }catch(e){if(version===selectionVersion)showSource(e instanceof SyntaxError?"Tệp JSON không hợp lệ.":e.message)}
  };
  $("#backupBtn").onclick=()=>{
    if(!state)return;
    const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download="pickleup-legacy-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  $("#migrateBtn").onclick=async()=>{
    if(!state)return;
    const email=$("#email").value.trim(),password=$("#password").value,btn=$("#migrateBtn");
    if(!email||!password)return setResult("Nhập email và mật khẩu Super Admin.","bad");
    btn.disabled=true;$("#backupFile").disabled=true;btn.textContent="Đang khôi phục…";setResult("Đang đăng nhập và khôi phục dữ liệu. Không đóng trang này.");
    try{
      const login=await fetch(API+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
      const auth=await login.json();if(!login.ok)throw new Error(auth.error||"LOGIN_FAILED");
      if(auth.user?.role!=="super_admin")throw new Error("SUPER_ADMIN_REQUIRED");
      const res=await fetch(API+"/api/admin/import-legacy-state",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+auth.token},body:JSON.stringify({state})});
      const data=await res.json();if(!res.ok)throw new Error(data.error||"IMPORT_FAILED");
      const c=data.counts||{},summary=["Giải "+(c.tournaments||0),"VĐV "+(c.players||0),"Cặp/đội "+(c.teams||0),"Trận "+(c.matches||0),"Sân "+(c.courts||0)].join(" • ");
      const skipped=Object.values(data.skipped||{}).reduce((sum,n)=>sum+Number(n||0),0);
      setResult("KHÔI PHỤC THÀNH CÔNG\nĐã thêm mới: "+summary+(skipped?"\nĐã giữ nguyên "+skipped+" bản ghi đã có trên hệ thống.":"")+(data.warnings?.length?"\n\nLưu ý: "+data.warnings.join(" "):""),"ok");
      localStorage.setItem("pickle-legacy-migrated-at",new Date().toISOString());
    }catch(e){
      const map={INVALID_CREDENTIALS:"Sai email hoặc mật khẩu.",SUPER_ADMIN_REQUIRED:"Tài khoản này không phải Super Admin.",LEGACY_STATE_EMPTY:"Dữ liệu cũ đang rỗng.",FORBIDDEN:"Không có quyền khôi phục.",LEGACY_IMPORT_CONFLICT:"Dữ liệu vừa thay đổi trên hệ thống. Hãy đăng nhập và chạy lại; dữ liệu đã có được giữ nguyên."};
      setResult(map[e.message]||("Chuyển dữ liệu thất bại: "+e.message),"bad");
    }finally{$("#password").value="";$("#backupFile").disabled=false;btn.disabled=!hasData(state);btn.textContent="Khôi phục lên Pickleup.vn"}
  };
  try{state=JSON.parse(localStorage.getItem(KEY)||"null")}catch{state=null}
  showSource();
})();
