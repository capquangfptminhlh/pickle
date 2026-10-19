(() => {
  "use strict";

  const snapshots = new WeakMap();
  const selector = "#tourBracket, #publicBracket, #content";
  const motion = () => window.PickleMotion;
  const gsap = () => window.gsap;

  function snapshot(root) {
    const teams = new Map();
    root.querySelectorAll(".bracket-team-slot[data-motion-key]").forEach(slot => {
      const teamId = slot.dataset.teamId || "";
      const rect = slot.getBoundingClientRect();
      teams.set(slot.dataset.motionKey, {
        teamId: teamId === "TBD" ? "" : teamId,
        division: slot.closest(".bracket-match")?.dataset.divisionId || "",
        element: slot,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      });
    });
    const matches = new Map();
    root.querySelectorAll(".bracket-match[data-match-id]").forEach(match => {
      matches.set(match.dataset.matchId, {
        winner: match.dataset.confirmedWinner || "",
        slot: match.dataset.bracketSlot || "",
        division: match.closest("[data-bracket-division]")?.dataset.bracketDivision || "",
        series: match.closest("[data-bracket-series]")?.dataset.bracketSeries || "A",
      });
    });
    return { teams, matches };
  }

  function cleanup(target, state) {
    if (target?.getAttribute("data-motion-state") === state) target.removeAttribute("data-motion-state");
    if (target?.classList) target.classList.remove("is-motion-advanced", "is-motion-reset");
  }

  function playState(target, state) {
    if (!target) return;
    target.setAttribute("data-motion-state", state);
    target.classList.add(state === "advanced" ? "is-motion-advanced" : "is-motion-reset");
    const api = motion();
    const key = `bracket:${target.dataset.motionKey || state}:${state}`;
    if (!api?.keyed || !gsap()) {
      cleanup(target, state);
      return;
    }
    api.keyed(key, timeline => {
      timeline.fromTo(target,
        state === "advanced"
          ? { filter: "brightness(1.8)", scale: 1.035 }
          : { filter: "brightness(1.5)", opacity: 0.65 },
        { filter: "none", scale: 1, opacity: 1, duration: 0.62, ease: "power2.out", clearProps: "filter,transform,opacity" });
    }, () => cleanup(target, state));
  }

  function animatePaths(root, slot, reset = false, sourceWrap = null) {
    const matchWrap = slot.closest(".bracket-match-wrap");
    const key = matchWrap?.dataset.motionKey;
    if (!key) return;
    const sourceKey = sourceWrap?.dataset.motionKey || "";
    const sourceFilter = sourceKey ? `[data-connector-source="${CSS.escape(sourceKey)}"]` : "";
    root.querySelectorAll(`.bracket-connectors ${sourceFilter}[data-connector-destination="${CSS.escape(key)}"]`).forEach(path => {
      path.classList.add(reset ? "is-resetting" : "is-advancing");
      const api = motion(), gsapApi = gsap();
      const cleanupPath = () => path.classList.remove("is-resetting", "is-advancing");
      if (!api?.keyed || !gsapApi) { cleanupPath(); return; }
      api.keyed(`bracket-path:${key}:${reset ? "reset" : "advance"}:${path.classList.contains("bracket-connector-glow") ? "glow" : "line"}`, timeline => {
        timeline.fromTo(path, { strokeDashoffset: reset ? 0 : 48 }, { strokeDashoffset: reset ? 48 : 0, duration: 0.7, ease: "power2.out" });
      }, cleanupPath);
    });
  }

  function entrance(root) {
    const api = motion();
    if (!api?.entrance) return;
    const targets = root.querySelectorAll(".bracket-round-pro, .bracket-connectors");
    if (!targets.length) return;
    api.entrance(targets, { key: `bracket-draw:${root.id || "root"}`, y: 12, scale: 0.995, duration: 0.42, stagger: 0.09 });
  }

  function resetGhost(previousSlot) {
    const api = motion(), gsapApi = gsap(), rect = previousSlot?.rect;
    if (!rect?.width || !rect?.height || !api?.keyed || !gsapApi || api.reduced?.()) return;
    const ghost = previousSlot.element.cloneNode(true);
    ghost.removeAttribute("data-motion-key");
    ghost.setAttribute("data-motion-state", "reset");
    ghost.classList.add("is-motion-reset");
    Object.assign(ghost.style, {
      position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
      margin: "0", zIndex: "9999", pointerEvents: "none",
    });
    document.body.appendChild(ghost);
    api.keyed(`bracket-reset-ghost:${previousSlot.division}:${previousSlot.element.dataset.motionKey}`, timeline => {
      timeline.fromTo(ghost, { opacity: 1, y: 0 }, { opacity: 0, y: -8, duration: 0.48, ease: "power2.in" });
    }, () => ghost.remove());
  }

  function drawConnectors(root, force = false) {
    root.querySelectorAll(".bracket-tree").forEach(tree => {
      const rounds = [...tree.querySelectorAll(":scope > .bracket-round-pro")];
      if (rounds.length < 2) return;
      const existing = tree.querySelector(".bracket-connectors");
      if (!force && existing?.querySelector("[data-connector-source]")) return;
      existing?.remove();
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("class", "bracket-connectors");
      svg.setAttribute("aria-hidden", "true");
      const width = Math.max(tree.scrollWidth, tree.offsetWidth);
      const height = Math.max(tree.scrollHeight, tree.offsetHeight);
      svg.setAttribute("width", width);
      svg.setAttribute("height", height);
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      const base = tree.getBoundingClientRect();
      const point = (el, side) => {
        const rect = el.getBoundingClientRect();
        return { x: (side === "right" ? rect.right : rect.left) - base.left + tree.scrollLeft, y: rect.top - base.top + rect.height / 2 };
      };
      const append = (d, className, source, destination) => {
        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", d);
        path.setAttribute("class", className);
        path.setAttribute("data-connector-source", source.dataset.motionKey || "");
        path.setAttribute("data-connector-destination", destination.dataset.motionKey || "");
        svg.appendChild(path);
      };
      for (let index = 0; index < rounds.length - 1; index++) {
        const source = [...rounds[index].querySelectorAll(":scope > .bracket-round-matches > .bracket-match-wrap")];
        const destinations = [...rounds[index + 1].querySelectorAll(":scope > .bracket-round-matches > .bracket-match-wrap")];
        destinations.forEach((to, j) => {
          [source[j * 2], source[j * 2 + 1]].filter(Boolean).forEach(from => {
            const start = point(from, "right"), end = point(to, "left");
            const mid = start.x + Math.max(16, (end.x - start.x) * 0.5);
            const d = `M ${start.x} ${start.y} H ${mid} Q ${mid + 6} ${start.y} ${mid + 6} ${start.y + 6} V ${end.y - 6} Q ${mid + 6} ${end.y} ${mid + 12} ${end.y} H ${end.x}`;
            append(d, "bracket-connector-glow", from, to);
            append(d, "bracket-connector-line", from, to);
          });
        });
      }
      tree.prepend(svg);
    });
  }

  function reconcile(root, { forceConnectors = false } = {}) {
    if (!root?.querySelectorAll) return;
    const current = snapshot(root);
    const previous = snapshots.get(root);
    if (!previous) {
      snapshots.set(root, current);
      drawConnectors(root, forceConnectors);
      entrance(root);
      return;
    }
    if (!previous.matches.size && !previous.teams.size) {
      snapshots.set(root, current);
      drawConnectors(root, forceConnectors);
      entrance(root);
      return;
    }

    drawConnectors(root, forceConnectors);
    for (const [matchId, next] of current.matches) {
      const before = previous.matches.get(matchId);
      if (before && !before.winner && next.winner) {
        const source = root.querySelector(`.bracket-match[data-match-id="${CSS.escape(matchId)}"]`);
        const sourceWrap = source?.closest(".bracket-match-wrap");
        const sourceKey = sourceWrap?.dataset.motionKey || "";
        const path = sourceKey ? root.querySelector(`.bracket-connectors [data-connector-source="${CSS.escape(sourceKey)}"]`) : null;
        const destinationKey = path?.dataset.connectorDestination || "";
        const destinationWrap = destinationKey ? root.querySelector(`.bracket-match-wrap[data-motion-key="${CSS.escape(destinationKey)}"]`) : null;
        const destination = [...(destinationWrap?.querySelectorAll(".bracket-team-slot") || [])].find(slot => slot.dataset.teamId === next.winner);
        if (destination) { playState(destination, "advanced"); animatePaths(root, destination, false, sourceWrap); }
      }
    }

    const resetDivision = root.dataset.bracketResetConfirmed || "";
    if (resetDivision) {
      let resetApplied = false;
      for (const [key, beforeTeam] of previous.teams) {
        if (!beforeTeam.teamId || beforeTeam.division !== resetDivision) continue;
        const after = current.teams.get(key);
        if (after?.teamId) continue;
        const target = root.querySelector(`.bracket-team-slot[data-motion-key="${CSS.escape(key)}"]`);
        if (target) { playState(target, "reset"); animatePaths(root, target, true); resetApplied = true; }
        else { resetGhost(beforeTeam); resetApplied = true; }
      }
      if (resetApplied) delete root.dataset.bracketResetConfirmed;
    }
    snapshots.set(root, current);
  }

  function scan(options) {
    document.querySelectorAll(selector).forEach(root => reconcile(root, options));
  }

  document.addEventListener("pickle:knockout-reset", event => {
    const division = event.detail?.divisionId;
    if (!division) return;
    document.querySelectorAll(selector).forEach(root => {
      const state = snapshots.get(root);
      if ([...(state?.teams?.values() || [])].some(slot => slot.division === division && slot.teamId)) {
        root.dataset.bracketResetConfirmed = division;
      }
    });
  });

  let scanQueued = false;
  const observer = new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    queueMicrotask(() => { scanQueued = false; scan(); });
  });
  let resizeFrame = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => scan({ forceConnectors: true }));
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan, { once: true });
  else scan();
  window.PickleBracketMotion = { reconcile };
})();
