import {buildOpenPlayPairs} from "../shared/open-play.js";
const $=id=>document.getElementById(id);
let latestOutcome=null;
const exportButton=$("exportPairs");
exportButton.addEventListener("click",()=>{
  if(!latestOutcome)return;
  const rows=[["pair","player_1","player_2","combined_rating"],...latestOutcome.pairs.map((p,i)=>[i+1,...p.playerIds,p.combinedRating])];
  const csv=rows.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\r\n")+"\r\n";
  const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="pickleup-open-play-pairs.csv";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$("generate").addEventListener("click",()=>{
  const result=$("result");
  latestOutcome=null;exportButton.disabled=true;
  try{
    const lines=$("players").value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const players=lines.map((line,index)=>{
      const parts=line.split(",").map(s=>s.trim());
      if(parts.length!==2||!parts[0]||!parts[1])throw new Error("Sai định dạng dòng "+(index+1)+": cần mã,điểm");
      return {id:parts[0],rating:Number(parts[1])};
    });
    const outcome=buildOpenPlayPairs(players,{maxCombinedRating:$("limit").value,tolerance:$("tolerance").value});
    latestOutcome=outcome;exportButton.disabled=!outcome.pairs.length;
    result.textContent=[
      "Kết quả: "+outcome.pairs.length+" cặp",
      ...outcome.pairs.map((pair,i)=>"Cặp "+(i+1)+": "+pair.playerIds.join(" + ")+" · tổng "+pair.combinedRating),
      "Chưa ghép: "+(outcome.unpairedIds.join(", ")||"không có")
    ].join("\n");
  }catch(e){result.textContent="Không thể ghép: "+e.message}
});