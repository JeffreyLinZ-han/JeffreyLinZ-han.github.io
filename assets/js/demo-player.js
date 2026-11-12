(() => {
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');

  document.querySelectorAll('[data-demo-player]').forEach(player => {
    const video = player.querySelector('video');
    const toggle = player.querySelector('[data-demo-toggle]');
    const status = player.querySelector('[data-demo-status]');
    const choices = [...player.querySelectorAll('[data-demo-src]')];
    const projectLink = player.querySelector('[data-demo-project-link]');
    if (!video || !toggle) return;

    let visible = false;
    let wantsPlayback = !motionPreference.matches && !navigator.connection?.saveData;
    let failed = false;
    let request = 0;

    video.controls = false;
    video.muted = true;
    video.loop = true;
    video.src = choices[0]?.dataset.demoSrc || video.getAttribute('src') || video.querySelector('source')?.src;
    toggle.hidden = false;

    const updateButton = () => {
      toggle.textContent = video.paused ? 'Play' : 'Pause';
      toggle.setAttribute('aria-label', video.paused ? 'Play demonstration' : 'Pause demonstration');
    };
    const syncPlayback = async () => {
      const currentRequest = ++request;
      if (!wantsPlayback || !visible || document.hidden || failed) {
        video.pause();
        updateButton();
        return;
      }
      try {
        await video.play();
        if (currentRequest !== request && (!wantsPlayback || !visible || document.hidden)) video.pause();
      } catch (error) {
        if (currentRequest !== request || error.name === 'AbortError') return;
        wantsPlayback = false;
        if (error.name !== 'NotAllowedError' && status) status.textContent = 'Video unavailable. Press Play to retry.';
      }
      updateButton();
    };

    choices.forEach(choice => choice.addEventListener('click', () => {
      ++request;
      failed = false;
      video.pause();
      choices.forEach(button => button.setAttribute('aria-pressed', String(button === choice)));
      video.poster = choice.dataset.demoPoster;
      video.src = choice.dataset.demoSrc;
      video.setAttribute('aria-label', choice.dataset.demoName);
      if (projectLink) projectLink.href = choice.dataset.demoHref;
      if (status) status.textContent = '';
      video.load();
      syncPlayback();
    }));
    toggle.addEventListener('click', () => {
      wantsPlayback = video.paused;
      if (failed && wantsPlayback) {
        failed = false;
        if (status) status.textContent = '';
        video.load();
      }
      syncPlayback();
    });
    video.addEventListener('play', updateButton);
    video.addEventListener('pause', updateButton);
    video.addEventListener('error', () => {
      ++request;
      failed = true;
      wantsPlayback = false;
      video.pause();
      if (status) status.textContent = 'Video unavailable. Press Play to retry.';
      updateButton();
    });
    document.addEventListener('visibilitychange', syncPlayback);
    motionPreference.addEventListener('change', event => {
      if (event.matches) wantsPlayback = false;
      syncPlayback();
    });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        syncPlayback();
      }, { threshold: 0.1 });
      observer.observe(video);
    } else {
      visible = true;
      syncPlayback();
    }
    updateButton();
  });
})();
