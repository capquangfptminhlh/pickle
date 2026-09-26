(()=>{
  const form=document.querySelector("#loginForm"),email=document.querySelector("#email"),password=document.querySelector("#password"),error=document.querySelector("#error");
  PickleAPI.session().then(s=>{if(s?.user)location.href="admin.html"}).catch(()=>{});
  form?.addEventListener("submit",async e=>{
    e.preventDefault();error.textContent="";
    try{await PickleAPI.login(email.value,password.value);location.href="admin.html"}
    catch(err){error.textContent=err.status===429?"Đăng nhập quá nhiều lần. Vui lòng chờ rồi thử lại.":err.status===401?"Email hoặc mật khẩu không đúng.":"Không thể đăng nhập. Vui lòng thử lại."}
  });
})();