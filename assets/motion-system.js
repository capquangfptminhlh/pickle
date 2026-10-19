(() => {
  "use strict";

  const gsap = window.gsap;
  const motionPreference = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };
  const timelines = new Map();
  const elementIds = new WeakMap();
  let nextId = 0;

  function elementsOf(targets) {
    if (!targets) return [];
    if (typeof targets === "string") {
      return typeof document.querySelectorAll === "function"
        ? [...document.querySelectorAll(targets)]
        : [];
    }
    if (Array.isArray(targets)) return targets.flatMap(elementsOf);
    if (typeof targets.length === "number" && !targets.style) {
      return [...targets].flatMap(elementsOf);
    }
    return [targets];
  }

  function elementKey(prefix, targets) {
    const element = elementsOf(targets)[0];
    if (!element || (typeof element !== "object" && typeof element !== "function")) {
      return `${prefix}:global`;
    }
    if (!elementIds.has(element)) elementIds.set(element, ++nextId);
    return `${prefix}:${elementIds.get(element)}`;
  }

  function once(callback) {
    let called = false;
    return () => {
      if (called) return;
      called = true;
      if (typeof callback === "function") callback();
    };
  }

  function quality() {
    if (motionPreference.matches) return "reduced";
    const memory = Number(window.navigator?.deviceMemory);
    if ((Number.isFinite(memory) && memory <= 4) || window.innerWidth <= 480) {
      return "compact";
    }
    return "full";
  }

  function reduced() {
    return motionPreference.matches;
  }

  function kill(key) {
    const timeline = timelines.get(key);
    if (!timeline) return;
    timelines.delete(key);
    if (typeof timeline.kill === "function") timeline.kill();
  }

  function keyed(key, build, finish) {
    kill(key);
    const done = once(finish);
    if (!gsap || motionPreference.matches) {
      done();
      return null;
    }

    let timeline;
    const complete = () => {
      if (timelines.get(key) === timeline) timelines.delete(key);
      done();
    };

    try {
      timeline = gsap.timeline({ onComplete: complete, onInterrupt: complete });
      timelines.set(key, timeline);
      if (typeof build === "function") build(timeline);
      return timeline;
    } catch {
      if (timelines.get(key) === timeline) timelines.delete(key);
      if (timeline && typeof timeline.kill === "function") timeline.kill();
      done();
      return null;
    }
  }

  function showFinal(targets) {
    for (const element of elementsOf(targets)) {
      if (!element?.style) continue;
      element.style.opacity = "1";
      element.style.visibility = "visible";
      element.style.transform = "none";
      element.style.filter = "none";
    }
  }

  function clearMotion(targets, properties = "transform,opacity,filter,visibility") {
    if (gsap && !motionPreference.matches && typeof gsap.set === "function") {
      gsap.set(targets, { clearProps: properties });
    }
  }

  function entrance(targets, options = {}) {
    const {
      key = elementKey("entrance", targets),
      y = 18,
      scale = 0.985,
      duration = 0.48,
      stagger = 0.055,
    } = options;
    const finish = () => {
      if (!gsap || motionPreference.matches) showFinal(targets);
      else clearMotion(targets);
    };
    return keyed(key, timeline => {
      timeline.fromTo(targets,
        { opacity: 0, y, scale, filter: "blur(4px)" },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration,
          stagger,
          ease: "power2.out",
          overwrite: "auto",
        });
    }, finish);
  }

  function press(target) {
    const key = elementKey("press", target);
    return keyed(key, timeline => {
      timeline.fromTo(target,
        { scale: 0.965 },
        { scale: 1, duration: 0.18, ease: "back.out(2)", overwrite: "auto" });
    }, () => clearMotion(target, "transform"));
  }

  function flip(before, elements, key = elementKey("flip", elements)) {
    const targets = elementsOf(elements);
    return keyed(key, timeline => {
      for (const [index, element] of targets.entries()) {
        const start = typeof before?.get === "function"
          ? before.get(element)
          : Array.isArray(before)
            ? before[index]
            : targets.length === 1
              ? before
              : null;
        const end = element?.getBoundingClientRect?.();
        if (!start || !end) continue;
        const scaleX = end.width ? start.width / end.width : 1;
        const scaleY = end.height ? start.height / end.height : 1;
        timeline.fromTo(element,
          { x: start.left - end.left, y: start.top - end.top, scaleX, scaleY },
          {
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            duration: 0.42,
            ease: "power2.inOut",
            overwrite: "auto",
          }, 0);
      }
    }, () => clearMotion(targets, "transform"));
  }

  function count(element, from, to) {
    const current = Number.parseFloat(element?.textContent) || 0;
    const start = Number.isFinite(Number(from)) ? Number(from) : current;
    const end = Number.isFinite(Number(to)) ? Number(to) : start;
    const state = { value: start };
    const finish = () => {
      if (element) element.textContent = String(end);
    };
    return keyed(elementKey("count", element), timeline => {
      timeline.to(state, {
        value: end,
        duration: 0.42,
        ease: "power2.out",
        overwrite: true,
        onUpdate: () => {
          if (element) element.textContent = String(Math.round(state.value * 100) / 100);
        },
      });
    }, finish);
  }

  function scoreChange(element, delta = 0) {
    const direction = Number(delta) < 0 ? -1 : 1;
    return keyed(elementKey("score", element), timeline => {
      timeline.fromTo(element,
        { scale: 1.18, y: -3 * direction, filter: "brightness(1.35)" },
        {
          scale: 1,
          y: 0,
          filter: "brightness(1)",
          duration: 0.34,
          ease: "back.out(2.4)",
          overwrite: "auto",
        });
    }, () => clearMotion(element));
  }

  function serviceChange(athlete, banner, color) {
    const targets = [athlete, banner].filter(Boolean);
    if (banner?.style && color) banner.style.setProperty?.("--motion-color", color);
    return keyed(elementKey("service", athlete || banner), timeline => {
      if (athlete) {
        timeline.fromTo(athlete,
          { scale: 0.94, filter: `drop-shadow(0 0 0 ${color || "currentColor"})` },
          { scale: 1, filter: "drop-shadow(0 0 10px transparent)", duration: 0.38, ease: "back.out(2)", overwrite: "auto" });
      }
      if (banner) {
        timeline.fromTo(banner,
          { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out", overwrite: "auto" }, 0);
      }
    }, () => {
      if (!gsap || motionPreference.matches) showFinal(targets);
      else clearMotion(targets);
    });
  }

  function setWin(target, color = "#dfff69") {
    celebrate({target,color,kind:"set"});
    return keyed(elementKey("set-win", target), timeline => {
      timeline.fromTo(target,
        { scale: 0.97, filter: `drop-shadow(0 0 0 ${color})` },
        { scale: 1, filter: `drop-shadow(0 0 14px ${color})`, duration: 0.48, ease: "back.out(1.8)", overwrite: "auto" })
        .to(target, { filter: "drop-shadow(0 0 0 transparent)", duration: 0.3 });
    }, () => clearMotion(target));
  }

  function matchWin(target, color = "#dfff69") {
    celebrate({target,color,kind:"match"});
    return keyed(elementKey("match-win", target), timeline => {
      timeline.fromTo(target,
        { scale: 0.94, autoAlpha: 0.72, filter: `drop-shadow(0 0 0 ${color})` },
        { scale: 1.025, autoAlpha: 1, filter: `drop-shadow(0 0 22px ${color})`, duration: 0.52, ease: "back.out(1.7)", overwrite: "auto" })
        .to(target, { scale: 1, filter: "drop-shadow(0 0 0 transparent)", duration: 0.34 });
    }, () => clearMotion(target));
  }

  function error(target) {
    return keyed(elementKey("error", target), timeline => {
      timeline.to(target, {
        keyframes: [
          { x: -5 },
          { x: 5 },
          { x: -3 },
          { x: 3 },
          { x: 0 },
        ],
        filter: "saturate(1.3)",
        duration: 0.34,
        ease: "power1.inOut",
        overwrite: "auto",
      });
    }, () => clearMotion(target));
  }

  let celebration=null;
  function stopCelebration(){
    if(!celebration)return;
    if(celebration.frame)cancelAnimationFrame(celebration.frame);
    clearTimeout(celebration.timer);
    celebration.canvas?.remove();
    if(celebration.target?.dataset)delete celebration.target.dataset.motionCelebration;
    if(celebration.originalOpacity!==undefined&&celebration.target?.style)celebration.target.style.opacity=celebration.originalOpacity;
    celebration=null;
  }
  function celebrate({target,color="#bcff37",kind="match"}={}) {
    stopCelebration();
    if(document.hidden||!target)return null;
    if(reduced()){
      if(target.dataset)target.dataset.motionCelebration=kind;
      const originalOpacity=target.style?.opacity;
      if(target.style)target.style.opacity=".86";
      const run={canvas:null,target,originalOpacity,frame:0,timer:0};
      celebration=run;
      run.timer=setTimeout(()=>{if(celebration===run)stopCelebration()},180);
      return null;
    }
    if(!gsap)return null;
    const canvas=document.createElement("canvas"),context=canvas.getContext("2d");
    if(!context)return null;
    canvas.className="motion-celebration";
    canvas.setAttribute("aria-hidden","true");
    canvas.style.pointerEvents="none";
    const width=window.innerWidth,height=window.innerHeight;
    const ratio=Math.min(window.devicePixelRatio||1,2);
    canvas.width=width*ratio;canvas.height=height*ratio;
    context.scale(ratio,ratio);
    const rect=target.getBoundingClientRect(),duration=kind==="set"?1200:2500;
    const particles=Array.from({length:quality()==="compact"?48:96},(_,i)=>({
      x:Math.max(0,Math.min(width,rect.left+rect.width/2)),
      y:Math.max(0,Math.min(height,rect.top+rect.height/2)),
      vx:(Math.random()-.5)*width*.9,vy:-120-Math.random()*360,
      spin:Math.random()*8,color:[color,"#ffffff","#ffdb63"][i%3]
    }));
    document.body.append(canvas);
    const run={canvas,target,frame:0,timer:0};celebration=run;
    const start=performance.now();let last=start;
    function tick(now){
      if(celebration!==run)return;
      const elapsed=now-start,dt=Math.min((now-last)/1000,.05);last=now;
      if(elapsed>=duration||document.hidden||reduced()){stopCelebration();return}
      context.clearRect(0,0,width,height);
      context.globalAlpha=Math.min(1,(duration-elapsed)/500);
      for(const p of particles){
        p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=480*dt;
        context.save();context.translate(p.x,p.y);context.rotate(p.spin*elapsed/1000);
        context.fillStyle=p.color;context.fillRect(-3,-2,6,4);context.restore();
      }
      run.frame=requestAnimationFrame(tick);
    }
    run.timer=setTimeout(stopCelebration,duration+50);
    run.frame=requestAnimationFrame(tick);
    return canvas;
  }

  function dispose() {
    stopCelebration();
    for (const key of [...timelines.keys()]) kill(key);
    document.querySelectorAll?.(".motion-celebration").forEach(element => element.remove());
  }

  const api = {
    ready: Boolean(gsap),
    reduced,
    quality,
    keyed,
    kill,
    entrance,
    press,
    flip,
    count,
    scoreChange,
    serviceChange,
    setWin,
    matchWin,
    error,
    celebrate,
    dispose,
  };

  window.PickleMotion = api;

  document.addEventListener("visibilitychange", () => {
    if(document.hidden)stopCelebration();
    if (!gsap?.globalTimeline) return;
    if (document.hidden) gsap.globalTimeline.pause?.();
    else gsap.globalTimeline.resume?.();
  });
  motionPreference.addEventListener?.("change",()=>{if(reduced())dispose()});
  window.addEventListener("pagehide", dispose);
})();
