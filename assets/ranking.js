let state={teams:[]};const $=s=>document.querySelector(s);
function render(){
 const q=($("#rankSearch").value||"").toLowerCase(),g=$("#rankGroup").value;
 const rows=[...state.teams].filter(t=>(!g||t.group===g)&&(!q||(t.name+" "+t.club).toLowerCase().includes(q))).sort((a,b)=>b.w-a.w||((b.pf-b.pa)-(a.pf-a.pa))||b.pf-a.pf);
 $("#rankingRows").innerHTML=rows.map((t,i)=>`<div class="standing-row"><b>${i+1}</b><span><b>${t.name}</b><small style="display:block;color:#708078">${t.club} • Bảng ${t.group||"—"}</small></span><span>${t.w}</span><span>${t.l}</span><span>${t.pf}</span><span>${t.pa}</span><b>${t.pf-t.pa>0?"+":""}${t.pf-t.pa}</b></div>`).join("")||'<div class="empty">Không có kết quả.</div>';
}
async function load(){state=await PickleAPI.publicState();const groups=[...new Set(state.teams.map(t=>t.group).filter(Boolean))];$("#rankGroup").innerHTML='<option value="">Tất cả bảng</option>'+groups.map(g=>`<option value="${g}">Bảng ${g}</option>`).join("");render()}load().catch(console.error);
$("#rankSearch").oninput=render;$("#rankGroup").onchange=render;if(window.io){const s=io();s.on("public:state",x=>{state=x;render()})}
