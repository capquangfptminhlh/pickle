const token=new URLSearchParams(location.search).get("token");
const $=s=>document.querySelector(s);
const renderedCheckins=new Map();
async function load(animateConfirmed=false){
  if(!token){$("#checkinTeam").textContent="QR không hợp lệ";$("#checkinMeta").textContent="Thiếu mã check-in.";$("#checkinState").textContent="!";return}
  try{
    const r=await PickleAPI.publicCheckin(token);
    const checkinId=String(r.registration_id||r.id||token),previous=renderedCheckins.get(checkinId);
    const animateCheckedIn=animateConfirmed&&Boolean(r.checked_in_at)&&Boolean(previous&&!previous.checkedIn);
    $("#checkinTeam").textContent=r.team_name||"Đội chưa đặt tên";
    $("#checkinTeam").setAttribute("data-motion-key","registration:"+checkinId);
    $("#checkinMeta").textContent=[r.tournament_name,r.division_name,r.start_at?new Date(r.start_at).toLocaleString("vi-VN"):null].filter(Boolean).join(" • ");
    if(r.status==="cancelled"){
      $("#checkinState").textContent="!";
      $("#checkinState").classList.remove("success");
      $("#checkinStatus").innerHTML='<span class="status-chip warning">ĐÃ HỦY</span>';
      $("#checkinNote").textContent="Đăng ký đã hủy. Vui lòng liên hệ BTC để đăng ký lại.";
      $("#confirmCheckin").hidden=true;
      return;
    }
    if(r.checked_in_at){
      $("#checkinState").textContent="✓";
      $("#checkinState").classList.add("success");
      $("#checkinTeam").setAttribute("data-motion-state","checked-in");
      if(animateCheckedIn){
        $("#checkinTeam").setAttribute("data-motion-success","1");
        setTimeout(()=>$("#checkinTeam").removeAttribute("data-motion-success"),760);
      }
      $("#checkinStatus").innerHTML='<span class="status-chip success">ĐÃ CHECK-IN</span><small class="muted-block">'+new Date(r.checked_in_at).toLocaleString("vi-VN")+'</small>';
      $("#confirmCheckin").hidden=true;
    }else{
      $("#checkinTeam").removeAttribute("data-motion-state");
      $("#checkinTeam").removeAttribute("data-motion-success");
      $("#checkinState").textContent="QR";
      $("#checkinStatus").innerHTML='<span class="status-chip warning">CHƯA CHECK-IN</span>';
      $("#confirmCheckin").hidden=false;
    }
    renderedCheckins.set(checkinId,{signature:JSON.stringify([r.status||"",r.checked_in_at||""]),checkedIn:Boolean(r.checked_in_at)});
    if(animateCheckedIn)window.PickleMotion?.matchWin?.($("#checkinTeam"));
  }catch(e){
    $("#checkinState").textContent="!";
    $("#checkinTeam").textContent="Không tìm thấy đăng ký";
    $("#checkinMeta").textContent="Mã QR không tồn tại hoặc đã bị thu hồi.";
    $("#confirmCheckin").hidden=true;
  }
}
$("#confirmCheckin").onclick=async()=>{
  const control=$("#confirmCheckin");
  try{await PickleAPI.confirmCheckin(token);await load(true)}
  catch(e){
    if(e.message==="REGISTRATION_CANCELLED"){await load()}
    else if(e.status===401){location.href="login.html?return="+encodeURIComponent(location.href)}
    else {window.PickleMotion?.error?.(control);$("#checkinNote").textContent="Không thể xác nhận: "+e.message}
  }
};
load();
