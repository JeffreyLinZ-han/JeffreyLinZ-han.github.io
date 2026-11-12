(() => {
  document.querySelectorAll('[data-demo-player]').forEach(player => {
    const video = player.querySelector('video');
    const status = player.querySelector('[data-demo-status]');
    if (!video) return;
    let visible = false;
    let failed = false;
    let request = 0;
    video.controls = false;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.src = video.getAttribute('src') || video.querySelector('source')?.src;

    const syncPlayback = async () => {
      const currentRequest = ++request;
      if (!visible || document.hidden || failed) {
        video.pause();
        return;
      }
      try {
        await video.play();
        if (currentRequest !== request && (!visible || document.hidden)) video.pause();
        if (status) status.textContent = '';
      } catch (error) {
        if (currentRequest !== request || error.name === 'AbortError' || error.name === 'NotAllowedError') return;
        if (status) status.textContent = 'Video unavailable. Reload the page to retry.';
      }
    };
    video.addEventListener('error', () => {
      ++request;
      failed = true;
      video.pause();
      if (status) status.textContent = 'Video unavailable. Reload the page to retry.';
    });
    document.addEventListener('visibilitychange', syncPlayback);
    document.addEventListener('pointerdown', () => {
      if (video.paused && !failed) syncPlayback();
    }, { passive: true });
    window.addEventListener('online', () => {
      if (failed) {
        failed = false;
        video.load();
        syncPlayback();
      }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        syncPlayback();
      }, { threshold: 0.1 }).observe(video);
    } else {
      visible = true;
      syncPlayback();
    }
  });
})();
