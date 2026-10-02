(() => {
  'use strict';

  document.documentElement.classList.add('js');

  const apiForms = document.querySelectorAll('[data-api-form]');
  for (const form of apiForms) {
    form.addEventListener('submit', (event) => {
      if (document.documentElement.dataset.cmsConnected === 'true') return;

      event.preventDefault();
      document.dispatchEvent(new CustomEvent('frontend:api-required', {
        detail: {
          endpoint: form.getAttribute('action'),
          form: form.dataset.apiForm
        }
      }));
    });
  }

  const hero = document.querySelector('#SR7_5_1');
  const mobileHero = window.matchMedia('(max-width: 767px)');
  let heroPointer = null;

  hero?.addEventListener('pointerdown', (event) => {
    if (!mobileHero.matches || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    heroPointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      slide: window.SR7?.M?.[hero.id]?.current?.id
    };
  }, { passive: true });

  const finishHeroSwipe = (event) => {
    if (!heroPointer || heroPointer.id !== event.pointerId) return;
    const gesture = heroPointer;
    heroPointer = null;
    if (!mobileHero.matches) return;

    const distanceX = event.clientX - gesture.x;
    const distanceY = event.clientY - gesture.y;
    if (Math.abs(distanceX) < 45 || Math.abs(distanceX) <= Math.abs(distanceY)) return;

    window.setTimeout(() => {
      const slider = window.SR7?.M?.[hero.id];
      if (!slider || slider.hasTouchSwipe || slider.current?.id !== gesture.slide) return;
      window.SR7?.F?.requestSlide?.({
        id: hero.id,
        slide: distanceX < 0 ? '+1' : '-1'
      });
    }, 100);
  };

  window.addEventListener('pointerup', finishHeroSwipe, { passive: true });
  window.addEventListener('pointercancel', (event) => {
    if (heroPointer?.id === event.pointerId) heroPointer = null;
  }, { passive: true });

  const separateDiscountAndCouponMenus = () => {
    document.querySelectorAll('#menu-mobile-menu, #menu-desktop-menu-with-categories').forEach((menu) => {
      const storeSubmenu = menu.querySelector(':scope > .menu-item > a[href="/magaza/"] + .sub-menu');
      if (storeSubmenu && !storeSubmenu.querySelector(':scope > .menu-item > a[href="/magaza/hediyyeler/"]')) {
        const giftsItem = document.createElement('li');
        giftsItem.className = 'menu-item depth-1 db-gifts-menu-item';
        giftsItem.innerHTML = '<a href="/magaza/hediyyeler/" class="mi-link"><span class="txt">Hədiyyələr</span><span class="effect"></span></a>';
        storeSubmenu.append(giftsItem);
      }
      const discountLink = menu.querySelector(':scope > .menu-item > a[href="/endirimler/"]');
      const discountItem = discountLink?.parentElement;
      if (!discountLink || !discountItem?.classList.contains('menu-item')) return;
      discountLink.querySelector(':scope > .txt')?.replaceChildren(document.createTextNode('Endirimlər'));
      if (menu.querySelector(':scope > .menu-item > a[href="/kuponlar/"]')) return;
      const couponItem = document.createElement('li');
      couponItem.className = 'menu-item depth-0 db-coupons-menu-item';
      couponItem.innerHTML = '<a href="/kuponlar/" class="mi-link"><span class="txt">Kuponlar</span><span class="effect"></span></a>';
      discountItem.after(couponItem);
    });
  };

  const initializeMobileNavigation = () => {
    separateDiscountAndCouponMenus();
    const container = document.querySelector('.mobile-container');
    const navigation = container?.querySelector('#menu-mobile-menu');
    if (!container || !navigation) return;

    const parentItems = [...navigation.querySelectorAll(':scope > .menu-item-has-children')];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let transitionTimer = 0;
    parentItems.forEach((item) => {
      const link = item.querySelector(':scope > .mi-link');
      const submenu = item.querySelector(':scope > .sub-menu');
      link?.setAttribute('aria-haspopup', 'true');
      link?.setAttribute('aria-expanded', 'false');
      if (submenu) {
        submenu.hidden = true;
        submenu.setAttribute('aria-hidden', 'true');
      }
      if (link && !link.querySelector(':scope > .db-mobile-nav-chevron')) {
        const chevron = document.createElement('span');
        chevron.className = 'db-mobile-nav-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        link.append(chevron);
      }
    });
    navigation.querySelectorAll('.view-all > .mi-link').forEach((link) => {
      if (link.querySelector(':scope > .db-mobile-nav-chevron')) return;
      const chevron = document.createElement('span');
      chevron.className = 'db-mobile-nav-chevron db-mobile-view-all-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      link.append(chevron);
    });

    const resetDrillDown = () => {
      window.clearTimeout(transitionTimer);
      navigation.classList.remove('db-mobile-list-return');
      navigation.querySelectorAll('.isolate, .disable, .hide, .active, .db-mobile-drill-out').forEach((item) => {
        item.classList.remove('isolate', 'disable', 'hide', 'active', 'db-mobile-drill-out');
      });
      parentItems.forEach((item) => {
        const link = item.querySelector(':scope > .mi-link');
        const submenu = item.querySelector(':scope > .sub-menu');
        link?.setAttribute('aria-expanded', 'false');
        if (submenu) {
          submenu.hidden = true;
          submenu.setAttribute('aria-hidden', 'true');
        }
        if (item.contains(document.activeElement)) document.activeElement?.blur();
      });
    };

    navigation.addEventListener('click', (event) => {
      const parentLink = event.target.closest('.menu-item-has-children > .mi-link');
      if (!parentLink || parentLink.parentElement?.parentElement !== navigation) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const item = parentLink.parentElement;
      if (item.classList.contains('db-mobile-drill-out')) return;

      if (item.classList.contains('isolate')) {
        parentLink.setAttribute('aria-expanded', 'false');
        item.classList.add('db-mobile-drill-out');
        const finishReturn = () => {
          const submenu = item.querySelector(':scope > .sub-menu');
          item.classList.remove('isolate', 'active', 'db-mobile-drill-out');
          parentItems.forEach((entry) => entry.classList.remove('disable', 'hide'));
          if (submenu) {
            submenu.hidden = true;
            submenu.setAttribute('aria-hidden', 'true');
          }
          parentLink.blur();
          navigation.classList.add('db-mobile-list-return');
          transitionTimer = window.setTimeout(() => navigation.classList.remove('db-mobile-list-return'), reducedMotion.matches ? 0 : 280);
        };
        transitionTimer = window.setTimeout(finishReturn, reducedMotion.matches ? 0 : 210);
        return;
      }

      resetDrillDown();
      item.classList.add('isolate', 'active');
      const submenu = item.querySelector(':scope > .sub-menu');
      if (submenu) {
        submenu.hidden = false;
        submenu.setAttribute('aria-hidden', 'false');
      }
      parentItems.forEach((entry) => {
        if (entry !== item) entry.classList.add('hide');
      });
      parentLink.setAttribute('aria-expanded', 'true');
    }, true);

    container.querySelector('.mobile-tabset')?.addEventListener('click', (event) => {
      const tab = event.target.closest('.mobile-tab-item');
      if (tab && tab.parentElement?.classList.contains('mobile-tabset')) resetDrillDown();
    });

    const navigationTab = [...container.querySelectorAll('.mobile-tabset > .mobile-tab-item')]
      .find((tab) => tab.textContent?.includes('Naviqasiya'));
    const activateNavigation = () => {
      resetDrillDown();
      if (navigationTab && !navigationTab.classList.contains('active')) navigationTab.click();
    };

    activateNavigation();
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.et__mobile-toggle')) return;
      window.requestAnimationFrame(() => {
        if (container.classList.contains('active')) activateNavigation();
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMobileNavigation, { once: true });
  } else {
    initializeMobileNavigation();
  }
})();
