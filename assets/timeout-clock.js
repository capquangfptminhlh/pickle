// Shared scoring clock. The persisted deadline always wins over a local timer.
(()=>{
  const bindings=new WeakMap();
  function detach(target){
    const binding=bindings.get(target);
    if(binding?.interval){clearInterval(binding.interval);binding.interval=null}
  }
  function attach(target,match){
    if(!target)return;
    const clock=match?.timeoutClock,endsAt=Date.parse(clock?.endsAt),startedAt=Date.parse(clock?.startedAt);
    const valid=clock&&['A','B'].includes(clock.side)&&Number.isFinite(endsAt)&&Number.isFinite(startedAt);
    let binding=bindings.get(target);
    detach(target);
    if(!valid){target.hidden=true;bindings.delete(target);return}
    const key=[match?.id||'',clock.side,clock.startedAt,clock.endsAt].join('|'),serverNow=Date.parse(clock.serverNow);
    // Re-rendering the same snapshot must preserve its time anchor. A fresh
    // server timestamp corrects phone clock skew without extending the deadline.
    if(!binding||binding.key!==key||binding.serverNow!==clock.serverNow){
      binding={key,serverNow:clock.serverNow,observedAt:Date.now(),remaining:endsAt-(Number.isFinite(serverNow)?serverNow:Date.now()),interval:null};
      bindings.set(target,binding);
    }
    target.hidden=false;target.dataset.timeoutSide=clock.side;target.dataset.timeoutEndsAt=clock.endsAt;
    const label=target.querySelector('[data-timeout-label]'),value=target.querySelector('[data-timeout-value]'),status=target.querySelector('[data-timeout-status]'),progress=target.querySelector('[data-timeout-progress]');
    if(label)label.textContent='TIMEOUT · ĐỘI '+clock.side;
    const update=()=>{
      const remaining=Math.max(0,binding.remaining-(Date.now()-binding.observedAt)),seconds=Math.ceil(remaining/1000),expired=seconds===0;
      if(value)value.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
      const message=expired?'Hết timeout':'Còn lại';
      if(status&&status.textContent!==message)status.textContent=message;
      target.classList.toggle('is-expired',expired);
      if(progress)progress.style.transform='scaleX('+Math.min(1,remaining/Math.max(1,endsAt-startedAt))+')';
      if(expired)detach(target);
      return !expired;
    };
    if(update())binding.interval=setInterval(()=>{if(!target.isConnected){detach(target);return}update()},250);
  }
  window.PickleTimeoutClock={attach,detach};
})();
