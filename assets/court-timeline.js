import {buildCourtTimeline,isLiveTimelineMatch,filterTimelineMatches} from "./court-timeline-model.mjs";
const $=id=>document.getElementById(id);
const api=window.PickleAPI;
let state=null,selected=new URLSearchParams(location.search).get("tournament")||"",view="all",seq=0,canSchedule=false;
let assignment=null,savingAssignment=false;
const make=(tag,classes,text)=>{
 const el=document.createElement(tag);if(classes)el.className=classes;
 if(text!==undefined)el.textContent=String(text);return el;
};
const label=(m)=>{
 if(isLiveTimelineMatch(m))return "ĐANG ĐẤU";
 return ({warming_up:"KHỞI ĐỘNG",on_deck:"SẮP VÀO",called:"GỌI VĐV",scheduled:"CHỜ ĐẤU"})[m.courtState||m.court_state]||"CHỜ";
};
const time=m=>{
 const date=new Date(m.scheduledAt||m.scheduled_at||"");
 return Number.isFinite(date.getTime())?date.toLocaleString("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Ho_Chi_Minh"}):"Chưa có giờ";
};
const team=id=>state?.teams?.find(x=>String(x.id)===String(id))?.name||"Chưa xác định";
function matchCard(m,unplaced=false){
 const isLive=isLiveTimelineMatch(m);
 const el=make("article","match"+(isLive?" is-live":""));
 el.dataset.matchId=m.id;
 const top=make("div","match-top");
 top.append(make("span","",time(m)),make("span","match-status",label(m)));
 const names=make("strong","",team(m.a??m.teamAId??m.team_a_id)+"  vs  "+team(m.b??m.teamBId??m.team_b_id));
 const bottom=make("div","match-foot");
 const division=state.divisions?.find(x=>String(x.id)===String(m.divisionId??m.division_id));
 bottom.append(make("span","",division?.name||m.stage||"Trận thi đấu"));
 const a=make("a","","Chi tiết trận →");a.href="/match.html?id="+encodeURIComponent(m.id);
 bottom.append(a);
 if(unplaced&&canSchedule&&!isLive){
  const button=make("button","assign-match","Phân sân thủ công");
  button.type="button";button.dataset.assignMatch=String(m.id);
  bottom.append(button);
 }
 el.append(top,names,bottom);
 return el;
}
function updateSelect(){
 const target=$("tournamentTimelineSelect"),tours=state.tournaments||[];
 target.replaceChildren();
 for(const t of tours){const opt=make("option","",t.name);opt.value=t.id;target.append(opt)}
 target.value=selected;
 target.disabled=tours.length===0;
}
function render(){
 const payload=buildCourtTimeline(state,selected);
 updateSelect();
 const grid=$("courtTimeline"),queue=$("unplacedMatches");
 grid.replaceChildren();queue.replaceChildren();
 const actions=$("autoScheduleActions");
 actions.replaceChildren();actions.hidden=true;
 const empty=$("timelineEmpty");
 if(!payload){
  if($("assignDialog").open)$("assignDialog").close();
  assignment=null;
  $("tournamentTitle").textContent="Không tìm thấy giải đấu";
  $("tournamentMeta").textContent="Giải có thể không công khai hoặc tài khoản chưa được cấp quyền.";
  for(const k of ["timelineCourts","timelineLive","timelineAssigned","timelineUnplacedCount"])$(k).textContent="0";
  $("scheduleMessage").textContent="";
  empty.hidden=false;return;
 }
 empty.hidden=true;
 const {summary,columns,unplaced,tournament}=payload;
 if(canSchedule&&unplaced.length){
   const counts=new Map();
   for(const m of unplaced){
     const id=String(m.divisionId??m.division_id??"");
     if(id)counts.set(id,(counts.get(id)||0)+1);
   }
   for(const [id,count] of counts){
     const division=state.divisions.find(d=>String(d.id)===id);
     if(!division)continue;
     const button=make("button","","Xếp sân tự động: "+division.name+" ("+count+" trận)");
     button.type="button";
     button.dataset.scheduleDivision=id;
     actions.append(button);
   }
 }
 actions.hidden=!actions.childElementCount;
 $("tournamentTitle").textContent=tournament.name;
 $("tournamentMeta").textContent=[tournament.venue,tournament.date].filter(Boolean).join(" • ")||"Giải đang được theo dõi";
 for(const [id,value] of [["timelineCourts",summary.activeCourts],["timelineLive",summary.live],["timelineAssigned",summary.assigned],["timelineUnplacedCount",summary.unplaced]])$(id).textContent=String(value);
 for(const {court,matches} of columns){
  const filtered=filterTimelineMatches(matches,view);
  const column=make("section","court-column");
  const head=make("header","court-head");const title=make("h3","",court.name||"Sân");
  head.append(title,make("b","",filtered.length+" trận"));column.append(head);
  const body=make("div","court-items");
  if(!filtered.length)body.append(make("p","court-empty",matches.length?"Không có trận phù hợp bộ lọc.":"Sân đang trống."));
  else for(const m of filtered)body.append(matchCard(m));
  column.append(body);grid.append(column);
 }
 if(!columns.length)grid.append(make("div","empty","Chưa khai báo sân hoạt động. BTC có thể tạo sân trong trang quản trị."));
 const shown=filterTimelineMatches(unplaced,view);
 if(shown.length){for(const m of shown)queue.append(matchCard(m,true))}
 else queue.append(make("div","unplaced-empty",unplaced.length?"Không có trận chưa xếp sân phù hợp bộ lọc.":"Tất cả các trận đang chờ đều đã được phân sân."));
}
// A public spectator never gets an assignment action. On submission the
// authenticated Worker checks scope, participant/court conflicts and the
// expected match version again; UI validation is only an early safeguard.
function vietnamTimeInput(value){
  const date=new Date(value||"");
  if(!Number.isFinite(date.getTime()))return "";
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
    timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(date).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  return parts.year+"-"+parts.month+"-"+parts.day+"T"+parts.hour+":"+parts.minute;
}
function vietnamTimeIso(value){
  if(!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(value))return null;
  const date=new Date(value+":00+07:00");
  return Number.isFinite(date.getTime())&&vietnamTimeInput(date.toISOString())===value?date.toISOString():null;
}
function availableAssignment(id){
  if(!canSchedule||!state)return null;
  const timeline=buildCourtTimeline(state,selected);
  const match=timeline?.unplaced.find(m=>String(m.id)===String(id));
  if(!match||isLiveTimelineMatch(match))return null;
  return {match,timeline};
}
function openAssignment(id){
  const current=availableAssignment(id);
  if(!current)return;
  const {match,timeline}=current;
  const division=state.divisions.find(d=>String(d.id)===String(match.divisionId??match.division_id));
  const version=Number(match.version);
  if(!division||!Number.isSafeInteger(version)||version<1)return;
  assignment={id:String(match.id),version,tournamentId:String(selected)};
  const select=$("assignCourt");
  select.replaceChildren();
  for(const column of timeline.columns){
    const option=make("option","",column.court.name);option.value=String(column.court.id);
    select.append(option);
  }
  $("assignMatchName").textContent=team(match.a??match.teamAId??match.team_a_id)+" vs "+
    team(match.b??match.teamBId??match.team_b_id)+" • "+division.name;
  $("assignTime").value=vietnamTimeInput(match.scheduledAt||match.scheduled_at||
    timeline.tournament.startAt||timeline.tournament.start_at);
  $("assignFeedback").textContent="";
  $("assignDialog").showModal();
}
$("unplacedMatches").addEventListener("click",event=>{
  const target=event.target.closest("button[data-assign-match]");
  if(target)openAssignment(target.dataset.assignMatch);
});
$("assignCancel").addEventListener("click",()=>{
  if(savingAssignment)return;
  $("assignDialog").close();assignment=null;
});
$("assignDialog").addEventListener("close",()=>{if(!savingAssignment)assignment=null});
$("assignForm").addEventListener("submit",async event=>{
  event.preventDefault();
  if(savingAssignment||!assignment||!canSchedule)return;
  const current=availableAssignment(assignment.id);
  const feedback=$("assignFeedback"),courtId=$("assignCourt").value;
  const scheduledAt=vietnamTimeIso($("assignTime").value);
  if(!current||String(selected)!==assignment.tournamentId||
     Number(current.match.version)!==assignment.version){
    feedback.textContent="Lịch đã thay đổi. Đóng cửa sổ, tải lại và kiểm tra trước khi xếp sân.";return;
  }
  if(!current.timeline.columns.some(x=>String(x.court.id)===courtId)){
    feedback.textContent="Sân không còn hoạt động trong giải này.";return;
  }
  if(!scheduledAt){feedback.textContent="Giờ thi đấu không hợp lệ.";return}
  const courtName=current.timeline.columns.find(x=>String(x.court.id)===courtId).court.name;
  if(!window.confirm("Xác nhận phân trận?\\nSân: "+courtName+"\\nGiờ Việt Nam: "+$("assignTime").value+
    "\\nHệ thống sẽ kiểm tra xung đột trước khi lưu."))return;
  const button=$("assignSave");savingAssignment=true;button.disabled=true;
  $("assignCancel").disabled=true;feedback.textContent="Đang kiểm tra và lưu lịch…";
  try{
    await api.assignMatch(assignment.id,{courtId,scheduledAt,expectedVersion:assignment.version});
    $("assignDialog").close();assignment=null;
    await load();
    $("scheduleMessage").classList.remove("is-error");
    $("scheduleMessage").textContent="Đã phân sân thành công. Lịch mới đã được cập nhật.";
  }catch(err){
    feedback.textContent=({
      COURT_SCHEDULE_CONFLICT:"Sân đã có trận trùng giờ. Vui lòng chọn sân hoặc giờ khác.",
      PLAYER_SCHEDULE_CONFLICT:"VĐV trùng lịch hoặc chưa đủ thời gian nghỉ.",
      VERSION_CONFLICT:"Lịch vừa thay đổi từ máy khác. Tải lại trước khi thao tác.",
      MATCH_ASSIGNMENT_LOCKED:"Trận đã bắt đầu, không thể đổi sân/giờ.",
      INVALID_COURT_SCOPE:"Sân đã ngừng hoạt động hoặc không thuộc giải này.",
      INVALID_SCHEDULE_TIME:"Giờ bắt đầu không hợp lệ."
    })[err.message]||"Không thể phân sân. Kiểm tra kết nối và quyền BTC.";
  }finally{
    savingAssignment=false;button.disabled=false;$("assignCancel").disabled=false;
  }
});
async function load(){
 const id=++seq;
 try{
  // Authenticated organizers see their accessible private competitions; visitors
  // see ONLY the public-state endpoint.
  const internal=await api.optionalAdminState().catch(()=>null);
  const next=internal?.tournaments?.length?internal:await api.publicState();
  if(id!==seq)return;
  state=next;
  canSchedule=false;
  if(internal?.tournaments?.length){
    const session=await api.session().catch(()=>null);
    if(id!==seq)return;
    canSchedule=["super_admin","organizer"].includes(session?.user?.role);
  }
  const exists=next.tournaments?.some(t=>String(t.id)===String(selected));
  if(!selected)selected=next.tournaments?.[0]?.id||"";
  else if(!exists){ // Honor explicitly requested ID; never switch to a different event.
    if(!new URLSearchParams(location.search).has("tournament"))selected=next.tournaments?.[0]?.id||"";
  }
  render();
  $("timelineStatus").textContent="● Đã kết nối";
  $("timelineStatus").classList.remove("is-error");
  $("timelineUpdated").textContent="Cập nhật "+new Date().toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"});
 }catch(err){
  if(id!==seq)return;
  $("timelineStatus").textContent="● Không kết nối được — giữ dữ liệu gần nhất";
  $("timelineStatus").classList.add("is-error");
  if(!state)$("timelineEmpty").hidden=false;
 }
}
$("tournamentTimelineSelect").addEventListener("change",e=>{
 selected=e.target.value;$("scheduleMessage").textContent="";const url=new URL(location.href);
 url.searchParams.set("tournament",selected);history.replaceState(null,"",url);render();
});
$("timelineReload").addEventListener("click",load);
$("autoScheduleActions").addEventListener("click",async event=>{
  const button=event.target.closest("button[data-schedule-division]");
  if(!button||button.disabled||!canSchedule)return;
  const id=button.dataset.scheduleDivision;
  const division=state.divisions.find(x=>String(x.id)===id);
  if(!division)return;
  if(!window.confirm("Xếp sân tự động cho "+division.name+"? Hệ thống sẽ kiểm tra xung đột trước khi ghi lịch."))return;
  button.disabled=true;
  const message=$("scheduleMessage");
  message.classList.remove("is-error");
  message.textContent="Đang kiểm tra và xếp sân…";
  try{
    const res=await api.autoScheduleCourts(id);
    message.textContent="Đã xếp "+Number(res.updated||0)+" trận. Lịch mới đã được lưu.";
  }catch(error){
    message.classList.add("is-error");
    message.textContent=error.status===409?"Lịch đã thay đổi. Vui lòng kiểm tra lại.":"Không thể xếp sân: "+error.message;
  }finally{
    button.disabled=false;
    await load();
  }
});
document.querySelectorAll("[data-view]").forEach(button=>button.addEventListener("click",()=>{
 view=button.dataset.view;
 document.querySelectorAll("[data-view]").forEach(el=>el.setAttribute("aria-pressed",String(el===button)));
 if(state)render();
}));
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")load()});
setInterval(()=>{if(document.visibilityState==="visible")load()},15000);
load();
