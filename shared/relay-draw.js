const PAIRS=['AB','BC','CA'];
export function parseRelayOrder(value){
  let order=value;
  if(typeof order==='string'){try{order=JSON.parse(order)}catch{return null}}
  return Array.isArray(order)&&order.length===3&&new Set(order).size===3&&order.every(pair=>PAIRS.includes(pair))?[...order]:null;
}
export function drawRelayOrders(randomUint=()=>crypto.getRandomValues(new Uint32Array(1))[0]){
  const below=n=>{const limit=Math.floor(0x100000000/n)*n;let value;do{value=randomUint();if(!Number.isSafeInteger(value)||value<0||value>=0x100000000)throw new Error('INVALID_RANDOM_VALUE')}while(value>=limit);return value%n};
  const shuffle=()=>{const order=[...PAIRS];for(let i=order.length-1;i>0;i--){const j=below(i+1);[order[i],order[j]]=[order[j],order[i]]}return order};
  return {A:shuffle(),B:shuffle()};
}
export function relayHasStarted(m){
  return Boolean(m.has_history||m.hasHistory||m.started_at||m.startedAt||['live','completed','done','walkover','cancelled'].includes(m.status)||m.winner_team_id||m.winner||Number(m.current_score_a||m.current?.[0]||0)||Number(m.current_score_b||m.current?.[1]||0)||m.sets?.length);
}
export function relayDrawRequired(m){
  return Number(m.relay_team_size??m.relayTeamSize)===3&&Number(m.relay_segment_points??m.relaySegmentPoints)>0&&!relayHasStarted(m)&&(!parseRelayOrder(m.relay_order_a??m.relayOrderA)||!parseRelayOrder(m.relay_order_b??m.relayOrderB));
}
