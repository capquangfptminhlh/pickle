(()=>{
  const AUTH_KEY="pickle-preview-auth-v1";
  if(!location.hostname.endsWith(".github.io"))return;
  try{
    const s=JSON.parse(localStorage.getItem(AUTH_KEY)||"null");
    if(s?.user?.id)return;
  }catch{}
  location.replace("login.html");
})();