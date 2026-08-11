(() => {
  const targets=[...document.querySelectorAll('.hero-copy,.portrait,.section-head,.feature,.card,.timeline,.skill,.about>*,.contact,.project-hero>* ,.wide-image,.project-layout>*,.gallery img,.demo-cta')];
  targets.forEach((el,i)=>{el.classList.add('motion-reveal');el.dataset.delay=String(i%4)});
  const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){e.target.classList.add('seen');observer.unobserve(e.target)}}},{threshold:.10,rootMargin:'0px 0px -5% 0px'});
  targets.forEach(x=>observer.observe(x));
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const id=a.getAttribute('href');if(id.length>1){const el=document.querySelector(id);if(el){e.preventDefault();el.scrollIntoView({behavior:'smooth'})}}}));
  let raf=0;const update=()=>{raf=0;const h=document.documentElement;const max=Math.max(1,h.scrollHeight-innerHeight);document.querySelector('.nav')?.style.setProperty('--scroll-progress',`${Math.min(100,scrollY/max*100)}%`)};addEventListener('scroll',()=>{if(!raf)raf=requestAnimationFrame(update)},{passive:true});update();
  const warm=url=>fetch(url,{cache:'force-cache'}).catch(()=>{});const idle=window.requestIdleCallback||((fn)=>setTimeout(fn,1200));idle(async()=>{try{const r=await fetch('demos/robot-arm/model.json',{cache:'force-cache'});if(r.ok){const m=await r.json();warm('demos/robot-arm/'+m.data)}}catch(_){}});
  document.querySelectorAll('a[href*="demos/needle"],a[href*="demos/robot-arm"]').forEach(a=>a.addEventListener('mouseenter',()=>{if(a.href.includes('/needle'))warm('demos/needle/models/full.json');if(a.href.includes('/robot-arm'))warm('demos/robot-arm/model.json')},{once:true}));
})();
// Subtle pointer parallax for large visual surfaces; disabled on touch/reduced-motion.
if(matchMedia('(pointer:fine)').matches&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 document.querySelectorAll('.portrait,.card,.wide-image').forEach(el=>{el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;el.style.transform=`perspective(1100px) rotateX(${(-y*1.8).toFixed(2)}deg) rotateY(${(x*1.8).toFixed(2)}deg) translateY(-2px)`});el.addEventListener('pointerleave',()=>el.style.transform='')});
}
