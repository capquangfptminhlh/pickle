const token=new URLSearchParams(location.search).get("token");
const $=s=>document.querySelector(s);
async function load(){
  if(!token){$("#checkinTeam").textContent="QR không hợp lệ";$("#checkinMeta").textContent="Thiếu mã check-in.";$("#checkinState").textContent="!";return}
  try{
    const r=await PickleAPI.publicCheckin(token);
    $("#checkinTeam").textContent=r.team_name||"Đội chưa đặt tên";
    $("#checkinMeta").textContent=[r.tournament_name,r.division_name,r.start_at?new Date(r.start_at).toLocaleString("vi-VN"):null].filter(Boolean).join(" • ");
    if(r.checked_in_at){
      $("#checkinState").textContent="✓";
      $("#checkinState").classList.add("success");
      $("#checkinStatus").innerHTML='<span class="status-chip success">ĐÃ CHECK-IN</span><small class="muted-block">'+new Date(r.checked_in_at).toLocaleString("vi-VN")+'</small>';
      $("#confirmCheckin").hidden=true;
    }else{
      $("#checkinState").textContent="QR";
      $("#checkinStatus").innerHTML='<span class="status-chip warning">CHƯA CHECK-IN</span>';
      $("#confirmCheckin").hidden=false;
    }
  }catch(e){
    $("#checkinState").textContent="!";
    $("#checkinTeam").textContent="Không tìm thấy đăng ký";
    $("#checkinMeta").textContent="Mã QR không tồn tại hoặc đã bị thu hồi.";
    $("#confirmCheckin").hidden=true;
  }
}
$("#confirmCheckin").onclick=async()=>{
  try{await PickleAPI.confirmCheckin(token);await load()}
  catch(e){
    if(e.status===401){location.href="login.html?return="+encodeURIComponent(location.href)}
    else $("#checkinNote").textContent="Không thể xác nhận: "+e.message;
  }
};
load();