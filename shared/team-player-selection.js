export function playerCountRange(eventType){
  if(eventType==="singles")return {min:1,max:1};
  if(eventType==="doubles"||eventType==="mixed_doubles")return {min:2,max:2};
  return {min:1,max:4};
}

export function normalizePlayerIds(input){
  const ids=(Array.isArray(input)?input:[])
    .map(value=>String(value||"").trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

export function validatePlayerIds(eventType,input){
  const original=(Array.isArray(input)?input:[])
    .map(value=>String(value||"").trim())
    .filter(Boolean);
  if(!original.length)throw new Error("PLAYER_SELECTION_REQUIRED");
  const ids=normalizePlayerIds(original);
  if(ids.length!==original.length)throw new Error("DUPLICATE_PLAYER_SELECTION");
  const {min,max}=playerCountRange(eventType);
  if(ids.length<min||ids.length>max)throw new Error("INVALID_PLAYER_COUNT");
  return ids;
}
