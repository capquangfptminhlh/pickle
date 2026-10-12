(() => {
  const api=()=>window.PickleAPI;
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node};
  const button=(text,action)=>{const b=el('button','btn secondary',text);b.type='button';if(action)b.addEventListener('click',action);return b};
  const message=error=>error?.status===409?'Ảnh đã được thay đổi ở nơi khác. Danh sách đã được tải lại; hãy kiểm tra rồi thử lại.':error?.status===403?'Bạn không có quyền quản lý ảnh của giải này.':error?.status===404?'Không tìm thấy album hoặc giải chưa được công khai.':({INVALID_FILE_TYPE:'Chỉ chọn ảnh JPEG, PNG hoặc WebP.',FILE_TOO_LARGE:'Ảnh sau nén vượt quá 6 MiB.',GALLERY_STORAGE_FULL:'Bộ nhớ trình duyệt đã đầy. Ảnh chưa được lưu.',INVALID_CAPTION:'Chú thích tối đa 300 ký tự.'}[error?.message]||'Không thể thực hiện. Vui lòng thử lại.');
  const sort=photos=>[...photos].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  let dialogCounter=0,manager=null,publicId=null;
  function dialog(cls,title){
    const previous=document.activeElement,d=el('dialog','gallery-dialog '+cls),head=el('header','gallery-head'),heading=el('h2','',title);
    heading.id='gallery-title-'+(++dialogCounter);d.setAttribute('aria-labelledby',heading.id);
    const close=button('Đóng',()=>d.close());close.dataset.galleryClose='';head.append(heading,close);d.append(head);document.body.append(d);
    d.addEventListener('close',()=>{d.remove();if(previous?.isConnected)previous.focus()});d.showModal();return d;
  }
  async function image(photo,authenticated,urls){
    const img=el('img');img.alt=photo.caption||'Ảnh kỷ niệm giải đấu';img.loading='lazy';
    try{const url=await api().galleryImageUrl(photo.url,authenticated);if(url.startsWith('blob:'))urls.push(url);img.src=url}catch{img.alt='Không tải được ảnh. Vui lòng tải lại album.'}
    return img;
  }
  function viewer(photos,start,authenticated=false){
    const d=dialog('gallery-viewer','Ảnh kỷ niệm'),body=el('div','gallery-viewer-body'),caption=el('p','gallery-viewer-caption'),nav=el('div','gallery-viewer-nav'),count=el('span');let index=start,seq=0,urls=[];
    const prev=button('← Ảnh trước',()=>show(index-1)),next=button('Ảnh sau →',()=>show(index+1));nav.append(prev,count,next);d.append(body,caption,nav);
    async function show(i){index=(i+photos.length)%photos.length;const current=++seq;body.textContent='Đang tải ảnh…';caption.textContent=photos[index].caption||'';count.textContent=`${index+1} / ${photos.length}`;prev.disabled=next.disabled=photos.length<2;const img=await image(photos[index],authenticated,urls);if(current===seq&&d.open)body.replaceChildren(img)}
    d.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(index+(e.key==='ArrowRight'?1:-1))}});
    d.addEventListener('close',()=>{seq++;urls.forEach(URL.revokeObjectURL)});show(index);
  }
  async function loadPublic(tid,force=false){
    const host=document.querySelector('#tourGallery');if(!host||(!force&&publicId===tid))return;publicId=tid;host.textContent='Đang tải ảnh kỷ niệm…';
    try{const photos=sort(await api().tournamentPhotos(tid));if(publicId!==tid)return;host.replaceChildren();if(!photos.length){host.append(el('p','gallery-empty','Chưa có ảnh kỷ niệm. BTC sẽ cập nhật sau giải.'));return}
      const grid=el('div','gallery-grid');host.append(grid);
      for(const [i,p] of photos.entries()){const card=button('',()=>viewer(photos,i));card.className='gallery-thumb';card.dataset.galleryView=p.id;card.setAttribute('aria-label',p.caption||`Xem ảnh ${i+1}`);card.append(await image(p,false,[]));if(p.caption)card.append(el('span','gallery-caption',p.caption));grid.append(card)}
    }catch(error){host.replaceChildren(el('p','gallery-empty',message(error)),button('Thử lại',()=>loadPublic(tid,true)))}
  }
  function manage(tid,name=''){
    if(manager?.open){manager.focus();return}
    const d=manager=dialog('gallery-manager','Ảnh kỷ niệm'+(name?' · '+name:'')),status=el('p','gallery-status'),form=el('div','gallery-upload'),list=el('div','gallery-grid gallery-manage-grid'),log=el('ul','gallery-upload-log');
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const input=el('input');input.type='file';input.multiple=true;input.accept='image/jpeg,image/png,image/webp';input.setAttribute('aria-label','Chọn ảnh kỷ niệm');
    const caption=el('textarea');caption.maxLength=300;caption.rows=2;caption.placeholder='Chú thích cho ảnh mới (tối đa 300 ký tự)';caption.setAttribute('aria-label','Chú thích ảnh mới');
    let photos=[],pending=[],busy=false,urls=[],generation=0;
    const upload=button('Tải ảnh lên',uploadAll);upload.dataset.galleryUpload='';const hint=el('p','gallery-hint','JPEG, PNG, WebP · Tự nén tối đa 1600px · Tối đa 6 MiB mỗi ảnh sau nén.');
    form.append(input,caption,hint,upload,log);d.append(form,status,list);
    if(api().galleryLocalOnly)form.prepend(el('p','gallery-local-note','Bản xem thử: ảnh chỉ lưu trong trình duyệt này, không được tải lên máy chủ.'));
    function setBusy(value){busy=value;d.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=value)}
    d.addEventListener('cancel',e=>{if(busy){e.preventDefault();status.textContent='Đang xử lý ảnh. Vui lòng đợi trước khi đóng.'}});
    d.addEventListener('close',()=>{generation++;urls.forEach(URL.revokeObjectURL);manager=null});
    const unload=e=>{if(busy){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',unload);d.addEventListener('close',()=>window.removeEventListener('beforeunload',unload));
    input.addEventListener('change',()=>{pending=Array.from(input.files);upload.textContent='Tải '+pending.length+' ảnh lên';log.replaceChildren()});
    async function refresh(){status.textContent='Đang tải album…';try{photos=sort(await api().tournamentPhotos(tid));await render();status.textContent=photos.length?`${photos.length} ảnh kỷ niệm`:'Chưa có ảnh. Chọn ảnh để lưu kỷ niệm của giải.'}catch(e){status.textContent=message(e);list.replaceChildren(button('Thử tải lại',refresh))}}
    async function render(){const current=++generation;urls.forEach(URL.revokeObjectURL);urls=[];list.replaceChildren();
      for(const [i,p] of photos.entries()){
        const card=el('article','gallery-photo-card'),thumb=button('',()=>viewer(photos,i,true));thumb.className='gallery-thumb';thumb.dataset.galleryView=p.id;thumb.setAttribute('aria-label',p.caption||`Xem ảnh ${i+1}`);const img=await image(p,true,urls);if(current!==generation||!d.open)return;thumb.append(img);
        const label=el('label','','Chú thích'),edit=el('textarea');edit.value=p.caption||'';edit.maxLength=300;edit.rows=3;edit.dataset.galleryCaption=p.id;label.append(edit);
        const actions=el('div','gallery-photo-actions'),save=button('Lưu chú thích',()=>mutate(()=>api().updateTournamentPhoto(tid,p.id,{caption:edit.value,expectedVersion:p.version}),'Đã lưu chú thích.'));save.dataset.gallerySave=p.id;
        const remove=button('Xóa ảnh',()=>confirmRemove(p,card));remove.dataset.galleryRemove=p.id;actions.append(save,remove);card.append(thumb,label,actions);list.append(card);
      }
    }
    async function mutate(fn,success){if(busy)return;setBusy(true);try{await fn();await refresh();status.textContent=success;if(publicId===tid)publicId=null}catch(e){if(e.status===409)await refresh();status.textContent=message(e)}finally{setBusy(false)}}
    function confirmRemove(p,card){if(card.querySelector('.gallery-remove-confirm'))return;const box=el('div','gallery-remove-confirm'),confirm=button('Xác nhận xóa',()=>mutate(()=>api().deleteTournamentPhoto(tid,p.id,p.version),'Đã xóa ảnh.'));confirm.dataset.galleryConfirmRemove=p.id;box.append(el('p','','Xóa ảnh này khỏi album?'),confirm,button('Hủy',()=>box.remove()));card.append(box);confirm.focus()}
    async function uploadAll(){if(busy)return;if(!pending.length){status.textContent='Vui lòng chọn ảnh trước khi tải lên.';input.focus();return}setBusy(true);log.replaceChildren();const files=[...pending],failed=[];const text=caption.value;
      for(const [i,file] of files.entries()){status.textContent=`Đang tải ${i+1}/${files.length}: ${file.name}`;const item=el('li');log.append(item);try{const p=await api().uploadTournamentPhoto(tid,file,text);photos=sort([p,...photos]);item.textContent=file.name+' · Đã tải lên'}catch(e){failed.push(file);item.textContent=file.name+' · '+message(e);item.className='gallery-error'}}
      pending=failed;input.value='';await render();setBusy(false);upload.textContent=failed.length?'Thử lại '+failed.length+' ảnh lỗi':'Tải ảnh lên';status.textContent=`Đã tải ${files.length-failed.length}/${files.length} ảnh.`+(failed.length?' Các ảnh lỗi được giữ để thử lại.':'');if(publicId===tid)publicId=null;
    }
    refresh();
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-gallery-tournament]');if(b){e.preventDefault();e.stopPropagation();manage(b.dataset.galleryTournament,b.dataset.galleryName||'')}},true);
  window.TournamentGallery={manage,loadPublic};
})();
