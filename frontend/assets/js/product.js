(() => {
  'use strict';

  const page = document.querySelector('[data-product-page]');
  if (!page) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const escapeAttribute = (value) => escapeHtml(value);
  const money = new Intl.NumberFormat('az-AZ', {
    style: 'currency',
    currency: 'AZN',
    maximumFractionDigits: 2
  });

  function syncQuantity(value) {
    const next = Math.max(1, Math.min(99, Number(value) || 1));
    page.querySelectorAll('[data-product-quantity-output]').forEach((output) => {
      output.value = String(next);
      output.textContent = String(next);
    });
    return next;
  }

  page.addEventListener('click', (event) => {
    const quantity = event.target.closest('[data-product-quantity]');
    if (quantity) {
      event.preventDefault();
      const current = Number(page.querySelector('[data-product-quantity-output]')?.value || 1);
      syncQuantity(current + Number(quantity.dataset.productQuantity || 0));
      return;
    }

    const details = event.target.closest('[data-product-details]');
    if (details) {
      event.preventDefault();
      const expanded = details.getAttribute('aria-expanded') === 'true';
      const summary = details.closest('.db-product-summary');
      summary?.querySelectorAll('[data-product-summary-extra]').forEach((row) => {
        row.hidden = expanded;
        row.setAttribute('aria-hidden', String(expanded));
      });
      details.setAttribute('aria-expanded', String(!expanded));
      const label = details.querySelector('span');
      if (label) label.textContent = expanded ? 'Ətraflı' : 'Daha az göstər';
      return;
    }

    const copySku = event.target.closest('[data-product-copy-sku]');
    if (copySku) {
      event.preventDefault();
      void copyProductSku(copySku);
      return;
    }

    const tab = event.target.closest('[data-product-tab]');
    if (tab) {
      event.preventDefault();
      const key = tab.dataset.productTab;
      page.querySelectorAll('[data-product-tab]').forEach((item) => {
        const active = item === tab;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
      });
      page.querySelectorAll('[data-product-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.productPanel !== key;
      });
      return;
    }

    const anchor = event.target.closest('[data-product-anchor]');
    if (anchor) {
      const section = document.querySelector(anchor.getAttribute('href'));
      if (!section) return;
      event.preventDefault();
      section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      setActiveAnchor(anchor);
      return;
    }

    const videoThumbnail = event.target.closest('[data-product-video-thumbnail]');
    if (videoThumbnail) {
      event.preventDefault();
      const image = page.querySelector('[data-product-main-image]');
      const video = page.querySelector('[data-product-main-video]');
      const zoomButton = page.querySelector('[data-product-zoom]');
      if (image) image.hidden = true;
      if (zoomButton) zoomButton.hidden = true;
      if (video) {
        video.hidden = false;
        if (!reduceMotion) video.play().catch(() => undefined);
      }
      page.querySelectorAll('[data-product-thumbnail], [data-product-video-thumbnail]').forEach((item) => {
        const active = item === videoThumbnail;
        item.classList.toggle('is-active', active);
        if (active) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      });
      return;
    }

    const thumbnail = event.target.closest('[data-product-thumbnail]');
    if (thumbnail) {
      event.preventDefault();
      const image = page.querySelector('[data-product-main-image]');
      const video = page.querySelector('[data-product-main-video]');
      const zoomButton = page.querySelector('[data-product-zoom]');
      if (video) { video.pause(); video.hidden = true; }
      if (zoomButton) zoomButton.hidden = false;
      if (image) {
        image.hidden = false;
        image.src = thumbnail.dataset.productThumbnail;
        image.alt = thumbnail.dataset.productThumbnailAlt || image.alt;
      }
      page.querySelectorAll('[data-product-thumbnail], [data-product-video-thumbnail]').forEach((item) => {
        const active = item === thumbnail;
        item.classList.toggle('is-active', active);
        if (active) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      });
      return;
    }

    const zoom = event.target.closest('[data-product-zoom]');
    if (zoom) {
      event.preventDefault();
      openLightbox();
      return;
    }

    const arrow = event.target.closest('[data-product-carousel-arrow]');
    if (arrow) {
      event.preventDefault();
      const carousel = arrow.closest('.db-product-carousel-section')?.querySelector('[data-product-carousel]');
      const card = carousel?.querySelector('.db-product-card');
      if (!carousel || !card) return;
      const gap = Number.parseFloat(getComputedStyle(carousel.querySelector('.db-product-carousel-track')).gap) || 10;
      carousel.scrollBy({
        left: Number(arrow.dataset.productCarouselArrow) * (card.getBoundingClientRect().width + gap),
        behavior: reduceMotion ? 'auto' : 'smooth'
      });
      return;
    }

    const buyNow = event.target.closest('[data-product-buy-now]');
    if (buyNow) {
      window.setTimeout(() => window.location.assign('/sebet/'), 120);
    }
  });

  page.addEventListener('keydown', (event) => {
    const tab = event.target.closest('[data-product-tab]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...page.querySelectorAll('[data-product-tab]')];
    const current = tabs.indexOf(tab);
    const index = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[index].focus();
    tabs[index].click();
  });

  function setActiveAnchor(anchor) {
    page.querySelectorAll('[data-product-anchor]').forEach((item) => {
      item.classList.toggle('is-active', item === anchor);
    });
    anchor.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
  }

  async function copyProductSku(button) {
    const value = String(button.dataset.productSkuValue || '').trim();
    if (!value) return;
    const status = button.closest('.db-product-sku')?.querySelector('[data-product-copy-status]');

    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
          copied = true;
        } catch {
          // Some browsers expose Clipboard API but deny it; use the legacy fallback.
        }
      }
      if (!copied) {
        const input = document.createElement('textarea');
        input.value = value;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.append(input);
        try {
          input.select();
          copied = document.execCommand('copy');
        } finally {
          input.remove();
        }
      }
      if (!copied) throw new Error('Clipboard unavailable');
      button.classList.add('is-copied');
      button.setAttribute('aria-label', 'Məhsul kodu kopyalandı');
      if (status) status.textContent = `Məhsul kodu ${value} kopyalandı.`;
      window.setTimeout(() => {
        button.classList.remove('is-copied');
        button.setAttribute('aria-label', 'Məhsul kodunu kopyala');
        if (status) status.textContent = '';
      }, 1800);
    } catch {
      if (status) status.textContent = 'Məhsul kodunu kopyalamaq mümkün olmadı.';
    }
  }

  const anchorById = new Map(
    [...page.querySelectorAll('[data-product-anchor]')].map((anchor) => [
      anchor.getAttribute('href')?.slice(1),
      anchor
    ])
  );
  if ('IntersectionObserver' in window) {
    const visibleSections = new Map();
    const observer = new IntersectionObserver((entries) => {
      if (!mobileQuery.matches) return;
      entries.forEach((entry) => {
        if (entry.isIntersecting) visibleSections.set(entry.target.id, entry.boundingClientRect.top);
        else visibleSections.delete(entry.target.id);
      });
      const first = [...visibleSections.entries()].sort((left, right) =>
        Math.abs(left[1] - 90) - Math.abs(right[1] - 90)
      )[0];
      const anchor = first ? anchorById.get(first[0]) : null;
      if (anchor) setActiveAnchor(anchor);
    }, { rootMargin: '-70px 0px -58% 0px', threshold: [0, .15, .5] });
    page.querySelectorAll('[data-product-section]').forEach((section) => observer.observe(section));
  }

  function openLightbox() {
    const image = page.querySelector('[data-product-main-image]');
    if (!image) return;
    let dialog = document.querySelector('.db-product-lightbox');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'db-product-lightbox';
      dialog.innerHTML = '<button type="button" aria-label="Böyük şəkli bağla">×</button><img alt="">';
      dialog.querySelector('button').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
      document.body.append(dialog);
    }
    const dialogImage = dialog.querySelector('img');
    dialogImage.src = image.currentSrc || image.src;
    dialogImage.alt = image.alt;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  let drag = null;
  let dragFrame = 0;
  let pendingDragLeft = 0;
  let blockClickUntil = 0;
  let blockClickCarousel = null;

  page.addEventListener('pointerdown', (event) => {
    const carousel = event.target.closest('[data-product-carousel]');
    if (!carousel || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag = {
      carousel,
      pointerId:event.pointerId,
      startX:event.clientX,
      startY:event.clientY,
      scrollLeft:carousel.scrollLeft,
      dragging:false
    };
  });

  page.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = event.clientX - drag.startX;
    const y = event.clientY - drag.startY;
    if (!drag.dragging) {
      if (Math.abs(x) < 9) return;
      if (Math.abs(x) <= Math.abs(y) * 1.15) {
        drag = null;
        return;
      }
      drag.dragging = true;
      drag.carousel.classList.add('is-dragging');
      try { drag.carousel.setPointerCapture(event.pointerId); } catch { /* Optional enhancement. */ }
    }
    if (event.cancelable) event.preventDefault();
    pendingDragLeft = drag.scrollLeft - x;
    if (!dragFrame) dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      if (drag) drag.carousel.scrollLeft = pendingDragLeft;
    });
  });

  function finishDrag(event, cancelled = false) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const completed = drag;
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    if (completed.dragging) completed.carousel.scrollLeft = pendingDragLeft;
    drag = null;
    completed.carousel.classList.remove('is-dragging');
    try {
      if (completed.carousel.hasPointerCapture(event.pointerId)) completed.carousel.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released.
    }
    if (completed.dragging && !cancelled) {
      blockClickCarousel = completed.carousel;
      blockClickUntil = performance.now() + 240;
    }
  }

  page.addEventListener('pointerup', (event) => finishDrag(event));
  page.addEventListener('pointercancel', (event) => finishDrag(event, true));
  page.addEventListener('dragstart', (event) => {
    if (event.target.closest('[data-product-carousel]')) event.preventDefault();
  });
  page.addEventListener('click', (event) => {
    if (!blockClickCarousel || performance.now() > blockClickUntil || !blockClickCarousel.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    blockClickCarousel = null;
  }, true);

  function productCard(product) {
    const payload = escapeAttribute(JSON.stringify(product));
    const title = escapeHtml(product.title);
    const slug = encodeURIComponent(product.slug);
    const image = escapeAttribute(product.image || '/assets/wp-content/uploads/other-cat.webp');
    const video = product.videoUrl ? escapeAttribute(product.videoUrl) : '';
    const sku = escapeHtml(product.sku || product.slug.toUpperCase());
    const brand = escapeHtml(product.brand || product.vendor || 'TVShop');
    const price = money.format(Number(product.price || 0));
    return `<article class="db-product-card">
      <div class="db-product-media">
        <div class="db-product-actions" aria-label="Məhsul əməliyyatları">
          <button class="db-product-action db-product-wishlist" type="button" data-wishlist="${escapeAttribute(product.slug)}" aria-label="Seçilmişlərə əlavə et" aria-pressed="false"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">Seçilmişlərə əlavə et</span></button>
          <button class="db-product-action db-product-quick-view" type="button" data-quick-view="${payload}" aria-label="Sürətli baxış"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">Sürətli baxış</span></button>
          <a class="db-product-action db-product-whatsapp" href="https://wa.me/994502645400?text=${encodeURIComponent(`Salam, ${product.title} məhsulu haqqında məlumat almaq istəyirəm.`)}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp ilə soruş"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">WhatsApp</span></a>
        </div>
        <a href="/mehsul/${slug}/" aria-label="${title}">${video ? `<video class="db-product-video" data-product-video data-src="${video}" poster="${image}" muted loop playsinline preload="none" aria-label="${title} — məhsul videosu"></video>` : `<img src="${image}" alt="${title} — məhsul şəkli" width="420" height="390" loading="lazy" decoding="async">`}</a>
      </div>
      <div class="db-product-content">
        <p class="db-product-sku">SKU: ${sku}</p>
        <h3><a href="/mehsul/${slug}/">${title}</a></h3>
        <div class="db-product-bottom">
          <div class="db-product-price"><strong>${escapeHtml(price)}</strong></div>
          <button class="db-add-cart" type="button" data-add-cart="${payload}" aria-label="${title} məhsulunu səbətə əlavə et"><span class="db-cart-icon" aria-hidden="true"></span></button>
        </div>
      </div>
    </article>`;
  }

  function reviewStars(rating) {
    const normalized = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return `<span class="db-review-stars" aria-label="5 üzərindən ${normalized} ulduz">${Array.from({ length:5 }, (_, index) =>
      `<i${index < normalized ? ' class="is-filled"' : ''}>★</i>`
    ).join('')}</span>`;
  }

  function reviewItem(review) {
    const date = new Intl.DateTimeFormat('az-AZ', {
      day:'2-digit',
      month:'long',
      year:'numeric'
    }).format(new Date(review.created_at));
    const initial = String(review.author_name || 'D').trim().charAt(0).toLocaleUpperCase('az-AZ');
    return `<article class="db-review-item" data-review-id="${escapeAttribute(review.id)}">
      <div class="db-review-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
      <div class="db-review-copy">
        <div class="db-review-meta"><strong>${escapeHtml(review.author_name)}</strong>${review.verified_purchase ? '<span>Təsdiqlənmiş alış</span>' : ''}<time datetime="${escapeAttribute(new Date(review.created_at).toISOString())}">${escapeHtml(date)}</time></div>
        ${reviewStars(review.rating)}
        ${review.title ? `<h4>${escapeHtml(review.title)}</h4>` : ''}
        <p>${escapeHtml(review.body)}</p>
      </div>
    </article>`;
  }

  function csrfToken() {
    const part = document.cookie.split('; ').find((item) =>
      item.startsWith('db_csrf=') || item.startsWith('__Host-db_csrf=')
    );
    return part ? decodeURIComponent(part.slice(part.indexOf('=') + 1)) : '';
  }

  const reviewForm = page.querySelector('[data-review-form]');
  reviewForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!reviewForm.reportValidity()) return;
    const wrapper = reviewForm.closest('[data-product-reviews]');
    const status = reviewForm.querySelector('[data-review-form-status]');
    const submit = reviewForm.querySelector('button[type="submit"]');
    const formData = new FormData(reviewForm);
    const payload = {
      rating:Number(formData.get('rating')),
      authorName:String(formData.get('authorName') || '').trim(),
      email:String(formData.get('email') || '').trim(),
      title:String(formData.get('title') || '').trim(),
      body:String(formData.get('body') || '').trim()
    };
    submit.disabled = true;
    status.classList.remove('is-error');
    status.textContent = 'Rəyiniz göndərilir...';
    try {
      const token = csrfToken();
      const response = await fetch(`/api/v1/customer/products/${encodeURIComponent(wrapper.dataset.productSlug)}/reviews`, {
        method:'POST',
        credentials:'same-origin',
        headers:{
          Accept:'application/json',
          'Content-Type':'application/json',
          ...(token ? { 'X-CSRF-Token':token } : {})
        },
        body:JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof result?.error === 'object'
          ? result.error?.message
          : result?.message;
        throw new Error(message || 'Rəyi göndərmək mümkün olmadı');
      }
      const list = wrapper.querySelector('[data-review-list]');
      list.querySelector('[data-review-empty]')?.remove();
      const previous = result.data.review?.id
        ? list.querySelector(`[data-review-id="${CSS.escape(result.data.review.id)}"]`)
        : null;
      previous?.remove();
      list.insertAdjacentHTML('afterbegin', reviewItem(result.data.review));
      wrapper.querySelector('[data-review-average]').textContent = Number(result.data.summary.average || 0).toFixed(1);
      wrapper.querySelector('[data-review-count]').textContent = String(result.data.summary.count || 0);
      status.textContent = 'Rəyiniz uğurla yayımlandı.';
      reviewForm.reset();
    } catch (error) {
      status.classList.add('is-error');
      status.textContent = error?.message || 'Rəyi göndərmək mümkün olmadı';
    } finally {
      submit.disabled = false;
    }
  });

  function initializeRecentlyViewed() {
    const script = page.querySelector('[data-current-product]');
    if (!script) return;
    let current;
    let history = [];
    try {
      current = JSON.parse(script.textContent || '{}');
      const stored = JSON.parse(localStorage.getItem('dailyBakuRecentlyViewedV1') || '[]');
      history = Array.isArray(stored) ? stored : [];
    } catch {
      return;
    }
    if (!current?.slug) return;
    const previous = history.filter((item) => item?.slug && item.slug !== current.slug).slice(0, 16);
    const section = page.querySelector('[data-recently-viewed-section]');
    const track = page.querySelector('[data-recently-viewed-track]');
    if (section && track && previous.length) {
      track.innerHTML = previous.map(productCard).join('');
      section.hidden = false;
      window.DailyBakuCommerce?.syncUI?.();
    }
    try {
      localStorage.setItem('dailyBakuRecentlyViewedV1', JSON.stringify([current, ...previous].slice(0, 20)));
    } catch {
      // Recently viewed remains optional when storage is unavailable.
    }
  }

  function updateStickyBar() {
    const bar = page.querySelector('[data-product-sticky-buy]');
    const additional = document.querySelector('#product-additional-information');
    const recent = document.querySelector('#recently-viewed-products');
    if (!bar || !additional || !mobileQuery.matches) {
      bar?.classList.remove('is-visible');
      return;
    }
    const additionalTop = additional.getBoundingClientRect().top;
    const stop = recent && !recent.hidden
      ? recent.getBoundingClientRect().bottom < 100
      : document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 150;
    bar.classList.toggle('is-visible', additionalTop < window.innerHeight * .72 && !stop);
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateStickyBar();
      ticking = false;
    });
  }, { passive:true });
  mobileQuery.addEventListener?.('change', updateStickyBar);

  initializeRecentlyViewed();
  syncQuantity(1);
  updateStickyBar();
})();
