(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const nav = document.querySelector('.site-nav');
  const menu = document.querySelector('.menu-toggle');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Navigation state + one-pixel scroll progress.
  const updateNav = () => {
    if (!nav) return;
    const max = Math.max(1, root.scrollHeight - innerHeight);
    nav.classList.toggle('scrolled', scrollY > 18);
    nav.style.setProperty('--progress', `${Math.min(100, (scrollY / max) * 100)}%`);
  };
  addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('menu-open');
      menu.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('menu-open');
      menu.setAttribute('aria-expanded', 'false');
    }));
  }

  // Reveal elements only once; motion is intentionally short and low amplitude.
  const revealTargets = [...document.querySelectorAll('[data-reveal]')];
  revealTargets.forEach((el, i) => {
    el.classList.add('reveal');
    el.dataset.delay = String(i % 4);
  });
  if (!reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: .08, rootMargin: '0px 0px -7% 0px' });
    revealTargets.forEach(el => io.observe(el));
  } else {
    revealTargets.forEach(el => el.classList.add('is-visible'));
  }

  // Pointer-light on the large product image. Keeps the page flat until interaction.
  if (matchMedia('(pointer:fine)').matches && !reduced) {
    document.querySelectorAll('[data-spotlight]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });

    const heroImage = document.querySelector('.hero-visual img');
    const heroVisual = document.querySelector('.hero-visual');
    if (heroImage && heroVisual) {
      heroVisual.addEventListener('pointermove', e => {
        const r = heroVisual.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width - .5) * 8;
        const y = ((e.clientY - r.top) / r.height - .5) * 8;
        heroImage.style.transform = `scale(1.035) translate(${x * -.22}px, ${y * -.22}px)`;
      });
      heroVisual.addEventListener('pointerleave', () => heroImage.style.transform = 'scale(1.015)');
    }
  }

  // Smooth in-page navigation without hijacking external links.
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }));

  // Lazy warm-up for heavyweight 3D demos after page interaction becomes idle.
  const warm = url => fetch(url, { cache: 'force-cache' }).catch(() => {});
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1300));
  idle(() => {
    const path = location.pathname;
    if (path.endsWith('/') || path.endsWith('/index.html') || path.endsWith('robot-arm.html')) warm((path.includes('/projects/') ? '../' : '') + 'demos/robot-arm/model.json');
  });
})();

// V2 micro-interactions: restrained tilt on build/archive cards + magnetic buttons.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !matchMedia('(pointer:fine)').matches) return;

  document.querySelectorAll('[data-tilt]').forEach(card => {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - .5;
      const py = (e.clientY - r.top) / r.height - .5;
      card.style.setProperty('--ry', `${px * 2.4}deg`);
      card.style.setProperty('--rx', `${py * -2.0}deg`);
      card.style.setProperty('--tz', '2px');
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--tz', '0px');
    });
  });

  document.querySelectorAll('.button').forEach(button => {
    button.addEventListener('pointermove', e => {
      const r = button.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - .5) * 5;
      const y = ((e.clientY - r.top) / r.height - .5) * 4;
      button.style.translate = `${x}px ${y}px`;
    });
    button.addEventListener('pointerleave', () => { button.style.translate = '0 0'; });
  });
})();
