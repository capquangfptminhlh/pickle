(()=>{
  const key='pickleup-theme-v2',root=document.documentElement;
  let theme='light';
  try{theme=localStorage.getItem(key)==='dark'?'dark':'light'}catch{}
  function apply(value,persist=false){
    theme=value==='dark'?'dark':'light';
    root.dataset.theme=theme;
    root.style.colorScheme=theme;
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.content=theme==='dark'?'#101914':'#f4f7f4';
    const button=document.getElementById('themeToggle');
    if(button){
      button.textContent=theme==='dark'?'☀ Sáng':'☾ Tối';
      button.setAttribute('aria-label',theme==='dark'?'Chuyển sang nền sáng':'Chuyển sang nền tối');
      button.title=button.getAttribute('aria-label');
    }
    if(persist)try{localStorage.setItem(key,theme)}catch{}
  }
  apply(theme);
  function mount(){
    if(document.getElementById('themeToggle'))return;
    const button=document.createElement('button');
    button.id='themeToggle';button.className='theme-toggle';button.type='button';
    button.addEventListener('click',()=>apply(theme==='light'?'dark':'light',true));
    const target=document.querySelector('.topbar .top-left,.public-nav,.courtside-top-actions,.board-tools,.match-topbar');
    if(target)target.appendChild(button);
    else{
      const toolbar=document.createElement('div');toolbar.className='theme-toolbar';toolbar.appendChild(button);
      (document.querySelector('main')||document.body).prepend(toolbar);
    }
    apply(theme);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  addEventListener('storage',event=>{if(event.key===key||event.key===null)apply(event.key===null?'light':event.newValue)});
})();
