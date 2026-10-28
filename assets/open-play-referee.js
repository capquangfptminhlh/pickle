(()=>{
"use strict";
const API=window.PickleAPI,$=id=>document.getElementById(id);
const errorText=e=>({
 AUTH_REQUIRED:"Cần đăng nhập tài khoản trọng tài.",
 OPEN_PLAY_REFEREE_FORBIDDEN:"Bạn không được phân công trận này hoặc không có quyền trọng tài.",
 OPEN_PLAY_SCORE_VERSION_OR_REFEREE_CONFLICT:"Điểm hoặc phân công đã đổi. Bấm Làm mới rồi nhập lại.",
 OPEN_PLAY_MATCH_COMPLETED:"Trận đã kết thúc; chỉ BTC được điều chỉnh có ghi lý do.",
 OPEN_PLAY_INVALID_FINAL_SCORE:"Điểm chưa đáp ứng luật kết thúc trận.",
 OPEN_PLAY_FINAL_SCORE_REQUIRES_FINISH:"Điểm đã đủ thắng, hãy chọn Kết thúc trận.",
 OPEN_PLAY_NOT_OPEN:"Buổi chơi đã đóng."
}[e?.message]||e?.message||"Không thể kết nối");
const node=(tag,value,cls)=>{const el=document.createElement(tag);el.textContent=String(value??"");if(cls)el.className=cls;return el};
const notice=(msg,failed=false)=>{const el=$("notice");el.textContent=msg;el.className="op-status"+(failed?" error":"")};
const press=(title,onClick,cls="secondary")=>{
 const btn=node("button",title,cls);btn.type="button";
 btn.addEventListener("click",async()=>{
  btn.disabled=true;
  try{await onClick()}catch(e){notice(errorText(e),true)}finally{btn.disabled=false}
 });
 return btn;
};
const time=value=>new Date(value).toLocaleString("vi-VN",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit",year:"numeric"});
async function reload(){
 const results=await API.request("/api/open-play/referee/matches");
 const host=$("matches");host.replaceChildren();
 if(!Array.isArray(results)||!results.length){
  host.append(node("div","Chưa có trận nào được BTC phân công.","op-empty"));
  notice("Tài khoản hợp lệ. Chưa có trận nào được giao.");return;
 }
 for(const m of results){
  const card=node("article","","op-card");
  card.append(node("h3",m.title+" · Vòng "+m.round+" · "+(m.physicalCourtName||"Sân mô phỏng "+m.court)));
  card.append(node("p",time(m.startsAt)+" · "+(m.teamANames||m.teamA).join(" + ")+"  VS  "+(m.teamBNames||m.teamB).join(" + "),"op-small"));
  card.append(node("p","Chạm "+m.pointTarget+(m.winBy===2?" · thắng cách biệt 2":" · chạm điểm")+
   " · "+(m.status==="completed"?"Đã kết thúc":m.status==="live"?"Đang thi đấu":"Chưa bắt đầu"),"op-small"));
  const wrap=node("div","","op-form-grid"),inputs=[];
  for(const [side,value] of [["A",m.scoreA],["B",m.scoreB]]){
   const container=document.createElement("div");
   const label=node("label","Điểm đội "+side),input=document.createElement("input");
   input.type="number";input.min="0";input.max="99";input.step="1";input.value=String(value);
   input.id="ref-score-"+m.id+"-"+side;label.htmlFor=input.id;
   input.disabled=m.status==="completed"||m.sessionStatus!=="open";
   container.append(label,input);wrap.append(container);inputs.push(input);
  }
  card.append(wrap);
  if(m.status!=="completed"&&m.sessionStatus==="open"){
   const actions=node("div","","op-actions");
   const save=async finish=>{
    if(finish&&!window.confirm("Xác nhận kết thúc trận? Sau đó chỉ BTC mới sửa được điểm."))return;
    const out=await API.request("/api/open-play/referee/matches/"+encodeURIComponent(m.id)+"/score",{
     method:"PATCH",body:JSON.stringify({version:m.version,scoreA:Number(inputs[0].value),
      scoreB:Number(inputs[1].value),finish})
    });
    await reload();
    notice((finish?"Đã chốt trận":"Đã lưu điểm")+" sân "+m.court+": "+out.scoreA+"-"+out.scoreB+".");
   };
   actions.append(press("Lưu điểm",()=>save(false)));
   actions.append(press("Kết thúc trận",()=>save(true),"op-btn"));
   card.append(actions);
  }else card.append(node("p","Trận đã đóng để nhập điểm từ tài khoản này.","op-field-note"));
  host.append(card);
 }
 notice("Đã tải "+results.length+" trận được phân công.");
}
async function init(){
 try{
  const auth=await API.session();
  const user=auth?.user;
  if(!user||user.role!=="referee"){
   $("loginLink").classList.remove("hidden");
   notice("Chỉ tài khoản được cấp quyền trọng tài mới sử dụng bảng điểm này.",true);return;
  }
  $("workspace").classList.remove("hidden");
  await reload();
 }catch(e){notice("Không mở được bảng điểm: "+errorText(e),true)}
}
$("refresh").addEventListener("click",()=>reload().catch(e=>notice(errorText(e),true)));
init();
})();
