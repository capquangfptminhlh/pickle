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

  if (!form) return;

  // Package selector radio logic
  document.querySelectorAll(".package-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".package-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      const radio = card.querySelector("input[type=radio]");
      if (radio) radio.checked = true;
    });
  });

  // Zalo CRM Assistant logic
  const zaloBox = $("#zaloCrmBox");
  const zaloList = $("#zaloSuggestList");
  const zaloCount = $("#zaloCrmCount");
  const filterBtn = $("#btnFilterPickleOnly");
  let onlyPickle = true;

  function renderZaloSuggestions() {
    const list = window.ZALO_CRAWLED_TOURNAMENTS || [];
    if (!list.length) {
      if (zaloBox) zaloBox.hidden = true;
      return;
    }
    const filtered = onlyPickle ? list.filter(t => t.sport === "pickleball") : list;
    if (zaloCount) zaloCount.textContent = `Đã quét ${filtered.length} giải (${onlyPickle ? "Pickleball" : "Tất cả"})`;
    if (!zaloList) return;

    zaloList.innerHTML = filtered.slice(0, 15).map(t => {
      const feeText = t.entryFee ? (Number(t.entryFee).toLocaleString("vi-VN") + " đ") : "Miễn phí / Chưa rõ";
      const bannerImg = t.coverUrl ? `<div style="width: 100%; height: 110px; border-radius: 10px; overflow: hidden; margin-bottom: 8px; position: relative; background: #000"><img src="${t.coverUrl}" alt="${t.name}" style="width: 100%; height: 100%; object-fit: cover"><span style="position: absolute; bottom: 4px; right: 4px; background: #0369a1; color: #fff; font-size: 8px; font-weight: 800; padding: 2px 5px; border-radius: 4px">POSTER OCR</span></div>` : "";
      return `
        <div class="zalo-tour-chip" data-zalo-id="${t.id}" style="min-width: 250px; max-width: 280px; flex-shrink: 0; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; padding: 12px 14px; cursor: pointer; transition: all .2s; scroll-snap-align: start">
          ${bannerImg}
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px">
            <span style="font-size: 10px; font-weight: 800; background: ${t.sport==='pickleball'?'#dfff69':'#52b6ff'}; color: #0d2118; padding: 2px 6px; border-radius: 4px; text-transform: uppercase">${t.sport}</span>
            <small style="color: #9feec4; font-size: 11px">📅 ${t.date || "Sắp diễn ra"}</small>
          </div>
          <strong style="display: block; font-size: 13px; color: #fff; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis" title="${t.name}">${t.name}</strong>
          <div style="font-size: 11px; color: #c4ebd4; line-height: 1.4">
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">📍 ${t.venue || "Chưa rõ sân"}</div>
            <div>🏸 ${t.divisionName || "Open"}</div>
            <div style="margin-top: 4px; font-weight: 700; color: #dfff69">💰 Phí: ${feeText}</div>
          </div>
          <button type="button" class="btn mini" style="width: 100%; margin-top: 8px; background: #25d366; color: #042415; font-weight: 800; border: none; padding: 6px 10px; border-radius: 8px; font-size: 11px">⚡ Điền thông tin này</button>
        </div>
      `;
    }).join("");

    zaloList.querySelectorAll(".zalo-tour-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const id = chip.dataset.zaloId;
        const item = list.find(x => x.id === id);
        if (!item) return;

        $("#tourName").value = item.name || "";
        $("#tourVenue").value = item.venue || "";
        if (item.startAt && item.startAt.includes("-")) {
          const dStr = item.startAt.length === 10 ? item.startAt + "T08:00" : item.startAt.slice(0, 16);
          $("#tourStart").value = dStr;
        }
        $("#tourDivision").value = item.divisionName || "Open";
        if ($("#tourEventType")) $("#tourEventType").value = item.eventType || "doubles";
        if ($("#tourFee")) $("#tourFee").value = item.entryFee ? (Number(item.entryFee).toLocaleString("vi-VN") + " đ") : "";
        if ($("#tourPrize")) $("#tourPrize").value = item.prizePool ? (Number(item.prizePool).toLocaleString("vi-VN") + " đ") : "";
        if ($("#contactName")) $("#contactName").value = item.contactName || "Ban Tổ Chức";
        if ($("#contactPhone")) $("#contactPhone").value = item.contactPhone || "";

        if (item.sponsorPackage) {
          const radio = document.querySelector(`input[name=sponsorPackage][value="${item.sponsorPackage}"]`);
          if (radio) {
            document.querySelectorAll(".package-card").forEach(c => c.classList.remove("selected"));
            radio.checked = true;
            radio.closest(".package-card")?.classList.add("selected");
          }
        }

        form.scrollIntoView({ behavior: "smooth", block: "start" });
        toast(`⚡ Đã tự động điền thông tin giải: "${item.name}" từ Zalo CRM!`);
      });
    });
  }

  if (filterBtn) {
    filterBtn.addEventListener("click", () => {
      onlyPickle = !onlyPickle;
      filterBtn.textContent = onlyPickle ? "Pickleball" : "Tất cả môn";
      renderZaloSuggestions();
    });
  }

  renderZaloSuggestions();

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
        res = await PickleAPI.submitTournament(payload);
      } else {
        const r = await fetch("/api/public/tournaments/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
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
      toast("Đăng giải thành công!");
    } catch (err) {
      console.error(err);
      toast("Lỗi đăng giải: " + (err.message || "Vui lòng thử lại"));
      submitBtn.disabled = false;
      submitBtn.textContent = "Gửi thông tin đăng giải";
    }
  });
})();
