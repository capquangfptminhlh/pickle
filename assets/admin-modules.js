(()=>{
  const API=window.PickleAPI;
  const money=v=>v==null||v===""?"—":Number(v).toLocaleString("vi-VN")+" đ";
  const date=v=>v?new Date(v).toLocaleString("vi-VN",{dateStyle:"short",timeStyle:"short"}):"—";
  const badge=(text,type="neutral")=>'<span class="status-chip '+type+'">'+text+'</span>';
  const modal=(title,body)=>{
    const d=document.querySelector("#genericDialog");
    document.querySelector("#genericTitle").textContent=title;
    document.querySelector("#genericBody").innerHTML=body;
    d.showModal();
    return d;
  };
  const metric=(label,value,sub="")=>'<div class="metric-card"><span>'+label+'</span><strong>'+value+'</strong><small>'+sub+'</small></div>';
  const empty=text=>'<div class="module-empty"><div class="module-empty-mark">P</div><b>'+text+'</b><span>Chưa có dữ liệu để hiển thị.</span></div>';

  async function registrations(ctx){
    ctx.setHeader("Đăng ký & Check-in","Duyệt đội, QR check-in và trạng thái có mặt");
    const rows=await API.registrations().catch(()=>[]);
    const checked=rows.filter(r=>r.checked_in_at).length;
    const paid=rows.filter(r=>r.payment_status==="paid").length;
    const html='<div class="module-metrics">'+
      metric("Tổng đăng ký",rows.length,"Hồ sơ tham dự")+
      metric("Đã check-in",checked,rows.length?Math.round(checked*100/rows.length)+"%":"0%")+
      metric("Đã thanh toán",paid,rows.length?Math.round(paid*100/rows.length)+"%":"0%")+
      metric("Chờ xử lý",rows.filter(r=>!r.checked_in_at).length,"Chưa có mặt")+
      '</div>'+
      '<div class="panel pro-panel"><div class="module-toolbar"><div><h2>Danh sách đăng ký</h2><p>Check-in thủ công hoặc QR tại quầy</p></div>'+
      (ctx.canManage()?'<button class="btn primary" data-module-action="new-registration">Thêm đăng ký</button>':'')+
      '</div><div class="table-wrap"><table class="table pro-table"><thead><tr><th>Đội</th><th>Giải / Nội dung</th><th>Thanh toán</th><th>Check-in</th><th>Thao tác</th></tr></thead><tbody>'+
      rows.map(r=>'<tr><td><b>'+ (r.team_name||"—") +'</b><small class="muted-block">'+money(r.amount)+'</small></td><td>'+r.tournament_name+'<small class="muted-block">'+r.division_name+'</small></td><td>'+badge(r.payment_status==="paid"?"Đã thanh toán":r.payment_status==="pending"?"Chờ duyệt":"Chưa thanh toán",r.payment_status==="paid"?"success":r.payment_status==="pending"?"warning":"neutral")+'</td><td>'+ (r.checked_in_at?badge("Đã check-in","success")+"<small class='muted-block'>"+date(r.checked_in_at)+"</small>":badge("Chưa check-in","warning")) +'</td><td><div class="actions">'+
        (r.checked_in_at?'<button class="mini" data-undo-checkin="'+r.id+'">Hoàn tác</button>':'<button class="mini primary-mini" data-checkin="'+r.id+'">Check-in</button>')+
        '<button class="mini" data-qr="'+r.id+'">QR</button><button class="mini danger-mini" data-cancel-registration="'+r.id+'">Hủy</button></div></td></tr>').join("")+
      '</tbody></table></div></div>';

    return {html,bind(){
      document.querySelectorAll("[data-checkin]").forEach(b=>b.onclick=async()=>{try{await API.checkin(b.dataset.checkin);ctx.toast("Đã check-in.");await ctx.refresh()}catch(e){ctx.toast("Không thể check-in: "+e.message)}});
      document.querySelectorAll("[data-undo-checkin]").forEach(b=>b.onclick=async()=>{try{await API.undoCheckin(b.dataset.undoCheckin);ctx.toast("Đã hoàn tác check-in.");await ctx.refresh()}catch(e){ctx.toast("Không thể hoàn tác: "+e.message)}});
      document.querySelectorAll("[data-qr]").forEach(b=>b.onclick=async()=>{try{
        const q=await API.checkinQr(b.dataset.qr);
        modal("QR Check-in",'<div class="qr-card"><img src="'+q.dataUrl+'" alt="QR check-in"><b>Quét mã tại quầy</b><small>'+q.url+'</small></div>');
      }catch(e){ctx.toast("Không tạo được QR: "+e.message)}});
      document.querySelectorAll("[data-cancel-registration]").forEach(b=>b.onclick=async()=>{if(!confirm("Hủy đăng ký này?"))return;try{await API.deleteRegistration(b.dataset.cancelRegistration);await ctx.refresh();ctx.toast("Đã hủy đăng ký.")}catch(e){ctx.toast("Không thể hủy: "+e.message)}});
      const add=document.querySelector('[data-module-action="new-registration"]');
      if(add)add.onclick=()=>{
        if(!ctx.state.divisions.length||!ctx.state.teams.length)return ctx.toast("Cần có nội dung và đội trước.");
        modal("Thêm đăng ký",'<div class="form-grid"><label class="field full">Nội dung<select id="modRegDivision">'+ctx.state.divisions.map(d=>'<option value="'+d.id+'">'+d.name+'</option>').join("")+'</select></label><label class="field full">Đội<select id="modRegTeam"></select></label><label class="field full">Lệ phí<input id="modRegAmount" type="number" min="0"></label><div class="field full"><button class="btn primary" type="button" id="modSaveReg">Tạo đăng ký</button></div></div>');
        const div=document.querySelector("#modRegDivision"),team=document.querySelector("#modRegTeam"),save=document.querySelector("#modSaveReg");
        const syncTeams=()=>{
          const teams=ctx.state.teams.filter(t=>t.divisionId===div.value);
          team.innerHTML=teams.map(t=>'<option value="'+t.id+'">'+t.name+'</option>').join("");
          save.disabled=!teams.length;
        };
        div.onchange=syncTeams;syncTeams();
        save.onclick=async()=>{
          if(!team.value)return ctx.toast("Nội dung này chưa có đội để đăng ký.");
          try{await API.createRegistration(div.value,{teamId:team.value,amount:Number(document.querySelector("#modRegAmount").value)||null});document.querySelector("#genericDialog").close();await ctx.refresh();ctx.toast("Đã thêm đăng ký.")}catch(e){ctx.toast("Không thể tạo: "+e.message)}
        };
      };
    }};
  }

  async function clubs(ctx){
    ctx.setHeader("CLB","Quản lý CLB, khu vực và lực lượng VĐV");
    const rows=await API.clubs().catch(()=>[]);
    const players=await API.players().catch(()=>[]);
    const html='<div class="module-toolbar standalone"><div><h2>Danh sách CLB</h2><p>'+rows.length+' CLB trong hệ thống</p></div><button class="btn primary" data-module-action="new-club">Thêm CLB</button></div>'+
      '<div class="club-grid">'+(rows.map(c=>{
        const n=players.filter(p=>p.club_id===c.id).length;
        return '<article class="club-card" data-club-id="'+c.id+'"><div class="club-monogram">'+(c.name||"C").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()+'</div><div><h3>'+c.name+'</h3><p>'+(c.city||"Chưa khai báo khu vực")+'</p><div class="actions" style="margin-top:8px"><button class="mini" data-edit-club="'+c.id+'">Sửa</button><button class="mini danger-mini" data-delete-club="'+c.id+'">Khóa/Xóa</button></div></div><div class="club-stat"><strong>'+n+'</strong><span>VĐV</span></div></article>';
      }).join("")||empty("Chưa có CLB"))+'</div>';
    return {html,bind(){
      document.querySelectorAll("[data-edit-club]").forEach(b=>b.onclick=()=>{
        const row=rows.find(x=>x.id===b.dataset.editClub);if(!row)return;
        modal("Sửa CLB",'<div class="form-grid"><label class="field full">Tên CLB<input id="modEditClubName" value="'+row.name+'"></label><label class="field full">Khu vực / Thành phố<input id="modEditClubCity" value="'+(row.city||"")+'"></label><label class="field full"><span><input id="modEditClubActive" type="checkbox" '+(row.active!==false?"checked":"")+'> Hoạt động</span></label><div class="field full"><button class="btn primary" type="button" id="modUpdateClub">Lưu CLB</button></div></div>');
        document.querySelector("#modUpdateClub").onclick=async()=>{try{await API.updateClub(row.id,{name:document.querySelector("#modEditClubName").value,city:document.querySelector("#modEditClubCity").value,active:document.querySelector("#modEditClubActive").checked});document.querySelector("#genericDialog").close();await ctx.refresh();ctx.toast("Đã cập nhật CLB.")}catch(e){ctx.toast("Không thể cập nhật: "+e.message)}};
      });
      document.querySelectorAll("[data-delete-club]").forEach(b=>b.onclick=async()=>{if(!confirm("Khóa/xóa CLB này?"))return;try{await API.deleteClub(b.dataset.deleteClub);await ctx.refresh();ctx.toast("Đã xử lý CLB.")}catch(e){ctx.toast("Không thể xử lý: "+e.message)}});
      document.querySelector('[data-module-action="new-club"]')?.addEventListener("click",()=>{
        modal("Thêm CLB",'<div class="form-grid"><label class="field full">Tên CLB<input id="modClubName"></label><label class="field full">Khu vực / Thành phố<input id="modClubCity"></label><div class="field full"><button class="btn primary" type="button" id="modSaveClub">Tạo CLB</button></div></div>');
        document.querySelector("#modSaveClub").onclick=async()=>{try{await API.createClub({name:document.querySelector("#modClubName").value,city:document.querySelector("#modClubCity").value});document.querySelector("#genericDialog").close();await ctx.refresh();ctx.toast("Đã tạo CLB.")}catch(e){ctx.toast("Không thể tạo CLB: "+e.message)}};
      });
    }};
  }

  async function bookings(ctx){
    ctx.setHeader("Booking sân","Lịch đặt sân, xung đột giờ và trạng thái booking");
    const rows=await API.bookings().catch(()=>[]);
    const html='<div class="module-toolbar standalone"><div><h2>Booking</h2><p>'+rows.length+' lịch đặt</p></div><button class="btn primary" data-module-action="new-booking">Tạo booking</button></div>'+
      '<div class="booking-list">'+(rows.map(r=>'<article class="booking-card"><div class="booking-time"><strong>'+new Date(r.start_at).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})+'</strong><span>'+new Date(r.start_at).toLocaleDateString("vi-VN")+'</span></div><div class="booking-main"><h3>'+r.title+'</h3><p>'+r.court_name+' • '+r.tournament_name+'</p><small>'+(r.contact_name||"Không ghi người liên hệ")+(r.contact_phone?" • "+r.contact_phone:"")+'</small></div>'+badge(r.status==="confirmed"?"Đã xác nhận":r.status,r.status==="confirmed"?"success":"neutral")+'<button class="mini danger-mini" data-cancel-booking="'+r.id+'">Hủy</button></article>').join("")||empty("Chưa có booking"))+'</div>';
    return {html,bind(){
      document.querySelectorAll("[data-cancel-booking]").forEach(b=>b.onclick=async()=>{if(!confirm("Hủy booking này?"))return;try{await API.deleteBooking(b.dataset.cancelBooking);await ctx.refresh();ctx.toast("Đã hủy booking.")}catch(e){ctx.toast("Không thể hủy: "+e.message)}});
      document.querySelector('[data-module-action="new-booking"]')?.addEventListener("click",()=>{
        if(!ctx.state.courts.length)return ctx.toast("Chưa có sân.");
        modal("Tạo booking",'<div class="form-grid"><label class="field full">Sân<select id="modBookCourt">'+ctx.state.courts.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join("")+'</select></label><label class="field full">Tên booking<input id="modBookTitle" placeholder="VD: Social tối thứ 6"></label><label class="field">Bắt đầu<input id="modBookStart" type="datetime-local"></label><label class="field">Kết thúc<input id="modBookEnd" type="datetime-local"></label><label class="field">Người liên hệ<input id="modBookName"></label><label class="field">Điện thoại<input id="modBookPhone"></label><label class="field full">Ghi chú<textarea id="modBookNotes" rows="3"></textarea></label><div class="field full"><button class="btn primary" type="button" id="modSaveBooking">Lưu booking</button></div></div>');
        document.querySelector("#modSaveBooking").onclick=async()=>{try{await API.createBooking({courtId:document.querySelector("#modBookCourt").value,title:document.querySelector("#modBookTitle").value,startAt:document.querySelector("#modBookStart").value,endAt:document.querySelector("#modBookEnd").value,contactName:document.querySelector("#modBookName").value,contactPhone:document.querySelector("#modBookPhone").value,notes:document.querySelector("#modBookNotes").value});document.querySelector("#genericDialog").close();await ctx.refresh();ctx.toast("Đã tạo booking.")}catch(e){ctx.toast(e.message==="BOOKING_CONFLICT"?"Khung giờ này bị trùng booking.":"Không thể tạo booking: "+e.message)}};
      });
    }};
  }

  async function sponsors(ctx){
    ctx.setHeader("Sponsor","Logo, hạng tài trợ và liên kết hiển thị");
    const rows=await API.sponsors().catch(()=>[]);
    const html='<div class="module-toolbar standalone"><div><h2>Nhà tài trợ</h2><p>'+rows.length+' sponsor</p></div><button class="btn primary" data-module-action="new-sponsor">Thêm sponsor</button></div>'+
      '<div class="sponsor-grid">'+(rows.map(s=>'<article class="sponsor-card">'+(s.logo_url?'<img src="'+s.logo_url+'" alt="">':'<div class="sponsor-placeholder">'+s.name.slice(0,1).toUpperCase()+'</div>')+'<div><h3>'+s.name+'</h3><p>'+(s.tier||"Sponsor")+'</p></div><div class="actions"><button class="mini danger-mini" data-delete-sponsor="'+s.id+'">Xóa</button></div></article>').join("")||empty("Chưa có sponsor"))+'</div>';
    return {html,bind(){
      document.querySelector('[data-module-action="new-sponsor"]')?.addEventListener("click",()=>{
        modal("Thêm sponsor",'<div class="form-grid"><label class="field full">Tên sponsor<input id="modSponsorName"></label><label class="field">Hạng<select id="modSponsorTier"><option>Title</option><option>Gold</option><option>Silver</option><option>Partner</option></select></label><label class="field">Website<input id="modSponsorWeb" type="url"></label><label class="field full">Logo<input id="modSponsorLogo" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="field full"><button class="btn primary" type="button" id="modSaveSponsor">Lưu sponsor</button></div></div>');
        document.querySelector("#modSaveSponsor").onclick=async()=>{try{
          let logoUrl=null;const file=document.querySelector("#modSponsorLogo").files?.[0];if(file)logoUrl=(await API.uploadImage(file)).url;
          await API.createSponsor({name:document.querySelector("#modSponsorName").value,tier:document.querySelector("#modSponsorTier").value,websiteUrl:document.querySelector("#modSponsorWeb").value,logoUrl});
          document.querySelector("#genericDialog").close();await ctx.refresh();ctx.toast("Đã thêm sponsor.");
        }catch(e){ctx.toast("Không thể thêm sponsor: "+e.message)}};
      });
      document.querySelectorAll("[data-delete-sponsor]").forEach(b=>b.onclick=async()=>{if(!confirm("Xóa sponsor này?"))return;try{await API.deleteSponsor(b.dataset.deleteSponsor);await ctx.refresh();ctx.toast("Đã xóa sponsor.")}catch(e){ctx.toast("Không thể xóa: "+e.message)}});
    }};
  }

  async function content(ctx){
    ctx.setHeader("Tin tức & Media","Bài viết, ảnh bìa và nội dung truyền thông giải");
    const rows=await API.posts().catch(()=>[]);
    const html='<div class="module-toolbar standalone"><div><h2>Nội dung</h2><p>'+rows.length+' bài viết</p></div><button class="btn primary" data-module-action="new-post">Viết bài</button></div>'+
      '<div class="content-grid">'+(rows.map(p=>'<article class="content-card">'+(p.cover_url?'<img src="'+p.cover_url+'" alt="">':'<div class="content-cover-placeholder"></div>')+'<div class="content-card-body">'+badge(p.status==="published"?"Đã đăng":p.status,p.status==="published"?"success":"neutral")+'<h3>'+p.title+'</h3><p>'+(p.excerpt||"Chưa có mô tả")+'</p><div class="actions">'+(p.status!=="published"?'<button class="mini primary-mini" data-publish-post="'+p.id+'">Đăng</button>':'')+'<button class="mini danger-mini" data-delete-post="'+p.id+'">Xóa</button></div></div></article>').join("")||empty("Chưa có bài viết"))+'</div>';
    return {html,bind(){
      document.querySelector('[data-module-action="new-post"]')?.addEventListener("click",()=>{
        modal("Viết bài",'<div class="form-grid"><label class="field full">Tiêu đề<input id="modPostTitle"></label><label class="field full">Mô tả ngắn<textarea id="modPostExcerpt" rows="2"></textarea></label><label class="field full">Nội dung<textarea id="modPostBody" rows="8"></textarea></label><label class="field full">Ảnh bìa<input id="modPostCover" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="field">Trạng thái<select id="modPostStatus"><option value="draft">Bản nháp</option><option value="published">Đăng ngay</option></select></label><div class="field full"><button class="btn primary" type="button" id="modSavePost">Lưu bài</button></div></div>');
        document.querySelector("#modSavePost").onclick=async()=>{try{let coverUrl=null;const file=document.querySelector("#modPostCover").files?.[0];if(file)coverUrl=(await API.uploadImage(file)).url;await API.createPost({title:document.querySelector("#modPostTitle").value,excerpt:document.querySelector("#modPostExcerpt").value,body:document.querySelector("#modPostBody").value,status:document.querySelector("#modPostStatus").value,coverUrl});document.querySelector("#genericDialog").close();await ctx.refresh();ctx.toast("Đã lưu bài.")}catch(e){ctx.toast("Không thể lưu bài: "+e.message)}};
      });
      document.querySelectorAll("[data-publish-post]").forEach(b=>b.onclick=async()=>{try{await API.updatePost(b.dataset.publishPost,{status:"published"});await ctx.refresh();ctx.toast("Đã đăng bài.")}catch(e){ctx.toast("Không thể đăng: "+e.message)}});
      document.querySelectorAll("[data-delete-post]").forEach(b=>b.onclick=async()=>{if(!confirm("Xóa bài viết này?"))return;try{await API.deletePost(b.dataset.deletePost);await ctx.refresh()}catch(e){ctx.toast("Không thể xóa: "+e.message)}});
    }};
  }

  async function reports(ctx){
    ctx.setHeader("Báo cáo","Tổng quan vận hành, doanh thu và xuất dữ liệu");
    const r=await API.reportOverview().catch(()=>({registrations:0,checked_in:0,paid_count:0,revenue:0,matches:0,live:0,completed:0,players:0}));
    const html='<div class="module-metrics reports">'+
      metric("VĐV",r.players,"Đang hoạt động")+
      metric("Đăng ký",r.registrations,"Hồ sơ")+
      metric("Check-in",r.checked_in,"Có mặt")+
      metric("Doanh thu",money(r.revenue),"Đã xác nhận")+
      metric("Trận đấu",r.matches,"Tổng số")+
      metric("Đang live",r.live,"Realtime")+
      metric("Hoàn tất",r.completed,"Đã chốt")+
      '</div><div class="panel pro-panel"><div class="module-toolbar"><div><h2>Xuất báo cáo</h2><p>CSV đăng ký, thanh toán và check-in</p></div><a class="btn primary" href="/api/reports/export.csv">Tải CSV</a></div><div class="report-visual"><div class="report-ring" style="--p:'+(r.registrations?Math.round(r.checked_in*100/r.registrations):0)+'"><strong>'+(r.registrations?Math.round(r.checked_in*100/r.registrations):0)+'%</strong><span>Check-in</span></div><div class="report-copy"><h3>Tình trạng vận hành</h3><p>Dashboard tổng hợp lấy trực tiếp từ PostgreSQL. Không sử dụng số liệu giả.</p></div></div></div>';
    return {html,bind(){}};
  }

  async function settings(ctx){
    ctx.setHeader("Cấu hình & Branding","Nhận diện hệ thống và rule thi đấu");
    const brand=await API.branding().catch(()=>({}));
    const html='<div class="settings-layout"><div class="panel pro-panel"><div class="panel-head"><div><h2>Branding</h2><p>Tên hệ thống, màu thương hiệu và logo</p></div></div><div class="form-grid"><label class="field full">Tên thương hiệu<input id="brandName" value="'+(brand.name||"Pickle Tour")+'"></label><label class="field">Màu chính<input id="brandColor" type="color" value="'+(brand.primaryColor||"#0a8b55")+'"></label><label class="field">Màu nhấn<input id="brandAccent" type="color" value="'+(brand.accentColor||"#dfff69")+'"></label><label class="field full">Logo URL<input id="brandLogo" value="'+(brand.logoUrl||"")+'"></label><div class="field full"><button class="btn primary" type="button" id="saveBranding">Lưu Branding</button></div></div></div><div class="brand-preview" style="--brand-preview:'+(brand.primaryColor||"#0a8b55")+';--accent-preview:'+(brand.accentColor||"#dfff69")+'"><span>LIVE TOURNAMENT OS</span><h2>'+(brand.name||"Pickle Tour")+'</h2><p>Preview nhận diện thương hiệu</p></div></div>'+
      '<div class="page-grid rules-grid">'+ctx.state.divisions.map(d=>'<div class="panel pro-panel"><div class="panel-head"><div><h2>'+d.name+'</h2><p>'+d.eventType+' • '+d.format+'</p></div></div><div class="rule-summary"><span>Best of <b>'+d.bestOf+'</b></span><span>Điểm <b>'+d.pointsToWin+'</b></span><span>Top <b>'+d.advanceCount+'</b></span><span>'+ (d.winByTwo?"Win by 2":"Không cách 2") +'</span></div></div>').join("")+'</div>';
    return {html,bind(){
      document.querySelector("#saveBranding")?.addEventListener("click",async()=>{try{await API.saveBranding({name:document.querySelector("#brandName").value,primaryColor:document.querySelector("#brandColor").value,accentColor:document.querySelector("#brandAccent").value,logoUrl:document.querySelector("#brandLogo").value});ctx.toast("Đã lưu branding.");await ctx.refresh()}catch(e){ctx.toast("Không thể lưu branding: "+e.message)}});
    }};
  }

  window.AdminModules={registrations,clubs,bookings,sponsors,content,reports,settings};
})();