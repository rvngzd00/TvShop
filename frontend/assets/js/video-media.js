(() => {
  'use strict';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const observed = new WeakSet();
  const hydrate = (video) => {
    if (!video.src && video.dataset.src) video.src = video.dataset.src;
  };
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;
      if (entry.isIntersecting) {
        hydrate(video);
        if (!reducedMotion.matches && !video.controls) video.play().catch(() => undefined);
      } else if (!video.controls) video.pause();
    });
  }, { rootMargin:'120px 0px', threshold:.45 }) : null;
  const bind = (root = document) => root.querySelectorAll?.('[data-product-video]').forEach((video) => {
    if (observed.has(video)) return;
    observed.add(video);
    video.addEventListener('error', () => {
      video.pause();
      video.hidden = true;
      const fallback = video.poster ? Object.assign(document.createElement('img'), { src:video.poster, alt:video.getAttribute('aria-label') || 'Məhsul şəkli', loading:'lazy' }) : null;
      if (fallback) video.replaceWith(fallback);
    }, { once:true });
    if (video.controls) hydrate(video);
    else if (observer) observer.observe(video);
    else hydrate(video);
  });
  bind();
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node instanceof Element) bind(node.matches('[data-product-video]') ? node.parentElement : node);
  }))).observe(document.documentElement, { childList:true, subtree:true });
})();
