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
          tourLink.href = `/tournament.html?id=${encodeURIComponent(res.tournament.id)}`;
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
