(()=>{
  const form=document.querySelector("#loginForm"),email=document.querySelector("#email"),password=document.querySelector("#password"),error=document.querySelector("#error");
  const rawNext=new URLSearchParams(location.search).get("next")||"";
  const safeNext=/^[a-zA-Z0-9._-]+(?:\?[a-zA-Z0-9%&=._-]*)?$/.test(rawNext)&&!rawNext.startsWith(".")?rawNext:"";
  const destination=user=>safeNext||(user?.role==="referee"?"referee.html":"admin.html");
  PickleAPI.session().then(s=>{if(s?.user)location.href=destination(s.user)}).catch(()=>{});
  form?.addEventListener("submit",async e=>{
    e.preventDefault();error.textContent="";
    try{const data=await PickleAPI.login(email.value,password.value);location.href=destination(data?.user)}
    catch(err){error.textContent=err.status===429?"Đăng nhập quá nhiều lần. Vui lòng chờ rồi thử lại.":err.status===401?"Email hoặc mật khẩu không đúng.":"Không thể đăng nhập. Vui lòng thử lại."}
  });
})();