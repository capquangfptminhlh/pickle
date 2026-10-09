// Shared match-format helpers for admin, referee and public pages.
// Keeps rule labels in Vietnamese and in one place so every screen agrees.
(()=>{
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const POINTS=[9,11,15,21,27];
  const RELAY=[0,5,7,9,11];
  const FORMATS={round_robin:"Vòng tròn",pool_to_knockout:"Vòng bảng + loại trực tiếp",single_elimination:"Loại trực tiếp",double_elimination:"Loại kép"};
  const EVENTS={singles:"Đơn",doubles:"Đôi",mixed_doubles:"Đôi nam nữ",team:"Đồng đội"};
  const TEAM_SIZES=[3,4];
  // The MLP "chạy điểm" poster rule: 3 players, AB to 9, BC to 18, CA to 27,
  // rally, and the final point only counts for the serving side.
  const MLP_RELAY={bestOf:1,winByTwo:false,scoringMode:"rally",relaySegmentPoints:9,relayTeamSize:3,finalPointOnServe:true};
  // Pairs rotate cyclically so every player plays two legs (mirrors shared/scoring-rules.js).
  const relayPairs=n=>{const l="ABCD".slice(0,n);return [...l].map((x,i)=>x+l[(i+1)%n])};
  const relayInfo=(seg,size)=>seg&&size?`Tổng ${seg*size} điểm: ${relayPairs(size).map((p,i)=>p+" đến "+seg*(i+1)).join(" → ")}`:"Mỗi game tính điểm riêng.";

  const withCurrent=(list,current)=>[...new Set([...list,Number(current)].filter(v=>Number.isFinite(v)))].sort((a,b)=>a-b);
  function pointOptions(selected){
    return withCurrent(POINTS,selected).map(v=>`<option value="${v}" ${Number(selected)===v?"selected":""}>${v}</option>`).join("");
  }
  function relayOptions(selected){
    return withCurrent(RELAY,selected||0).map(v=>`<option value="${v}" ${Number(selected||0)===v?"selected":""}>${v?`Mỗi lượt ${v} điểm`:"Không chạy điểm"}</option>`).join("");
  }
  function teamSizeOptions(selected){
    const current=Number(selected)||3;
    return TEAM_SIZES.map(v=>`<option value="${v}" ${current===v?"selected":""}>${v} người (${relayPairs(v).join(" → ")})</option>`).join("");
  }
  // Extra rule fields; ids are `${prefix}Relay`, `${prefix}TeamSize`, `${prefix}FinalServe`, `${prefix}Third`.
  // fields: CSS selectors of the form's own bestOf/points/scoring/winByTwo controls,
  // used by the MLP preset button.
  function extraFieldsHtml(prefix,d={},{disabled=false,fields={}}={}){
    const dis=disabled?"disabled":"";
    const preset=`data-mlp-preset="${esc(prefix)}" data-best="${esc(fields.bestOf||"")}" data-points="${esc(fields.points||"")}" data-scoring="${esc(fields.scoring||"")}" data-win2="${esc(fields.winByTwo||"")}"`;
    const seg=Number(d.relaySegmentPoints||0),size=Number(d.relayTeamSize||0)||3;
    return `<div class="relay-fields" style="display:contents" data-relay-prefix="${esc(prefix)}" ${preset.replace(/data-mlp-preset="[^"]*" /,"")}>
      <label class="field">Chạy điểm (đổi cặp)<select id="${prefix}Relay" ${dis}>${relayOptions(seg)}</select></label>
      <label class="field">Số người mỗi đội<select id="${prefix}TeamSize" ${dis||(seg?"":"disabled")}>${teamSizeOptions(size)}</select></label>
      <small class="field full field-hint" id="${prefix}RelayInfo">${esc(relayInfo(seg,size))}</small></div>
      <label class="field" style="align-content:end"><span><input id="${prefix}FinalServe" type="checkbox" ${d.finalPointOnServe?"checked":""} ${dis}> Điểm cuối phải ghi khi cầm giao</span></label>
      <label class="field" style="align-content:end"><span><input id="${prefix}Third" type="checkbox" ${d.thirdPlaceMatch?"checked":""} ${dis}> Có trận tranh hạng ba</span></label>
      ${disabled?"":`<div class="field full"><button type="button" class="btn secondary" ${preset}>Áp dụng luật MLP chạy điểm (mỗi lượt 9 điểm)</button><small class="field-hint">1 game rally, mỗi cặp đánh 9 điểm rồi đổi cặp; tổng điểm = 9 × số người (3 người: 27, 4 người: 36); điểm cuối phải ghi khi cầm giao. Đổi "Số người mỗi đội" bất cứ lúc nào, tổng điểm tự cập nhật.</small></div>`}`;
  }
  function readExtra(prefix){
    const el=id=>document.getElementById(prefix+id);
    const seg=Number(el("Relay")?.value||0);
    return {relaySegmentPoints:seg,relayTeamSize:seg?Number(el("TeamSize")?.value||3):0,finalPointOnServe:Boolean(el("FinalServe")?.checked),thirdPlaceMatch:Boolean(el("Third")?.checked)};
  }
  document.addEventListener("click",e=>{
    const button=e.target.closest?.("[data-mlp-preset]");if(!button)return;
    const prefix=button.dataset.mlpPreset,q=sel=>sel?document.querySelector(sel):null;
    const set=(el,value)=>{
      if(!el)return;
      if(el.type==="checkbox")el.checked=Boolean(value);
      else{if(el.tagName==="SELECT"&&![...el.options].some(o=>o.value===String(value)))el.add(new Option(String(value),String(value)));el.value=String(value)}
      el.dispatchEvent(new Event("change",{bubbles:true}));
    };
    set(q(button.dataset.scoring),MLP_RELAY.scoringMode);
    // Keep the team size already chosen in the form (3 by default).
    set(document.getElementById(prefix+"Relay"),MLP_RELAY.relaySegmentPoints);set(document.getElementById(prefix+"FinalServe"),MLP_RELAY.finalPointOnServe);
  });
  // Relay total = points per leg × players: keep the form's own target, best-of
  // and win-by-two in step so the admin never types a total by hand.
  document.addEventListener("change",e=>{
    const wrap=e.target.closest?.(".relay-fields");if(!wrap)return;
    const prefix=wrap.dataset.relayPrefix,el=id=>document.getElementById(prefix+id),q=sel=>sel?document.querySelector(sel):null;
    const seg=Number(el("Relay")?.value||0),size=Number(el("TeamSize")?.value||3);
    if(el("TeamSize"))el("TeamSize").disabled=!seg;
    if(el("RelayInfo"))el("RelayInfo").textContent=relayInfo(seg,size);
    if(!seg)return;
    const setVal=(node,value)=>{if(!node)return;if(node.type==="checkbox"){node.checked=Boolean(value);return}if(node.tagName==="SELECT"&&![...node.options].some(o=>o.value===String(value)))node.add(new Option(String(value),String(value)));node.value=String(value)};
    setVal(q(wrap.dataset.points),seg*size);setVal(q(wrap.dataset.best),1);setVal(q(wrap.dataset.win2),false);
  });
  function relayLeg(a,b,d){
    const seg=Number(d?.relaySegmentPoints||0),target=Number(d?.pointsToWin||0);
    if(!seg||!target)return null;
    const count=Math.ceil(target/seg),index=Math.min(count-1,Math.floor(Math.max(Number(a)||0,Number(b)||0)/seg));
    return {index,count,size:Number(d?.relayTeamSize||0)||count,until:Math.min(target,(index+1)*seg)};
  }
  // "Cặp AB/BC/CA" (3 players) or "Cặp AB/BC/CD/DA" (4 players); "Lượt n" otherwise.
  function legName(index,size){
    if(TEAM_SIZES.includes(size))return "Cặp "+relayPairs(size)[index];
    return "Lượt "+(index+1);
  }
  function legText(a,b,d){
    const leg=relayLeg(a,b,d);if(!leg)return "";
    const next=leg.index+1<leg.count?` • tiếp theo: ${legName(leg.index+1,leg.size)}`:"";
    return `Đang đánh: ${legName(leg.index,leg.size)} • đến ${leg.until} điểm${next}`;
  }
  // Sub-match labels for team events: three-player teams rotate AB/BC/CA,
  // classic MLP (four players) uses gender doubles plus Dreambreaker.
  function teamGameLabels(rosterSize){
    if(rosterSize===3)return ["Game 1: Cặp AB","Game 2: Cặp BC","Game 3: Cặp CA"];
    return ["Trận 1: Đôi Nữ","Trận 2: Đôi Nam","Trận 3: Đôi Nam Nữ 1","Trận 4: Đôi Nam Nữ 2","Trận 5: Dreambreaker (nếu 2-2)"];
  }
  function rulesSummary(d){
    if(!d)return "";
    const parts=[];
    const size=Number(d.relayTeamSize||0)||Math.round(Number(d.pointsToWin)/Number(d.relaySegmentPoints||1));
    if(Number(d.relaySegmentPoints)>0)parts.push(`Chạy điểm ${size} lượt × ${d.relaySegmentPoints} = ${d.pointsToWin} điểm`,`Đội ${size} người, thứ tự cặp ${relayPairs(size).join(" → ")}`);
    else parts.push(`${Number(d.bestOf)===1?"1 game":`${d.bestOf} game thắng ${Math.ceil(Number(d.bestOf)/2)}`} • ${d.pointsToWin} điểm`);
    parts.push(d.scoringMode==="rally"?"Rally (pha nào cũng tính điểm)":"Chỉ bên giao được điểm");
    if(!Number(d.relaySegmentPoints))parts.push(d.winByTwo?"Thắng cách 2":"Không cần cách 2");
    if(d.finalPointOnServe)parts.push(`Điểm ${d.pointsToWin} phải ghi khi cầm giao`);
    if(d.thirdPlaceMatch)parts.push("Có tranh hạng ba");
    return parts.join(" • ");
  }
  // Mirrors shared/scoring-rules.js validateSet: a game ends exactly at the
  // target, or two clear out of a win-by-two deuce.
  function gameWon(a,b,target,winByTwo){
    a=Number(a)||0;b=Number(b)||0;target=Number(target)||11;
    const hi=Math.max(a,b),lo=Math.min(a,b);
    if(a===b||hi<target)return false;
    if(!winByTwo)return hi===target;
    return hi===target?hi-lo>=2:hi-lo===2;
  }
  // Mirrors shared/scoring-rules.js timeoutsPerGame.
  const timeoutLimit=d=>Number(d?.pointsToWin)>=15?3:2;
  // Structured rules for the public "Thể lệ" sheet: a relay timeline (if any)
  // plus short facts, each a big value with a one-line note.
  function ruleSheet(d){
    if(!d)return {kicker:"",facts:[],relay:null};
    const seg=Number(d.relaySegmentPoints||0),target=Number(d.pointsToWin||0);
    const size=Number(d.relayTeamSize||0)||(seg?Math.round(target/seg):0);
    const relay=seg&&TEAM_SIZES.includes(size)?relayPairs(size).map((pair,i)=>({pair,from:i*seg,to:Math.min(target,(i+1)*seg)})):null;
    const bestOf=Number(d.bestOf||1),facts=[];
    if(relay)facts.push({label:"Điểm thắng",value:`${target} điểm`,note:`1 game chạy điểm, ${size} lượt × ${seg}`});
    else{
      facts.push({label:"Mỗi trận",value:bestOf===1?"1 game":`${bestOf} game`,note:bestOf===1?"thắng game là thắng trận":`thắng ${Math.ceil(bestOf/2)} game trước`});
      facts.push({label:"Điểm mỗi game",value:`${target} điểm`,note:d.winByTwo?"phải thắng cách 2":"không cần cách 2"});
    }
    facts.push(d.scoringMode==="rally"
      ?{label:"Cách tính",value:"Rally",note:"pha nào cũng tính điểm"}
      :{label:"Cách tính",value:"Giao bóng",note:"chỉ bên giao được điểm"});
    if(d.finalPointOnServe)facts.push({label:"Điểm quyết định",value:`Điểm ${target}`,note:"phải ghi khi đang cầm giao"});
    if(d.format==="pool_to_knockout")facts.push({label:"Vào loại trực tiếp",value:`Top ${Math.max(1,Number(d.advanceCount||2))}`,note:"mỗi bảng"});
    else if(d.format==="round_robin")facts.push({label:"Xếp hạng",value:"Vòng tròn",note:"không có loại trực tiếp"});
    if(d.format!=="round_robin")facts.push(d.thirdPlaceMatch
      ?{label:"Hạng ba",value:"Có trận",note:"2 đội thua bán kết đá tranh"}
      :{label:"Hạng ba",value:"Đồng hạng",note:"không đá tranh hạng ba"});
    facts.push({label:"Timeout",value:`${timeoutLimit(d)} lần`,note:"mỗi đội, mỗi game"});
    return {kicker:`${eventLabel(d.eventType)} · ${formatLabel(d.format)}`,facts,relay};
  }
  const formatLabel=f=>FORMATS[f]||"Thể thức đang cập nhật";
  const eventLabel=e=>EVENTS[e]||"Nội dung";
  window.PickleMatchFormat={esc,gameWon,timeoutLimit,ruleSheet,MLP_RELAY,relayPairs,pointOptions,relayOptions,teamSizeOptions,extraFieldsHtml,readExtra,relayLeg,legName,legText,teamGameLabels,rulesSummary,formatLabel,eventLabel};
})();
