(() => {
  document.querySelectorAll('[data-gallery]').forEach(gallery => {
    const image = gallery.querySelector('[data-gallery-image]');
    const caption = gallery.querySelector('[data-gallery-caption]');
    const choices = [...gallery.querySelectorAll('button[data-gallery-src]')];
    const previous = gallery.querySelector('[data-gallery-prev]');
    const next = gallery.querySelector('[data-gallery-next]');
    if (!image || !choices.length) return;
    caption?.setAttribute('aria-live', 'polite');
    let index = Math.max(0, choices.findIndex(choice => choice.getAttribute('aria-pressed') === 'true'));

    const select = number => {
      index = (number + choices.length) % choices.length;
      const choice = choices[index];
      image.src = choice.dataset.gallerySrc;
      image.alt = choice.dataset.galleryAlt || '';
      if (caption) caption.textContent = choice.dataset.galleryCaption || image.alt;
      choices.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    };
    choices.forEach((choice, i) => choice.addEventListener('click', () => select(i)));
    previous?.addEventListener('click', () => select(index - 1));
    next?.addEventListener('click', () => select(index + 1));
    gallery.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      select(index + (event.key === 'ArrowRight' ? 1 : -1));
    });
  });
})();
