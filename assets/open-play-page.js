import {buildOpenPlayPairs} from "../shared/open-play.js";
const $=id=>document.getElementById(id);
$("generate").addEventListener("click",()=>{
  const result=$("result");
  try{
    const lines=$("players").value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const players=lines.map((line,index)=>{
      const parts=line.split(",").map(s=>s.trim());
      if(parts.length!==2||!parts[0]||!parts[1])throw new Error("Sai định dạng dòng "+(index+1)+": cần mã,điểm");
      return {id:parts[0],rating:Number(parts[1])};
    });
    const outcome=buildOpenPlayPairs(players,{maxCombinedRating:$("limit").value,tolerance:$("tolerance").value});
    result.textContent=[
      "Kết quả: "+outcome.pairs.length+" cặp",
      ...outcome.pairs.map((pair,i)=>"Cặp "+(i+1)+": "+pair.playerIds.join(" + ")+" · tổng "+pair.combinedRating),
      "Chưa ghép: "+(outcome.unpairedIds.join(", ")||"không có")
    ].join("\n");
  }catch(e){result.textContent="Không thể ghép: "+e.message}
});