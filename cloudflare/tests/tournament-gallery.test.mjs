import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {accountFixture} from './helpers/accounts-fixture.mjs';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64'));
export async function galleryFixture(){
 const f=await accountFixture(),objects=new Map();
 f.db.exec('UPDATE tournaments SET public_visible=1');
 f.env.MEDIA={put:async(k,b,o)=>objects.set(k,{bytes:new Uint8Array(b),type:o.httpMetadata.contentType}),delete:async k=>objects.delete(k),get:async k=>{const o=objects.get(k);return o?{body:o.bytes,httpEtag:'test',writeHttpMetadata:h=>h.set('Content-Type',o.type)}:null}};
 const call=async(path,method='GET',body,actor=null)=>worker.fetch(new Request('https://test.invalid'+path,{method,headers:{...(actor?{Authorization:'Bearer '+f.tokens[actor]}:{}),...(body&&! (body instanceof FormData)?{'Content-Type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})}),f.env);
 const upload=async({actor='organizer',tid='own',bytes=png,type='image/png',caption='Ngày vui của giải'}={})=>{const form=new FormData();form.set('image',new Blob([bytes],{type}),'memory.png');form.set('caption',caption);return call('/api/tournaments/'+tid+'/photos','POST',form,actor)};
 return {...f,objects,call,upload};
}
test('gallery uploads, persists captions, serves bytes and removes without changing tournament scores',async()=>{const f=await galleryFixture();try{
 const r=await f.upload();assert.equal(r.status,201);const p=await r.json();assert.equal(p.caption,'Ngày vui của giải');assert.equal(p.version,1);
 const list=await (await f.call('/api/tournaments/own/photos')).json();assert.equal(list.length,1);assert.equal(list[0].id,p.id);
 const image=await f.call(p.url);assert.equal(image.status,200);assert.deepEqual(new Uint8Array(await image.arrayBuffer()),png);assert.match(image.headers.get('Cache-Control'),/no-store/);
 const edit=await f.call('/api/tournaments/own/photos/'+p.id,'PATCH',{caption:'<b>Vô địch</b>',expectedVersion:1},'organizer');assert.equal(edit.status,200);assert.equal((await edit.json()).version,2);
 assert.equal((await f.call('/api/tournaments/own/photos/'+p.id,'DELETE',{expectedVersion:1},'organizer')).status,409);
 assert.equal((await f.call('/api/tournaments/own/photos/'+p.id,'DELETE',{expectedVersion:2},'organizer')).status,200);
 assert.equal((await f.call(p.url)).status,404);assert.deepEqual(await (await f.call('/api/tournaments/own/photos')).json(),[]);
 assert.equal(f.db.prepare("SELECT count(*) n FROM audit_logs WHERE action LIKE 'PHOTO_%'").get().n,3);
 assert.equal(f.objects.size,1,'removed media retained privately for audit');
 }finally{f.db.close()}});
test('gallery restricts writes and hides private photos including generic media bypass',async()=>{const f=await galleryFixture();try{
 assert.equal((await f.upload({actor:null})).status,401);assert.equal((await f.upload({actor:'local'})).status,403);assert.equal((await f.upload({tid:'other'})).status,403);
 const p=await (await f.upload()).json();f.db.exec("UPDATE tournaments SET public_visible=0 WHERE id='own'");
 assert.equal((await f.call('/api/tournaments/own/photos')).status,404);assert.equal((await f.call(p.url)).status,404);
 assert.equal((await f.call('/api/tournaments/own/photos','GET',undefined,'organizer')).status,200);
 const key=f.db.prepare('SELECT storage_key FROM tournament_photos').get().storage_key;
 assert.equal((await f.call('/api/media/'+encodeURIComponent(key))).status,404);
 assert.equal((await f.call('/api/tournaments/other/photos/'+p.id,'PATCH',{caption:'hack',expectedVersion:1},'admin')).status,404);
 }finally{f.db.close()}});
test('gallery rejects malformed content and limits before persisting',async()=>{const f=await galleryFixture();try{
 for(const input of [{bytes:new Uint8Array(),type:'image/png'},{bytes:new TextEncoder().encode('<script>'),type:'image/png'},{type:'image/svg+xml'},{caption:'x'.repeat(301)},{bytes:new Uint8Array(6*1024*1024+1)}])assert.ok([400,413].includes((await f.upload(input)).status));
 assert.equal(f.objects.size,0);
 }finally{f.db.close()}});
test('audit failure rolls back photo and cleans up upload',async()=>{const f=await galleryFixture();try{
 f.db.exec("CREATE TRIGGER fail_photo BEFORE INSERT ON audit_logs WHEN NEW.action='PHOTO_ADD' BEGIN SELECT RAISE(ABORT,'AUDIT_FAILURE'); END;");
 assert.equal((await f.upload()).status,500);assert.equal(f.objects.size,0);assert.equal(f.db.prepare('SELECT count(*) n FROM tournament_photos').get().n,0);
 }finally{f.db.close()}});
for(const [action,method,body] of [['PHOTO_UPDATE','PATCH',{caption:'Không được lưu',expectedVersion:1}],['PHOTO_REMOVE','DELETE',{expectedVersion:1}]])test(action+' audit failure rolls mutation back',async()=>{const f=await galleryFixture();try{
 const photo=await (await f.upload()).json(),before={...f.db.prepare('SELECT * FROM tournament_photos WHERE id=?').get(photo.id)};
 f.db.exec(`CREATE TRIGGER fail_mutation BEFORE INSERT ON audit_logs WHEN NEW.action='${action}' BEGIN SELECT RAISE(ABORT,'AUDIT_FAILURE'); END;`);
 assert.equal((await f.call('/api/tournaments/own/photos/'+photo.id,method,body,'organizer')).status,500);
 assert.deepEqual({...f.db.prepare('SELECT * FROM tournament_photos WHERE id=?').get(photo.id)},before);
 assert.equal((await f.call(photo.url)).status,200);
 }finally{f.db.close()}});
