// Shared match-format helpers for admin, referee and public pages.
// Keeps rule labels in Vietnamese and in one place so every screen agrees.
(()=>{
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const POINTS=[9,11,15,21,27];
  const RELAY=[0,5,7,9,11];
  const FORMATS={round_robin:"Vòng tròn",pool_to_knockout:"Vòng bảng + loại trực tiếp",single_elimination:"Loại trực tiếp",double_elimination:"Loại kép"};
  const EVENTS={singles:"Đơn",doubles:"Đôi",mixed_doubles:"Đôi nam nữ",team:"Đồng đội"};
  // The MLP "chạy điểm" poster rule: AB to 9, BC to 18, CA to 27, rally,
  // and the final point only counts for the serving side.
  const MLP_RELAY={bestOf:1,pointsToWin:27,winByTwo:false,scoringMode:"rally",relaySegmentPoints:9,finalPointOnServe:true};

  const withCurrent=(list,current)=>[...new Set([...list,Number(current)].filter(v=>Number.isFinite(v)))].sort((a,b)=>a-b);
  function pointOptions(selected){
    return withCurrent(POINTS,selected).map(v=>`<option value="${v}" ${Number(selected)===v?"selected":""}>${v}</option>`).join("");
  }
  function relayOptions(selected){
    return withCurrent(RELAY,selected||0).map(v=>`<option value="${v}" ${Number(selected||0)===v?"selected":""}>${v?`Đổi cặp mỗi ${v} điểm`:"Không (mỗi game tính riêng)"}</option>`).join("");
  }
  // Extra rule fields; ids are `${prefix}Relay`, `${prefix}FinalServe`, `${prefix}Third`.
  // fields: CSS selectors of the form's own bestOf/points/scoring/winByTwo controls,
  // used by the MLP preset button.
  function extraFieldsHtml(prefix,d={},{disabled=false,fields={}}={}){
    const dis=disabled?"disabled":"";
    const preset=`data-mlp-preset="${esc(prefix)}" data-best="${esc(fields.bestOf||"")}" data-points="${esc(fields.points||"")}" data-scoring="${esc(fields.scoring||"")}" data-win2="${esc(fields.winByTwo||"")}"`;
    return `<label class="field">Chạy điểm (đổi cặp)<select id="${prefix}Relay" ${dis}>${relayOptions(d.relaySegmentPoints)}</select></label>
      <label class="field" style="align-content:end"><span><input id="${prefix}FinalServe" type="checkbox" ${d.finalPointOnServe?"checked":""} ${dis}> Điểm cuối phải ghi khi cầm giao</span></label>
      <label class="field" style="align-content:end"><span><input id="${prefix}Third" type="checkbox" ${d.thirdPlaceMatch?"checked":""} ${dis}> Có trận tranh hạng ba</span></label>
      ${disabled?"":`<div class="field full"><button type="button" class="btn secondary" ${preset}>Áp dụng luật MLP chạy điểm 9 → 18 → 27</button><small class="field-hint">1 game rally đến 27, cặp AB đến 9, BC đến 18, CA đến 27; điểm 27 phải ghi khi cầm giao.</small></div>`}`;
  }
  function readExtra(prefix){
    const el=id=>document.getElementById(prefix+id);
    return {relaySegmentPoints:Number(el("Relay")?.value||0),finalPointOnServe:Boolean(el("FinalServe")?.checked),thirdPlaceMatch:Boolean(el("Third")?.checked)};
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
    set(q(button.dataset.best),MLP_RELAY.bestOf);set(q(button.dataset.points),MLP_RELAY.pointsToWin);
    set(q(button.dataset.scoring),MLP_RELAY.scoringMode);set(q(button.dataset.win2),MLP_RELAY.winByTwo);
    set(document.getElementById(prefix+"Relay"),MLP_RELAY.relaySegmentPoints);set(document.getElementById(prefix+"FinalServe"),MLP_RELAY.finalPointOnServe);
  });
  function relayLeg(a,b,d){
    const seg=Number(d?.relaySegmentPoints||0),target=Number(d?.pointsToWin||0);
    if(!seg||!target)return null;
    const count=Math.ceil(target/seg),index=Math.min(count-1,Math.floor(Math.max(Number(a)||0,Number(b)||0)/seg));
    return {index,count,until:Math.min(target,(index+1)*seg)};
  }
  // "AB", "BC", "CA" for three-player relays; "Lượt n" otherwise.
  function legName(index,count){
    if(count===3)return "Cặp "+["AB","BC","CA"][index];
    return "Lượt "+(index+1);
  }
  function legText(a,b,d){
    const leg=relayLeg(a,b,d);if(!leg)return "";
    return `Đang đánh: ${legName(leg.index,leg.count)} • đến ${leg.until} điểm`;
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
    if(Number(d.relaySegmentPoints)>0)parts.push(`Chạy điểm đến ${d.pointsToWin}, đổi cặp mỗi ${d.relaySegmentPoints} điểm`);
    else parts.push(`${Number(d.bestOf)===1?"1 game":`${d.bestOf} game thắng ${Math.ceil(Number(d.bestOf)/2)}`} • ${d.pointsToWin} điểm`);
    parts.push(d.scoringMode==="rally"?"Rally (pha nào cũng tính điểm)":"Chỉ bên giao được điểm");
    if(!Number(d.relaySegmentPoints))parts.push(d.winByTwo?"Thắng cách 2":"Không cần cách 2");
    if(d.finalPointOnServe)parts.push(`Điểm ${d.pointsToWin} phải ghi khi cầm giao`);
    if(d.thirdPlaceMatch)parts.push("Có tranh hạng ba");
    return parts.join(" • ");
  }
  const formatLabel=f=>FORMATS[f]||"Thể thức đang cập nhật";
  const eventLabel=e=>EVENTS[e]||"Nội dung";
  window.PickleMatchFormat={esc,MLP_RELAY,pointOptions,relayOptions,extraFieldsHtml,readExtra,relayLeg,legName,legText,teamGameLabels,rulesSummary,formatLabel,eventLabel};
})();
