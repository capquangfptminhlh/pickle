export const PHOTO_MAX_BYTES=6*1024*1024;
const error=(code,status=400)=>Object.assign(new Error(code),{status});
export function photoCaption(value=''){
  if(typeof value!=='string'||value.trim().length>300)throw error('INVALID_CAPTION');
  return value.trim();
}
export function validatePhoto(bytes,mime){
  if(bytes.length>PHOTO_MAX_BYTES)throw error('FILE_TOO_LARGE',413);
  const starts=values=>values.every((v,i)=>bytes[i]===v);
  if(mime==='image/jpeg'&&bytes.length>3&&starts([255,216,255]))return 'jpg';
  if(mime==='image/png'&&bytes.length>8&&starts([137,80,78,71,13,10,26,10]))return 'png';
  if(mime==='image/webp'&&bytes.length>12&&starts([82,73,70,70])&&[87,69,66,80].every((v,i)=>bytes[i+8]===v))return 'webp';
  throw error('INVALID_FILE_TYPE');
}
export function photoJson(row){
  return {id:row.id,tournamentId:row.tournament_id,caption:row.caption,url:'/api/tournaments/'+encodeURIComponent(row.tournament_id)+'/photos/'+encodeURIComponent(row.id)+'/image',createdAt:row.created_at,version:Number(row.version)};
}
