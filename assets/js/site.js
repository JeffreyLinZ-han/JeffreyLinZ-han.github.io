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

// Expanded media, active project chapters, and tiny pointer details.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Lightweight lightbox for project images. Every scattered image becomes useful to click.
  const items = [...document.querySelectorAll('[data-lightbox]')];
  if (items.length) {
    let box = document.getElementById('media-lightbox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'media-lightbox';
      box.className = 'media-lightbox';
      box.setAttribute('aria-hidden', 'true');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'Expanded project media');
      box.innerHTML = '<button class="lightbox-close" type="button" aria-label="Close expanded media">×</button><button class="lightbox-nav lightbox-prev" type="button" aria-label="Previous image">←</button><button class="lightbox-nav lightbox-next" type="button" aria-label="Next image">→</button><div class="lightbox-frame"><img alt=""><div class="lightbox-caption"><p></p><span class="lightbox-count"></span></div></div>';
      document.body.append(box);
    } else if (!box.querySelector('.lightbox-prev')) {
      box.insertAdjacentHTML('beforeend','<button class="lightbox-nav lightbox-prev" type="button" aria-label="Previous image">←</button><button class="lightbox-nav lightbox-next" type="button" aria-label="Next image">→</button>');
      const frame = box.querySelector('.lightbox-frame');
      const p = frame?.querySelector('p');
      if (frame && p && !frame.querySelector('.lightbox-caption')) {
        const cap = document.createElement('div');
        cap.className = 'lightbox-caption';
        p.replaceWith(cap);
        cap.append(p);
        cap.insertAdjacentHTML('beforeend','<span class="lightbox-count"></span>');
      }
    }

    const img = box.querySelector('.lightbox-frame img');
    const caption = box.querySelector('.lightbox-frame p');
    const counter = box.querySelector('.lightbox-count');
    const close = box.querySelector('.lightbox-close');
    const prev = box.querySelector('.lightbox-prev');
    const next = box.querySelector('.lightbox-next');
    let index = 0;
    let lastFocus = null;

    const render = (i) => {
      index = (i + items.length) % items.length;
      const item = items[index];
      const src = item.getAttribute('href') || item.dataset.src;
      const thumb = item.querySelector('img');
      img.src = src;
      img.alt = thumb?.alt || '';
      caption.textContent = item.dataset.caption || thumb?.alt || '';
      if (counter) counter.textContent = `${String(index + 1).padStart(2,'0')} / ${String(items.length).padStart(2,'0')}`;
      const multi = items.length > 1;
      if (prev) prev.hidden = !multi;
      if (next) next.hidden = !multi;
    };
    const open = (i, source) => {
      lastFocus = source || document.activeElement;
      render(i);
      box.classList.add('is-open');
      box.setAttribute('aria-hidden','false');
      document.body.classList.add('lightbox-lock');
      close?.focus({preventScroll:true});
    };
    const hide = () => {
      box.classList.remove('is-open');
      box.setAttribute('aria-hidden','true');
      document.body.classList.remove('lightbox-lock');
      if (lastFocus?.focus) lastFocus.focus({preventScroll:true});
    };

    items.forEach((item, i) => item.addEventListener('click', e => {
      e.preventDefault();
      open(i, item);
    }));
    close?.addEventListener('click', hide);
    prev?.addEventListener('click', () => render(index - 1));
    next?.addEventListener('click', () => render(index + 1));
    box.addEventListener('click', e => { if (e.target === box) hide(); });
    addEventListener('keydown', e => {
      if (!box.classList.contains('is-open')) return;
      if (e.key === 'Escape') hide();
      if (e.key === 'ArrowLeft') render(index - 1);
      if (e.key === 'ArrowRight') render(index + 1);
    });
  }

  // The sticky chapter bar quietly follows the section currently in view.
  const jump = document.querySelector('.project-jump');
  if (jump && 'IntersectionObserver' in window) {
    const anchors = [...jump.querySelectorAll('a[href^="#"]')];
    const sections = anchors.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    const setActive = id => anchors.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, {rootMargin:'-22% 0px -56% 0px',threshold:[0,.08,.2,.45]});
    sections.forEach(s => observer.observe(s));
  }

  // Barely-there magnetic motion on pill buttons for pointer devices.
  if (!reduced && matchMedia('(pointer:fine)').matches) {
    document.querySelectorAll('.button').forEach(btn => {
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width/2) / r.width;
        const y = (e.clientY - r.top - r.height/2) / r.height;
        btn.style.transform = `translate(${x*3}px,${y*2}px) translateY(-1px)`;
      });
      btn.addEventListener('pointerleave', () => btn.style.transform = '');
    });
  }
})();
