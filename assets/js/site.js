const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting)e.target.classList.add('seen')}},{threshold:.12});document.querySelectorAll('[data-reveal]').forEach(x=>observer.observe(x));
document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const id=a.getAttribute('href');if(id.length>1){const el=document.querySelector(id);if(el){e.preventDefault();el.scrollIntoView({behavior:'smooth'})}}}));
// Warm the browser cache for the most likely interactive experience after the page settles.
(() => {
  const warm = (url) => fetch(url, { cache: 'force-cache' }).catch(() => {});
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1400));
  idle(async () => {
    try {
      const r = await fetch('demos/robot-arm/model.json', { cache: 'force-cache' });
      if (r.ok) {
        const m = await r.json();
        warm('demos/robot-arm/' + m.data);
      }
    } catch (_) {}
  });
  document.querySelectorAll('a[href*="demos/needle"],a[href*="demos/robot-arm"]').forEach(a => {
    a.addEventListener('mouseenter', () => {
      if (a.href.includes('/needle')) warm('demos/needle/models/full.json');
      if (a.href.includes('/robot-arm')) warm('demos/robot-arm/model.json');
    }, { once: true });
  });
})();
