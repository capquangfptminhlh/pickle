(() => {
  const $ = s => document.querySelector(s);
  const toast = msg => {
    const old = $(".pwa-toast"); if (old) old.remove();
    const t = document.createElement("div"); t.className = "pwa-toast";
    t.innerHTML = `<span>${msg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => { if (t.isConnected) t.remove(); }, 4000);
  };

  const form = $("#submitForm");
  const successBox = $("#submitSuccess");
  const submitBtn = $("#submitBtn");
  const bannerInput = $("#tourBanner");
  const bannerPreviewWrap = $("#tourBannerPreviewWrap");
  const bannerPreview = $("#tourBannerPreview");
  const bannerRemove = $("#tourBannerRemove");
  const bannerUpload = document.querySelector(".tournament-banner-upload");
  let bannerObjectUrl = "";

  if (!form) return;

  const resetBanner = () => {
    if (bannerObjectUrl) URL.revokeObjectURL(bannerObjectUrl);
    bannerObjectUrl = "";
    if (bannerInput) bannerInput.value = "";
    if (bannerPreview) bannerPreview.removeAttribute("src");
    if (bannerPreviewWrap) bannerPreviewWrap.hidden = true;
    bannerUpload?.classList.remove("has-preview");
  };
  const validateBanner = file => {
    if (!file) return true;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type)) {
      toast("Banner chỉ hỗ trợ JPG, PNG hoặc WebP.");
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("Banner tối đa 5MB. Vui lòng chọn ảnh nhẹ hơn.");
      return false;
    }
    return true;
  };
  bannerInput?.addEventListener("change", () => {
    const file = bannerInput.files?.[0];
    if (!file) return resetBanner();
    if (!validateBanner(file)) return resetBanner();
    if (bannerObjectUrl) URL.revokeObjectURL(bannerObjectUrl);
    bannerObjectUrl = URL.createObjectURL(file);
    if (bannerPreview) bannerPreview.src = bannerObjectUrl;
    if (bannerPreviewWrap) bannerPreviewWrap.hidden = false;
    bannerUpload?.classList.add("has-preview");
  });
  bannerRemove?.addEventListener("click", resetBanner);

  // Package selector radio logic
  document.querySelectorAll(".package-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".package-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      const radio = card.querySelector("input[type=radio]");
      if (radio) radio.checked = true;
    });
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (submitBtn.disabled) return;

    const name = $("#tourName").value.trim();
    const venue = $("#tourVenue").value.trim();
    const startAt = $("#tourStart").value;
    const endAt = $("#tourEnd").value || null;
    const divisionName = $("#tourDivision").value.trim() || "Open";
    const eventType = $("#tourEventType").value;
    const format = $("#tourFormat").value;
    const entryFee = $("#tourFee").value.trim();
    const prizePool = $("#tourPrize").value.trim();
    const contactName = $("#contactName").value.trim();
    const contactPhone = $("#contactPhone").value.trim();
    const contactEmail = $("#contactEmail").value.trim();
    const sponsorPackage = document.querySelector("input[name=sponsorPackage]:checked")?.value || "free";
    const bannerFile = bannerInput?.files?.[0] || null;

    if (!name || name.length < 3) {
      toast("Vui lòng nhập tên giải đấu (tối thiểu 3 ký tự).");
      $("#tourName").focus();
      return;
    }
    if (!venue) {
      toast("Vui lòng nhập địa điểm / sân thi đấu.");
      $("#tourVenue").focus();
      return;
    }
    if (!contactName || !contactPhone) {
      toast("Vui lòng điền họ tên và số điện thoại / Zalo của BTC.");
      $("#contactName").focus();
      return;
    }
    if (bannerFile && !validateBanner(bannerFile)) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Đang xử lý...";

    try {
      const payload = {
        name,
        venue,
        startAt: startAt ? new Date(startAt).toISOString() : null,
        endAt: endAt ? new Date(endAt).toISOString() : null,
        divisionName,
        eventType,
        format,
        entryFee,
        prizePool,
        contactName,
        contactPhone,
        contactEmail,
        sponsorPackage
      };

      let res;
      if (window.PickleAPI?.submitTournament) {
        res = await PickleAPI.submitTournament(payload, bannerFile);
      } else {
        const options = {method:"POST"};
        if (bannerFile) {
          const fd = new FormData();
          Object.entries(payload).forEach(([key,value]) => {
            if (value !== null && value !== undefined) fd.append(key, String(value));
          });
          fd.append("banner", bannerFile);
          options.body = fd;
        } else {
          options.headers = {"Content-Type":"application/json"};
          options.body = JSON.stringify(payload);
        }
        const r = await fetch("/api/public/tournaments/submit", options);
        res = await r.json();
        if (!r.ok) throw new Error(res.error || "Lỗi đăng ký");
      }

      form.hidden = true;
      if (successBox) {
        successBox.hidden = false;
        $("#successTourName").textContent = res.tournament?.name || name;
        const tourLink = $("#successTourLink");
        if (tourLink && res.tournament?.id) {
          tourLink.href = `tournament.html?id=${encodeURIComponent(res.tournament.id)}`;
        }
      }
      if (bannerObjectUrl) {
        URL.revokeObjectURL(bannerObjectUrl);
        bannerObjectUrl = "";
      }
      toast("Đăng giải thành công!");
    } catch (err) {
      console.error(err);
      toast("Lỗi đăng giải: " + (err.message || "Vui lòng thử lại"));
      submitBtn.disabled = false;
      submitBtn.textContent = "Gửi thông tin đăng giải";
    }
  });
})();
