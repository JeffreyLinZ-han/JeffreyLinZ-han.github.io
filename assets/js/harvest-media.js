(() => {
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');

  document.querySelectorAll('[data-harvest-player]').forEach(player => {
    const video = player.querySelector('video');
    const choices = [...player.querySelectorAll('[data-film-src]')];
    const toggle = player.querySelector('[data-film-toggle]');
    const title = player.querySelector('[data-film-title]');
    const description = player.querySelector('[data-film-description]');
    const progress = player.querySelector('[data-film-progress]');
    const status = player.querySelector('[data-film-status]');
    if (!video || !choices.length || !toggle) return;

    let index = 0;
    let visible = false;
    let wantsPlayback = !motionPreference.matches && !navigator.connection?.saveData;
    let failed = false;
    let request = 0;

    video.controls = false;
    video.muted = true;
    video.src = choices[0].dataset.filmSrc;
    toggle.hidden = false;

    const updateButton = () => {
      toggle.textContent = video.paused ? 'Play' : 'Pause';
      toggle.setAttribute('aria-label', video.paused ? 'Play camera sequence' : 'Pause camera sequence');
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
        if (error.name !== 'NotAllowedError') {
          if (status) status.textContent = 'Playback is unavailable. Try another view or press Play to retry.';
        }
      }
      updateButton();
    };

    const select = nextIndex => {
      index = (nextIndex + choices.length) % choices.length;
      const choice = choices[index];
      failed = false;
      ++request;
      video.pause();
      choices.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
      if (title) title.textContent = choice.dataset.filmTitle;
      if (description) description.textContent = choice.dataset.filmDescription;
      if (status) status.textContent = '';
      if (progress) progress.style.width = '0%';
      video.setAttribute('aria-label', `${choice.dataset.filmTitle}: OpenArm harvesting simulation`);
      video.poster = choice.dataset.filmPoster;
      video.src = choice.dataset.filmSrc;
      video.load();
      syncPlayback();
    };

    choices.forEach((choice, i) => choice.addEventListener('click', () => select(i)));
    toggle.addEventListener('click', () => {
      wantsPlayback = video.paused;
      if (failed && wantsPlayback) {
        failed = false;
        if (status) status.textContent = '';
        video.load();
      }
      syncPlayback();
    });
    video.addEventListener('ended', () => {
      if (wantsPlayback) select(index + 1);
      else updateButton();
    });
    video.addEventListener('play', updateButton);
    video.addEventListener('pause', updateButton);
    video.addEventListener('timeupdate', () => {
      if (progress) progress.style.width = `${Number.isFinite(video.duration) ? 100 * video.currentTime / video.duration : 0}%`;
    });
    video.addEventListener('error', () => {
      ++request;
      failed = true;
      wantsPlayback = false;
      video.pause();
      if (status) status.textContent = 'This view could not load. Choose another view or press Play to retry.';
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
