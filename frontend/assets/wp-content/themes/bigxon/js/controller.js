/* Helper functions
----*/
	
	const addon = copt.addon;
	const isRTL = jQuery("html").attr("dir") === "rtl" ? true : false;
	const adminBar = jQuery('body').hasClass('admin-bar') ? true : false;
	const currentLang  = (jQuery('body').hasClass('multilingual') ? jQuery('html').attr('lang').split('-').shift() : 'default');
	const currency = (window.copt && copt.activeCurrency) ? copt.activeCurrency : '';

	const ajaxUrl = copt.ajaxUrl;

	window.BIGXON = {
	    addon,
	    isRTL,
	    adminBar,
	    currentLang,
	    ajaxUrl,
	    currency
	};

	/* nonce bundle
	----*/

		function etRefreshNoncesOnce() {
		  if (window.__etNonceRefreshPromise) return window.__etNonceRefreshPromise;

		  window.__etNonceRefreshPromise = jQuery.ajax({
		    url: copt.ajaxUrl,
		    type: 'POST',
		    dataType: 'json',
		    cache: false,
		    data: { action: 'et__get_nonce_bundle' }
		  }).then(function(res){
		    if (res && res.success && res.data && res.data.nonces) {
		      Object.assign(copt, res.data.nonces);
		      if (copt.wc_cart_params && copt.wcCartNonce) {
				  copt.wc_cart_params.nonce = copt.wcCartNonce;
				}
		      return res.data.nonces;
		    }
		    return jQuery.Deferred().reject(res);
		  }).always(function(){
		    window.__etNonceRefreshPromise = null;
		  });

		  return window.__etNonceRefreshPromise;
		}

		/**
		 * Retry once if the AJAX response looks like a nonce failure.
		 * nonceKey = key inside copt, e.g. 'fbtNonce'
		 */
		function etAjaxRetryBadNonce(opts, nonceKey) {
		  const $ = jQuery;
		  const originalSuccess = opts.success;
		  const originalError   = opts.error;

		  function looksBadNonce(response, xhr) {
		    // Best case: your PHP sends JSON error { success:false, data:{code:'bad_nonce'} }
		    if (response && response.success === false && response.data && response.data.code === 'bad_nonce') return true;

		    // Fallbacks (if check_ajax_referer died with -1 / 0)
		    if (typeof response === 'string' && (response.trim() === '-1' || response.trim() === '0')) return true;

		    // Some setups return 403
		    if (xhr && (xhr.status === 403 || xhr.status === 401)) return true;

		    return false;
		  }

		  function runOnce(isRetry) {
		    // refresh nonce value inside data before each run
		    if (nonceKey) {
		      opts.data = opts.data || {};
		      opts.data.nonce = (copt && copt[nonceKey]) ? copt[nonceKey] : (opts.data.nonce || '');
		    }

		    // wrap success
		    opts.success = function(response, textStatus, xhr) {
		      if (!isRetry && looksBadNonce(response, xhr)) {
		        return etRefreshNoncesOnce().then(function(){
		          return runOnce(true);
		        });
		      }
		      if (typeof originalSuccess === 'function') return originalSuccess(response, textStatus, xhr);
		    };

		    // wrap error
		    opts.error = function(xhr) {
		      if (!isRetry && xhr && (xhr.status === 403 || xhr.status === 401)) {
		        return etRefreshNoncesOnce().then(function(){
		          return runOnce(true);
		        });
		      }
		      if (typeof originalError === 'function') return originalError(xhr);
		    };

		    return $.ajax(opts);
		  }

		  return runOnce(false);
		}


	function etWhenFullyLoaded(cb, maxWaitMs = 5000) {
	  let done = false;

	  function run() {
	    if (done) return;
	    done = true;

	    // wait for layout to settle (2 frames)
	    requestAnimationFrame(() => requestAnimationFrame(cb));
	  }

	  // If already loaded (bfcache / fast nav)
	  if (document.readyState === 'complete') {
	    return run();
	  }

	  // Fire when all resources loaded
	  window.addEventListener('load', run, { once: true, passive: true });

	  // Safety: don't wait forever
	  setTimeout(run, maxWaitMs);
	}

	function arrayUnique(array){
		return array.filter(function (value, index, self) {
	        return self.indexOf(value) === index;
	    });
	}

	function uniqueID() {return Math.floor((Math.random() * 1000000) + 1);}

	function inArray(value, array) {return array.indexOf(value) > -1;}

	function inView(targets, callback, once = true, threshold = 0.1, adjustMobile = true) {
	  if (typeof callback !== 'function') {
	    throw new TypeError('inView: callback must be a function');
	  }

	  // Normalize targets → array of Elements
	  const toElements = (t) => {
	    if (!t) return [];
	    // selector string
	    if (typeof t === 'string') return Array.from(document.querySelectorAll(t));
	    // jQuery object
	    if (typeof window !== 'undefined' && window.jQuery && t instanceof window.jQuery) {
	      return t.toArray();
	    }
	    // single Element
	    if (t instanceof Element) return [t];
	    // NodeList / Array / mixed (allow jQuery items inside)
	    if (t.length != null) {
	      return Array.from(t).flatMap((x) =>
	        (window.jQuery && x instanceof window.jQuery) ? x.toArray() :
	        (x instanceof Element) ? [x] : []
	      );
	    }
	    return [];
	  };

	  const elements = toElements(targets);

	  // Fallback if no elements found
	  if (!elements.length) {
	    callback(false);
	    return { disconnect(){}, unobserve(){}, observe(){} };
	  }

	  // If IntersectionObserver isn’t supported, just fire once immediately
	  if (typeof IntersectionObserver !== 'function') {
	    elements.forEach((el) => callback(true, { target: el, isIntersecting: true }));
	    return { disconnect(){}, unobserve(){}, observe(){} };
	  }

	  let effectiveThreshold = threshold;
	  if (typeof window !== 'undefined') {
	    const isMobile = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
	    if (adjustMobile && isMobile && threshold > 0.2) {
	      effectiveThreshold = 0.2;
	    }
	  }

	  const observer = new IntersectionObserver((entries) => {
	    entries.forEach((entry) => {
	      if (entry.isIntersecting) {
	        callback(true, entry);
	        if (once) observer.unobserve(entry.target);
	      } else if (!once) {
	        callback(false, entry);
	      }
	    });
	  }, { threshold: effectiveThreshold });

	  elements.forEach((el) => observer.observe(el));

	  // handy controller
	  return {
	    disconnect: () => observer.disconnect(),
	    unobserve: (el) => observer.unobserve(el),
	    observe: (el) => observer.observe(el),
	    _observer: observer
	  };
	}

	function waitForElement(selector, callback) {
	    // If it is already there, run immediately
	    const elem = document.querySelector(selector);
	    if (elem) {
	        callback(elem);
	        return;
	    }

	    // Otherwise watch the DOM for added nodes
	    const observer = new MutationObserver((mutations, obs) => {
	        const el = document.querySelector(selector);
	        if (el) {
	            obs.disconnect();
	            callback(el);
	        }
	    });

	    observer.observe(document.documentElement, {
	        childList: true,
	        subtree: true
	    });
	}

	/* cart functions
	----*/

		function extendCartItemHTML(){

			jQuery('.et__cart .mini_cart_item > a:not(.remove)').each(function() {
			    let $this = jQuery(this);
			    $this.contents().filter(function() {
			        return this.nodeType === 3 && jQuery.trim(this.nodeValue) !== ''; // Select only non-empty text nodes
			    }).wrap('<span></span>');
			});

			jQuery('.et__cart .mini_cart_item .quantity').each(function () {
				let $this = jQuery(this);
				$this.contents().filter(function () {
					return this.nodeType === 3 && jQuery.trim(this.nodeValue) !== '';
				}).each(function () {
					let rawText = this.nodeValue;
					let num = rawText.replace(/[^\d]/g, ''); // Remove non-numeric chars
					if (num) {
						jQuery(this).replaceWith(
							'<span class="qtn"><span class="inc minus"></span>' +
							'<span class="val">'+num+'</span><span class="inc plus"></span></span>'
						);
					}
				});
			});

			jQuery('.et__cart .mini_cart_item dl.variation').each(function() {
			    let $this = jQuery(this);
			    let offset = $this.prev('a').height() - $this.prev('a').children('span').height() - 8;

			    if (!isNaN(offset) && offset > 0) {
			    	$this.css('margin-top','-'+offset+'px');
			    }

			});

		}

		function renderSimilarProducts(jQueryblock){
	    	// Scope all subsequent lookups to the freshly inserted block
		    var jQuerycontainer = jQueryblock.find('.similar-products-carousel-container');
		    var jQuerysc = jQueryblock.find('.spcc');

		    // Determine slidesPerView based on *scoped* container
		    var sPerView = jQuerycontainer.hasClass('one') ? 1 : 1.4;

		    var opt = {
		      breakpoints: {
		        240:  { slidesPerView: sPerView, spaceBetween: 8  },
		        360:  { slidesPerView: sPerView, spaceBetween: 12 },
		        768:  { slidesPerView: sPerView, spaceBetween: 12 },
		        1024: { slidesPerView: sPerView, spaceBetween: 12 },
		        1280: { slidesPerView: sPerView, spaceBetween: 12 },
		        1600: { slidesPerView: sPerView, spaceBetween: 12 }
		      }
		    };

		    if (jQuerysc.length) {
		      buildSwiperCarousel(jQuerysc, opt);
		      // Lazy load only inside this block
		      var scEl = jQuerysc.get(0);
		      if (scEl && typeof lazyLoad === 'function') {
		        lazyLoad(scEl);
		      }
		      // Visual cleanup
		      setTimeout(function () {
		        jQuerysc.find('.swiper-slide').removeClass('swiper-hidden');
		        jQuerysc.removeClass('loading');
		      }, 300);
		    }

		    // If this relies on heights, call after DOM insertion/initialization
		    if (typeof adjustCartListHeight === 'function') {
		    	jQuery('.et__cart .woocommerce-mini-cart').addClass('no-gap');
		      	adjustCartListHeight();
		      	if (jQuery('.et__cart .cart_list').length) {
					jQuery('.et__cart .cart_list').stop().animate({ scrollTop: jQuery('.et__cart .cart_list')[0].scrollHeight }, 300);
				}
		    }
	    }

	    function fetchCartItemsSimilarProducts(){

	    	if (jQuery('.similar-products-carousel').length) {
				jQuery('.similar-products-carousel').addClass('loading');
			} else {
				jQuery('.et__cart .woocommerce-mini-cart').removeClass('no-gap');
			}

	    	jQuery.ajax({
			  url: copt.ajaxUrl,
			  type: 'POST',
			  dataType: 'json', // <-- let jQuery parse it
			  data: {
			  	nonce:copt.fetchCartItemsSimilarProductsNonce,
			    action: 'et__fetch_cart_items_similar_products',
			    lang: currentLang
			  },
			  success: function (resp) {
			    // Normalize payload shape: support {products: '...'} or {success:true, data:{products:'...'}}
			    var productsHtml =
			      (resp && typeof resp === 'object' && resp.products) ? resp.products :
			      (resp && resp.data && resp.data.products) ? resp.data.products :
			      '';

			    if (!productsHtml) {
			      // nothing to inject
			      return;
			    }

			    // Build wrapper and prepare slides
			    var jQueryblock = jQuery('<div class="spcw">').html(productsHtml);
			    jQueryblock.find('.product').addClass('swiper-slide');

			    // Title (optional i18n)
			    jQueryblock.prepend('<h3 class="similar-products-title">' + (copt.strings.like || 'You may also like') + '</h3>');

			    // Insert into DOM (replace existing or insert)
			    if (jQuery('.spcw').length) {
			      jQuery('.spcw').replaceWith(jQueryblock);
			      renderSimilarProducts(jQueryblock)
			    } else {
			    	setTimeout(function(){
			    		if (!jQuery('.et__cart .product_list_widget').first().next('.spcw').length) {
			    			jQueryblock.insertAfter(jQuery('.et__cart .product_list_widget').first());
			      			renderSimilarProducts(jQueryblock)
			    		}
			    	},1000);
			    }
			    
			  },
			  error: function (xhr, status, error) {
			  	jQuery('.et__cart .woocommerce-mini-cart').removeClass('no-gap');
			    console.log(error);
			  }
			});

	    }

	    function adjustCartListHeight() {

	    	if (jQuery(window).height() <= 767) {
	    		jQuery('.shop-cart-before-mini-cart-widgets').hide();
	    		jQuery('.shop-cart-after-buttons-widgets').hide();
	    	} else {
	    		jQuery('.shop-cart-before-mini-cart-widgets').show();
	    		jQuery('.shop-cart-after-buttons-widgets').show();
	    	}

		    let cartContentHeightOff = [
		        parseFloat(jQuery('.et__cart').css('padding-top')) || 0,144
		    ];

		    if (jQuery('.shop-cart-before-mini-cart-widgets').length && jQuery('.shop-cart-before-mini-cart-widgets').is(':visible')) {
		        cartContentHeightOff.push(jQuery('.shop-cart-before-mini-cart-widgets').outerHeight() || 0);
		    }

		    if (jQuery('.shop-cart-after-buttons-widgets').length && jQuery('.shop-cart-after-buttons-widgets').is(':visible')) {
		        cartContentHeightOff.push(jQuery('.shop-cart-after-buttons-widgets').outerHeight() || 0);
		    }

		    if (jQuery('.et__cart .similar-products-carousel-container').length) {
		        cartContentHeightOff.push(jQuery('.et__cart .similar-products-carousel-container').outerHeight() + jQuery('.similar-products-title').outerHeight() + 40 || 0);
		    }

		    cartContentHeightOff = Math.round(cartContentHeightOff.reduce((acc, num) => acc + num, 0));

		    let cartContent = jQuery('.et__cart .product_list_widget');

		    if (cartContent.length) {
		    	cartContent.attr('style','--offset-value:'+cartContentHeightOff+'px');
		    }

		    jQuery('.et__cart .mini_cart_item dl.variation').each(function() {
			    let $this = jQuery(this);
			    let offset = $this.prev('a').height() - $this.prev('a').children('span').height() - 8;

			    if (!isNaN(offset) && offset > 0) {


			    	$this.css('margin-top','-'+offset+'px');
			    }

			});

		}

		function toggleCartWidgetsVisibility() {
			setTimeout(function(){
				const jQuerycart = jQuery('.et__cart');
				const hasEmptyMessage = jQuerycart.find('.woocommerce-mini-cart__empty-message').length > 0;
				const hasCartItems = jQuerycart.find('.product_list_widget li').length > 0;

				if (hasEmptyMessage && !hasCartItems) {
					jQuery('.shop-cart-before-mini-cart-widgets').hide();
					jQuery('.shop-cart-after-buttons-widgets').hide();
				} else {
					jQuery('.shop-cart-before-mini-cart-widgets').show();
					jQuery('.shop-cart-after-buttons-widgets').show();
				}
			},1);
		}

		function afterCartUpdate(){
			
			extendCartItemHTML();
			fetchCartItemsSimilarProducts();
			toggleCartWidgetsVisibility();
			adjustCartListHeight();

			if (jQuery('.et__cart .cart_list').length) {
				jQuery('.et__cart .cart_list').stop().animate({ scrollTop: jQuery('.et__cart .cart_list')[0].scrollHeight }, 300);
			}
		}

		function handleCartFragmentsEvent() {
			// Mini cart is empty
			if (jQuery('.et__cart .woocommerce-mini-cart__empty-message').length) {
				toggleCartWidgetsVisibility();
				return;
			}

			afterCartUpdate();
		}

		function toggleStickyDashboardOnCartToggle(){
			if (jQuery('.et__cart').hasClass('active')) {
				jQuery('.sticky-dashboard').addClass('off');
				jQuery('.before-shop-loop.sticky').addClass('off');
			} else {
				jQuery('.sticky-dashboard').removeClass('off');
				jQuery('.before-shop-loop.sticky').removeClass('off');
			}
		}

	/* Count down
	----*/

		!function(e){e.fn.countdown=function(t,n){var o=e.extend({date:null,offset:null,extend:null,day:"Day",days:"Days",hour:"Hour",hours:"Hours",minute:"Minute",minutes:"Minutes",second:"Second",seconds:"Seconds",hideOnComplete:!1,reset:!1},t);o.date||e.error("Date is not defined."),Date.parse(o.date)||e.error("Incorrect date format, it should look like this, 12/24/2012 12:00:00.");var r=this,d=new Date(o.date),s=function(){var e=new Date,t=e.getTime()+6e4*e.getTimezoneOffset();return new Date(t+36e5*o.offset)};var i=setInterval(function(){var t=s(),a=d-t;if(a<0){if(!o.reset||!o.extend)return clearInterval(i),o.hideOnComplete&&e(r).hide(),void(n&&"function"==typeof n&&n(r));d.setSeconds(d.getSeconds()+3600*o.extend),a=d-t}var f=Math.floor(a/864e5),u=Math.floor(a%864e5/36e5),l=Math.floor(a%36e5/6e4),h=Math.floor(a%6e4/1e3),c=1===f?o.day:o.days,x=1===u?o.hour:o.hours,g=1===l?o.minute:o.minutes,m=1===h?o.second:o.seconds;f=String(f).length>=2?f:"0"+f,u=String(u).length>=2?u:"0"+u,l=String(l).length>=2?l:"0"+l,h=String(h).length>=2?h:"0"+h,r.find(".days").text(f),r.find(".hours").text(u),r.find(".minutes").text(l),r.find(".seconds").text(h),r.find(".days_text").text(c),r.find(".hours_text").text(x),r.find(".minutes_text").text(g),r.find(".seconds_text").text(m)},1e3)}}(jQuery);

		(function($){

			"use strict";

			$('.et__timer').each(function(){

				var $this   = $(this),
					extend  = $this.data('number'),
					enddate = $this.data('enddate'),
					gmt     = $this.data('gmt'),
					reset   = (typeof(extend) != 'undefined' && extend != null) ? true : false,
					gmt     = (typeof(gmt) != 'undefined' && gmt != null) ? gmt : 0;

				if (!$this.hasClass('fired')) {

					var today   = new Date();
					var enddate = new Date(enddate);

					if (reset && today >= enddate) {
						enddate = new Date();
							enddate.setDate(enddate.getDate() + extend);
					}

		            $this.find('ul').countdown({
		                date: enddate,
		                offset: $this.data('gmt'),
		            });

		            $this.addClass('fired');

	            }

			});

		})(jQuery);

	/* Modify urls
	----*/

		function getUrlParams(url=window.location.href) {

	        var url = decodeURIComponent(url);
	            url = url.split('?');

	        var query = url[1];
	        var params = new Object;

	        if (typeof(query) != 'undefined' && query != null) {
	            var vars = query.split('&');
	            for (var i = 0; i < vars.length; i++) {
	                var pair = vars[i].split('=');
	                params[pair[0]] = decodeURIComponent(pair[1]);
	            }
	            return (jQuery.isEmptyObject(params)) ? false : params;
	        }

	        return false;
	    }

	    function clearUrlParams(url) {

	        url.split('?');

	        var query = url[1];
	        var params = '';
	        var newsUrl = url[0];

	        if (typeof(query) != 'undefined' && query != null) {
	            var vars = query.split('&');
	            for (var i = 0; i < vars.length; i++) {
	                var pair = vars[i].split('=');
	            }

	            if (params.length && params.includes('&')) {newsUrl += '?'+params;}

	            return newsUrl;
	        }

	        return false;
	    }

	    function createUrlParams(shopURL,data,reload = true){

	        if (shopURL.indexOf("?") == -1){
	            shopURL += '?';
	        }

	        jQuery.each(data, function(key, value) {
	            if (value.length) {
	                shopURL += '&'+key+'='+value;
	            }
	        });

	        shopURL = shopURL.replace('?&', '?');

	        shopURL = encodeURI(shopURL);

	        if (reload) {
	            window.location.assign(shopURL);
	        } else {
	            history.pushState({}, null, shopURL);
	        }

	    }

	/* Cookie
	----*/
	    
		function getCookie(name) {
		    const nameEQ = name + "=";
		    const cookies = document.cookie.split(';');
		    for (let i = 0; i < cookies.length; i++) {
		        let cookie = cookies[i].trim();
		        if (cookie.indexOf(nameEQ) === 0) {
		            return decodeURIComponent(cookie.substring(nameEQ.length));
		        }
		    }
		    return null; // Return null if the cookie is not found
		}

		function setCookie(name, value) {
		    const date = new Date();
		    date.setTime(date.getTime() + 7 * 24 * 60 * 60 * 1000); // Set expiration for 7 days from now
		    const expires = "; expires=" + date.toUTCString();
		    document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/";
		}

		function removeCookie(name) {
		    const expires = "; expires=Thu, 01 Jan 1970 00:00:00 UTC";
		    document.cookie = name + "=" + "" + expires + "; path=/";
		}
	
	/* staggerItems
	----*/

		function staggerItems(items,instant = false){
			items.each(function () {
				const $this   = jQuery(this);
				const content = $this.find('.item').toArray();
				const tl = gsap.timeline({ paused: true });

				// Movement animation (longer)
				tl.from(content, {
					duration: 1.2,
					x: 5,
					y: 20,
					ease: "expo.out",
					stagger: { each: 0.05 }
				}, "+=0.1");

				// Opacity animation (shorter, 0.1s)
				tl.from(content, {
					duration: 0.1,
					opacity: 0,
					ease: "power1.out",
					stagger: { each: 0.05 }
				}, "<"); // "<" = start at same time as previous animation

				if (instant) {
					$this.addClass('fired');
					tl.progress(0).play();
				} else {
					inView(this, function () {
						$this.addClass('fired');
						tl.progress(0).play();
					}, true, 0.5);
				}
			});
		}

	/* wpAjax
	----*/

		function wpAjax(action, data = {}, method = "POST") {
		  return new Promise((resolve, reject) => {

		    const ajaxUrl =
		      (window.copt && window.copt.ajaxUrl) ||
		      (window.BIGXON && window.BIGXON.ajaxUrl) ||
		      window.ajaxurl;

		    if (!ajaxUrl) {
		      reject("AJAX URL is missing (copt.ajaxUrl / BIGXON.ajaxUrl / ajaxurl)");
		      return;
		    }

		    // Ensure we always send the same format your working calls send:
		    // application/x-www-form-urlencoded; charset=UTF-8
		    const payload = { action: action };

		    if (data instanceof FormData) {
		      // Convert FormData => plain object (jQuery friendly)
		      data.forEach((value, key) => {
		        payload[key] = value;
		      });
		    } else if (data && typeof data === "object") {
		      Object.assign(payload, data);
		    }

		    // Add a cache-bust field INSIDE the body (not URL) to avoid unique URLs
		    // (helps avoid weird CDN/WAF patterns)
		    payload._ts = Date.now();

		    jQuery.ajax({
		      url: ajaxUrl,
		      type: method,
		      data: payload,
		      dataType: "json",            // same as your working code
		      cache: false,                // jQuery adds cache busting for GET, harmless here
		      timeout: 30000,
		      xhrFields: {
		        withCredentials: true      // similar intent as fetch credentials: "same-origin"
		      },
		      beforeSend: function(xhr) {
		        // Many security layers treat this as a "real ajax"
		        xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
		        // Encourage no caching at proxies
		        xhr.setRequestHeader("Cache-Control", "no-cache");
		      },
		      success: function(resp) {
		        // Normalize wp_send_json_success / error shapes
		        // success response: { success:true, data: ... }
		        // some endpoints might return raw objects; support both
		        if (resp && typeof resp === "object") {
		          if (resp.success === false) {
		            reject(resp.data || "Unknown AJAX error");
		            return;
		          }
		          if (resp.success === true) {
		            resolve(resp.data);
		            return;
		          }
		          // fallback (non-standard)
		          resolve(resp);
		          return;
		        }

		        // If WP prints "0" or plain text, treat it as an error
		        const t = String(resp || "").trim();
		        if (t === "0") {
		          reject("WP AJAX returned 0 (handler not reached or nonce/capability check failed)");
		        } else {
		          resolve(resp);
		        }
		      },
		      error: function(xhr, status, error) {
		        // Give you a real clue instead of just "Network error"
		        const ct = (xhr && xhr.getResponseHeader) ? xhr.getResponseHeader("content-type") : "";
		        const snippet = (xhr && xhr.responseText) ? String(xhr.responseText).slice(0, 250) : "";

		        reject({
		          status: xhr ? xhr.status : 0,
		          statusText: xhr ? xhr.statusText : status,
		          error: error || status,
		          contentType: ct,
		          responseSnippet: snippet
		        });
		      }
		    });

		  });
		}

		function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

		async function wpAjaxRetry(action, data, attempts = 2, delayMs = 450) {
		  let lastErr = null;

		  for (let i = 1; i <= attempts; i++) {
		    try {
		      const resp = await wpAjax(action, data); // your existing wpAjax
		      if (resp && typeof resp === "object") return resp;
		      throw new Error("Empty/invalid AJAX response");
		    } catch (e) {
		      lastErr = e;
		      if (i < attempts) await sleep(delayMs);
		    }
		  }

		  throw lastErr;
		}

	/* megamenu grid alignment
	----*/

	    function alignMegamenuToInner() {
		    jQuery('.mm-align-grid').each(function () {
		        var $li    = jQuery(this);
		        var $inner = $li.closest('.e-con-inner'); // header container for this menu

		        if (!$inner.length) {
		            return;
		        }

		        var $menu = $li.children('.megamenu');
		        if (!$menu.length) {
		            return;
		        }

		        // reset before measuring
		        $menu.css({
		            marginLeft: ''
		        });

		        var innerOffset = $inner.offset().left;
		        var liOffset    = $li.offset().left;   // use LI instead of hidden menu

		        var diff = innerOffset - liOffset;

		        // align to grid
		        $menu.css({
		            marginLeft: diff + 'px',
		            boxSizing: 'border-box'
		        });
		    });
		}

/* Carousel
----*/

	function updateNavigationVisibility(swiper, btn) {

		if (typeof(swiper) != "undefined" && typeof(swiper.slides) != "undefined") {

		    const totalSlides = swiper.slides.length;
		    const slidesPerView = swiper.params.slidesPerView;

		    if (totalSlides <= slidesPerView) {
		        btn.addClass('swiper-hidden');
		    } else {
		        btn.removeClass('swiper-hidden');
		    }

	    }
	}

	function buildSwiperCarousel($target, opt = false) {

	  const swiperID = uniqueID();
	  let breakpoints = {};

	  const $swiper = $target.children('.swiper').first();
		$swiper.attr('id', 'swiper-' + swiperID);


	  const swiperTarget   = '#' + $swiper.attr('id'),
	  		colDesktop     = (opt && opt.hasOwnProperty('column-d'))  ? opt['column-d']  : $target.attr('data-cl-d'),
	        colLaptop      = (opt && opt.hasOwnProperty('column-lp'))  ? opt['column-lp']  : $target.attr('data-cl-lp'),
	        colTabletLands = (opt && opt.hasOwnProperty('column-tbl'))  ? opt['column-tbl']  : $target.attr('data-cl-tbl'),
	        colTablet      = (opt && opt.hasOwnProperty('column-tb'))  ? opt['column-tb']  : $target.attr('data-cl-tb'),
	        colMobile      = (opt && opt.hasOwnProperty('column-mb'))  ? opt['column-mb']  : $target.attr('data-cl-mb'),
	        colMobileS     = (opt && opt.hasOwnProperty('column-mbs'))  ? opt['column-mbs']  : $target.attr('data-cl-mbs'),
	        gapD           = (opt && opt.hasOwnProperty('gap-d'))  ? opt['gap-d']  : ($target.attr('data-gap-d')  || 32),
	        gapL           = (opt && opt.hasOwnProperty('gap-lp')) ? opt['gap-lp'] : ($target.attr('data-gap-lp') || 24),
	        gapT           = (opt && opt.hasOwnProperty('gap-tb')) ? opt['gap-tb'] : ($target.attr('data-gap-tb') || 24),
	        gapM           = (opt && opt.hasOwnProperty('gap-mb')) ? opt['gap-mb'] : ($target.attr('data-gap-mb') || 12),
	        gapMS          = (opt && opt.hasOwnProperty('gap-mbs'))? opt['gap-mbs']: ($target.attr('data-gap-mbs')|| 8),
	  		inc            = parseFloat(opt && opt.hasOwnProperty('inc') ? opt.inc : ($target.attr('data-inc')  || 0)),
	  		incAuto        = opt && opt.hasOwnProperty('inc-abs') ? true : false,
	  		incMobile      = opt && opt.hasOwnProperty('inc-mobile') ? opt['inc-mobile'] : false,
	  		incM           = incMobile ? incMobile : (incAuto ? inc : inc > 0.3 ? 0.3 : inc);          

	  // --- Normalize autoplay ---
	  const attrAutoplay = ($target.attr('data-autoplay') || '').toString().trim().toLowerCase();
	  const autoPlayOpt  = (opt && opt.hasOwnProperty('autoPlay')) ? opt['autoPlay'] : attrAutoplay;
	  // allow booleans, "true"/"false", "1"/"0", or an object already
	  const autoPlayEnabled = typeof autoPlayOpt === 'object'
	    ? true
	    : (autoPlayOpt === true || autoPlayOpt === 'true' || autoPlayOpt === '1');

	  // optional delay
	  const attrDelay = parseInt($target.attr('data-autoplay-delay') || '', 10);
	  const autoPlayDelay = (opt && opt.autoplayDelay) || (Number.isFinite(attrDelay) ? attrDelay : 5000);

	  // Build breakpoints if not provided
	  if (opt && opt.hasOwnProperty('breakpoints')){
	    breakpoints = opt['breakpoints'];
	  } else {
	    breakpoints = {
	      1:    { slidesPerView: parseFloat(colMobileS) + incM, spaceBetween: parseFloat(gapMS) },
	      360:  { slidesPerView: parseFloat(colMobile)  + incM, spaceBetween: parseFloat(gapM)  },
	      768:  { slidesPerView: parseFloat(colTablet)  + inc, spaceBetween: parseFloat(gapT)  },
	      1024: { slidesPerView: parseFloat(colTabletLands) + inc, spaceBetween: parseFloat(gapT) },
	      1280: { slidesPerView: parseFloat(colLaptop),  spaceBetween: parseFloat(gapL) },
	      1600: { slidesPerView: parseFloat(colDesktop), spaceBetween: parseFloat(gapD) }
	    };
	  }

	  // Pagination (based on your data-nav-type)
	  var navType = ($target.attr('data-nav-type') || 'arrows').toString().trim().toLowerCase(); // 'both' | 'pagination' | 'arrows' | ''
	  	  navType = (opt && opt.hasOwnProperty('navType')) ? opt['navType'] : navType;

	  if (navType != "pagination") {
	  	$target.append(
		    '<div id="carousel-prev-'+swiperID+'" class="swiper-button swiper-button-prev swiper-hidden"></div>' +
		    '<div id="carousel-next-'+swiperID+'" class="swiper-button swiper-button-next swiper-hidden"></div>'
		);
	  }

	  const usePagination = (navType === 'both' || navType === 'pagination');

	  let paginationOpt = false;
	  if (usePagination) {
	    const paginationId = 'carousel-pagination-' + swiperID;
		$swiper.append('<div id="' + paginationId + '" class="swiper-pagination"></div>');
	    // Optional: read type/dynamic/numbers from data-attrs (fallbacks included)
	    const pagType = ($target.attr('data-pagination-type') || 'bullets').toLowerCase(); // 'bullets'|'fraction'|'progressbar'
	    const pagClickable = (($target.attr('data-pagination-clickable') || 'true').toLowerCase() !== 'false');
	    const pagDynamic   = (($target.attr('data-pagination-dynamic') || 'false').toLowerCase() === 'true');
	    const pagNumbers   = (($target.attr('data-pagination-numbers') || 'false').toLowerCase() === 'true');

	    paginationOpt = {
	      el: '#'+paginationId,
	      type: pagType,
	      clickable: pagClickable,
	      dynamicBullets: pagType === 'bullets' ? pagDynamic : false,
	      renderBullet: (pagNumbers && pagType === 'bullets')
	        ? function (index, className) { return '<span class="'+className+'">'+(index+1)+'</span>'; }
	        : undefined,
	      renderFraction: (pagType === 'fraction')
	        ? function (currentClass, totalClass) {
	            return '<span class="'+currentClass+'"></span> / <span class="'+totalClass+'"></span>';
	          }
	        : undefined
	    };
	  }

	  const prevButton = $target.children('.swiper-button-prev');
		const nextButton = $target.children('.swiper-button-next');

	  let previousIndex = 0;

	  // IMPORTANT: pass autoplay at init (or start it explicitly after)
	  const swiper = new Swiper(swiperTarget, {
	    direction: 'horizontal',
	    loop: false,
	    pagination: paginationOpt,
	    spaceBetween: parseFloat(gapD),
	    slidesPerView: parseFloat(colDesktop),
		    grabCursor: false,
		    threshold: 10,
		    touchStartPreventDefault: false,
	    autoHeight: (opt && opt.hasOwnProperty('autoHeight'))
	      ? !!opt['autoHeight']
	      : (($target.attr('data-autoheight') || 'true').toString() === 'true'),

	    effect: (opt && opt.hasOwnProperty('effect') && opt.effect) ? opt.effect : 'slide',
	    nested: (opt && opt.hasOwnProperty('nested') && opt.nested) ? opt.nested : false,

	    breakpoints: breakpoints,

	    // If you’re using the bundle (swiper-bundle.min.js), Autoplay is available.
	    // If using modular build, ensure Autoplay is registered/modules: [Autoplay]
	    autoplay: autoPlayEnabled ? {
	      delay: autoPlayDelay,
	      disableOnInteraction: false,
	      pauseOnMouseEnter: true
	    } : false,

	    on: {
	      slideChange: function () {
	        if (swiper.activeIndex > previousIndex) {
	          swiper.slides.forEach((slide, index) => {
	            if (index < swiper.activeIndex) slide.classList.add('viewed');
	          });
	        } else if (swiper.activeIndex < previousIndex) {
	          swiper.slides.forEach((slide, index) => {
	            if (index >= swiper.activeIndex) slide.classList.remove('viewed');
	          });
	        }
	        previousIndex = swiper.activeIndex;

	        const $navButtons = $target.children('.swiper-button');

			if ($navButtons.length) {
			  updateNavigationVisibility(swiper, $navButtons);
			}
				        
	      },
	      resize: function () {
	        const $navButtons = $target.children('.swiper-button');

			if ($navButtons.length) {
			  updateNavigationVisibility(swiper, $navButtons);
			}
	      }
	    }
	  });

	  if (nextButton.length) {
	    jQuery('body').on('click', '#' + nextButton.attr('id'), function () {
	      swiper.slideNext();
	    });
	  }
	  if (prevButton.length) {
	    jQuery('body').on('click', '#' + prevButton.attr('id'), function () {
	      swiper.slidePrev();
	    });
	  }

	  const $navButtons = $target.children('.swiper-button');

		if ($navButtons.length) {
		  updateNavigationVisibility(swiper, $navButtons);
		}
	}

	function enableItemsCarousel($container){
		jQuery('.items-carousel-container').each(function(){

	    	let $this = jQuery(this),
	    		opt   = {};

	    	if ($this.find('.swiper-initialized').length) {
	    		return;
	    	}

	    	if ($this.hasClass('et__posts')) {

	    		if ($this.hasClass('grid')) {
	    			opt['inc-mobile'] = 0.6;
	    		}

	    	}

	    	if ($this.hasClass('et__product_loop_gallery')) {
	    		opt['effect'] = 'fade';
	    	}

	    	if ($this.hasClass('et__attributes')) {
	    		opt['autoHeight'] = true;
	    	}

			buildSwiperCarousel($this,opt);
	    });
	    
	    jQuery('.section-carousel').each(function () {

		  var $this = jQuery(this);

		  if ($this.find('.swiper-initialized').length) {
    		return;
    	  }

		  var $children = $this.children('.e-con-inner').length
		    ? $this.children('.e-con-inner').children('.elementor-element')
		    : $this.children('.elementor-element');

		  if (!$children.length) return;

		  // Build the structure
		  $children
		    .addClass('item swiper-slide')
		    .wrapAll('<div class="items-carousel swiper-wrapper" />');

		  $this.find('.swiper-wrapper').wrap('<div class="swiper" />');
		  $this.find('.swiper').wrap('<div class="swiper-container items-carousel-container" />');

		  var $container = $this.find('.swiper-container').first();

		  // Which attributes to keep on the original element
		  var skip = ['class', 'id', 'data-id', 'data-element_type']; // usually keep id on the original to avoid duplicate IDs

		  // ✓ Snapshot attributes first (NamedNodeMap is live)
		  var attrs = jQuery.map($this.get(0).attributes, function (attr) {
		    return { name: attr.name, value: attr.value };
		  });

		  // Move attributes (except skipped) to the inner container
		  jQuery.each(attrs, function (_, attr) {
		    if (jQuery.inArray(attr.name, skip) === -1) {
		      $container.attr(attr.name, attr.value); // set on target
		      $this.removeAttr(attr.name);            // remove from source
		    }
		  });

		  // Now initialize your swiper
		  buildSwiperCarousel($container);

		});
	}

	(function($){

		"use strict";

		$('.post-gallery').each(function(){

			let opt = {
    			'gap-d':1,
    			'gap-lp':1,
    			'gap-tb':1,
    			'gap-mb':1,
    			'gap-mbs':1,
    		};

    		let breakpoints = {
		        1: { slidesPerView: 1, spaceBetween: 1 },
		        360: { slidesPerView: 1, spaceBetween: 1 },
		        768: { slidesPerView: 1, spaceBetween: 1 },
		        1024: { slidesPerView: 1, spaceBetween: 1 },
		        1280: { slidesPerView: 1, spaceBetween: 1 },
		        1600: { slidesPerView: 1, spaceBetween: 1 }
		    };

		    opt['breakpoints'] = breakpoints;

			buildSwiperCarousel($(this),opt);
	    });

	    if ($('.categories-carousel-container').length) {
			buildSwiperCarousel($('.categories-carousel-container'));
	    }

	    if ($('.related-products-container').length) {
	    	$('.related-products-container').each(function(){
	    		$(this).find('product').addClass('swiper-slide');
	    	});
	    }

	    if ($('.history-products-container').length) {
	    	$('.history-products-container').each(function(){
	    		$(this).find('product').addClass('swiper-slide');
	    	});
	    }
	    

	    enableItemsCarousel();

	    $( document ).ajaxComplete(function( event, xhr, settings ) {

            if (settings['type'] != 'POST') {return;}

            var data = settings['data'];

            data = data.split("&");

            var dataObj = [{}];

            for (var i = 0; i < data.length; i++) {
                var property = data[i].split("=");
                dataObj[property[0]] = property[1];
            }

            if (dataObj.hasOwnProperty('action') && dataObj['action'] == 'megamenu_load') {
            	enableItemsCarousel();
            }

        });
	    

		staggerItems($('.items-carousel-container[data-stagger="true"], .item-grid-container[data-stagger="true"]'));

	})(jQuery);

/* Index data
----*/

	var productIndex  = false;
	var categoryIndex = false;
	var templateStructure  = '';
	var categoriesCarousel = '';
	var noProductsFound    = '';
	var banners            = '';

	if (addon && copt.productAjaxFilterIndex == 1) {

	    jQuery.ajax({

			url: copt.ajaxUrl,
	        type: 'POST',
	        data: {
	        	action:'et__fetch_product_index',
	        	nonce:copt.fetchProductIndexNonce,
	        },
	        success: function(response) {

	        	if (response.data) {

	        		response = response.data;

	        		if (response['products']) {
	        			productIndex = response['products'];

	        			window.BIGXON.productIndex = productIndex;

	        			console.log(productIndex);

	        		}
	        		if (response['categories']) {
	        			categoryIndex = response['categories'];

	        			window.BIGXON.categoryIndex = categoryIndex;
		        	}
	        		if (response['template']) {
	        			templateStructure = response['template'];

	        			window.BIGXON.templateStructure = templateStructure;

	        		}
	        		if (response['no_products_found']) {
	        			noProductsFound = response['no_products_found'];

	        			window.BIGXON.noProductsFound = noProductsFound;

	        		}

	        		if (response['categories_carousel']) {
	        			categoriesCarousel = response['categories_carousel'];

	        			window.BIGXON.categoriesCarousel = categoriesCarousel;
	        		}

	        		if (response['banners']) {
	        			banners = response['banners'];

	        			window.BIGXON.banners = banners;

	        		}

	    		}

	        },
	        error: function(xhr, status, error) {
	            console.log(error);
	        }

	    });

    }


/* GSAP config / lightbox
----*/
	
	gsap.config({ nullTargetWarn:false});

	function lightImage(src,overlay){

	    if (
	        src.includes('.jpg') ||
	        src.includes('.jpeg') ||
	        src.includes('.png') ||
	        src.includes('.bmp') ||
	        src.includes('webp') ||
	        src.includes('.gif') ||
	        src.includes('.svg')
	    ) {
	        
	        var img = document.createElement('img');
	        img.src = src;

	        var loaded = false;

	        img.onload = function() {

	            if (loaded) {
	                return;
	            }

	            if (overlay.find('img').length == 0) {
	                overlay.prepend(img);
	            }

	            loaded = true;
	        }
	        
	    } else if (src.includes('youtu') || src.includes('vimeo')) {
	        var iframe = document.createElement('iframe');

	        src = src.replace('watch?v=', 'embed/');
	        src = src.replace('//vimeo.com/', '//player.vimeo.com/video/');
	        src = (src.indexOf("?") == -1) ? src += '?' : src += '&';

	        iframe.src = src+'autoplay=1';
	        iframe.frameborder = '0';
	        iframe.width  = '1280';
	        iframe.height = '720';
	        iframe.allow  = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
	        iframe.allowfullscreen = true;
	        overlay.prepend(iframe);
	    } else if (src.includes('mp4') || src.includes('webm') || src.includes('ogv')) {
	        var video = document.createElement('video');
	        video.src = src;
	        video.autoplay = true;
	        video.controls = true;
	        overlay.prepend(video);
	    }
	}

	function gsapLightbox(element,gallery){

	    var href = element.attr('href');

	    if (
	        href.includes('.jpg') ||
	        href.includes('.jpeg') ||
	        href.includes('.png') ||
	        href.includes('.bmp') ||
	        href.includes('.gif') ||
	        href.includes('.svg') ||
	        href.includes('youtu') ||
	        href.includes('mp4') ||
	        href.includes('webm') ||
	        href.includes('webp') ||
	        href.includes('ogv')
	    ){

	        if (!jQuery('.gsap-lightbox-overlay').length) {


	            var structure = (gallery == true) ? 
	            jQuery('<div class="gsap-lightbox-overlay"><div class="image-wrapper"></div><a href="#" class="gsap-lightbox-controls gsap-lightbox-toggle"></a><a href="#" class="gsap-lightbox-controls gsap-lightbox-nav prev" data-direction="prev"></a><a href="#" class="gsap-lightbox-controls gsap-lightbox-nav next" data-direction="next"></a></div>') :
	            jQuery('<div class="gsap-lightbox-overlay"><div class="image-wrapper"></div><a href="#" class="gsap-lightbox-controls gsap-lightbox-toggle"></a></div>');

	            jQuery('body').append(structure);

	            var overlay = jQuery('.gsap-lightbox-overlay'),
	                wrapper = overlay.find('.image-wrapper'),
	                toggle  = overlay.find('.gsap-lightbox-toggle'),
	                loading = overlay.find('.gsap-lightbox-toggle');

	            if (gallery == true) {

	                var nav         = overlay.find('.gsap-lightbox-nav'),
	                    next        = overlay.find('.next'),
	                    prev        = overlay.find('.prev'),
	                    gallerySet  = [],
	                    count       = 0,
	                    galleryName = element.data('gallery');

	                jQuery('a[data-gallery="'+galleryName+'"]').each(function(){
	                    gallerySet.push(jQuery(this).attr('href'));
	                });

	                if (!gallerySet.length) {
	                    jQuery('a').each(function(){
	                        gallerySet.push(jQuery(this).attr('href'));
	                    });
	                }

	                count = gallerySet.indexOf(element.attr('href'));

	                var max = gallerySet.length;

	                if (max == 1) {
	                    jQuery('.gsap-lightbox-overlay .gsap-lightbox-nav').remove();
	                }
	                
	                nav.on('click',function(e){

	                    overlay.find('img').remove();

	                    e.preventDefault();

	                    count += (jQuery(this).data('direction') == "next") ? 1 : -1;
	                    if (count < 0) {count = max - 1;}
	                    if (count >= max) {count = 0;}

	                    lightImage(gallerySet[count],wrapper);
	                });

	            }

	            setTimeout(function(){
	                overlay.addClass('active');
	                lightImage(element.attr('href'),wrapper);
	            },50);

	            toggle.on('click',function(e){
	                e.preventDefault();
	                overlay.removeClass('active');
	                setTimeout(function(){
	                    overlay.remove();
	                },500);
	            });

	        }

	    }
	}

/* Lazy loading
----*/

	function lazyLoad(container){

		if (container != null) {

			let lazyImages = [].slice.call(container.querySelectorAll("img.lazy"));
			let lazyVideos = [].slice.call(container.querySelectorAll("video.lazy"));

			if ("IntersectionObserver" in window) {

				// Images

					let lazyImageObserver = new IntersectionObserver(function(entries, observer) {
						entries.forEach(function(entry) {
							if (entry.isIntersecting) {
								let lazyImage = entry.target;
								lazyImage.src = lazyImage.dataset.src;

								if (lazyImage.classList.contains('single') && window.innerWidth < 768) {
									let respImg = lazyImage.getAttribute('data-img-resp');
									respImg = respImg.split('|');
									lazyImage.src = respImg[0];
									lazyImage.setAttribute('width',respImg[1]);
									lazyImage.setAttribute('height',respImg[2]);
								}

								lazyImage.onload = function() {
								    lazyImage.classList.remove("lazy");
								    lazyImage.parentElement.classList.add("loaded");
								    lazyImageObserver.unobserve(lazyImage);
									lazyImage.removeAttribute('data-src');

								};
								
							}
						});
					});

					lazyImages.forEach(function(lazyImage) {
						lazyImageObserver.observe(lazyImage);
					});

				// Videos

					let lazyVideoObserver = new IntersectionObserver(function(entries, observer) {
						entries.forEach(function(video) {
							if (video.isIntersecting) {

								for (var source in video.target.children) {
									var videoSource = video.target.children[source];
									if (typeof videoSource.tagName === "string" && videoSource.tagName === "SOURCE") {
										videoSource.src = videoSource.dataset.src;
									}
								}

								video.target.load();
								video.target.classList.remove("lazy");
								lazyVideoObserver.unobserve(video.target);
							}
						});
					});

					lazyVideos.forEach(function(lazyVideo) {
						lazyVideoObserver.observe(lazyVideo);
					});

			} else {

				let active = false;

				const lazyLoad = function() {
					if (active === false) {

					  	active = true;

						setTimeout(function() {

							lazyImages.forEach(function(lazyImage) {

								if ((lazyImage.getBoundingClientRect().top <= window.innerHeight && lazyImage.getBoundingClientRect().bottom >= 0) && getComputedStyle(lazyImage).display !== "none") {

									lazyImage.src = lazyImage.dataset.src;

									lazyImage.onload = function() {
									    lazyImage.classList.remove("lazy");
									    lazyImage.parentElement.classList.add("loaded");
									    lazyImages = lazyImages.filter(function(image) {
											return image !== lazyImage;
										});
									};

									if (lazyImages.length === 0) {
										document.removeEventListener("scroll", lazyLoad);
										window.removeEventListener("resize", lazyLoad);
										window.removeEventListener("orientationchange", lazyLoad);
									}
								}
							});

							lazyVideos.forEach(function(lazyVideo) {

								if ((lazyVideo.getBoundingClientRect().top <= window.innerHeight && lazyVideo.getBoundingClientRect().bottom >= 0) && getComputedStyle(lazyVideo).display !== "none") {

									for (var source in lazyVideo.children) {
										var videoSource = lazyVideo.children[source];
										if (typeof videoSource.tagName === "string" && videoSource.tagName === "SOURCE") {
											videoSource.src = videoSource.dataset.src;
										}
									}

									if (lazyVideos.length === 0) {
										document.removeEventListener("scroll", lazyLoad);
										window.removeEventListener("resize", lazyLoad);
										window.removeEventListener("orientationchange", lazyLoad);
									}
								}
							});

							active = false;

						}, 200);
					}
				};

				document.addEventListener("scroll", lazyLoad);
				window.addEventListener("resize", lazyLoad);
				window.addEventListener("orientationchange", lazyLoad);

			}

		}

	}

	etWhenFullyLoaded(function () {
	  lazyLoad(document);
	}, 6000); // 6s max wait
	document.addEventListener("DOMContentLoaded", function(){
		var video = document.querySelector('.ftr-video');
		if (typeof(video) != 'undefined' && video != null) {video.play();}
		var videos = document.querySelectorAll('.video-container');
		if (typeof(videos) != 'undefined' && videos != null) {
			videos.forEach(function(item){
				item.play();
			})
		}
	});

/* Video trigger
----*/

	function videoTrigger(){
		jQuery('.video-btn').each(function(){

			var $this      = jQuery(this),
			    $container = $this.parents('.post-video'),
			    video      = $container.find('.video-element'),
			    image      = $container.find('.image-container');

			var back  = $this.find('.back');

			$this.hover(
			    function () {
			        gsap.to(back, {
			            duration: 0.8,
			            scale: 1.1,
			            y: 4,
			            transformOrigin: "50% 50%",
			            ease: "elastic.out"
			        });
			    },
			    function () {
			        gsap.to(back, {
			            duration: 0.8,
			            scale: 1,
			            transformOrigin: "50% 50%",
			            ease: "expo.out"
			        });
			    }
			);


			$this.unbind('click').on('click',function(e){
				e.preventDefault();

				if (!video.length) {
				    // Create the iframe as a jQuery object
				    video = jQuery(
				        `<iframe width="1280" height="720" allowfullscreen allow="autoplay" src="${$container.data('src')}" class="iframevideo video-element"></iframe>`
				    );

				    // Append it
				    $container.append(video);
				}

				var embed = video.hasClass('iframevideo') ? true : false;

				if($this.parents('.post').length){
					$this.parents('.post').addClass('playing');
				}

				if ($this.hasClass('video-modal')) {
					gsapLightbox($this,false);
				} else {

					if (jQuery(window).width() < 768) {

						src = $this.parents('.post-video').find('iframe').length ? $this.parents('.post-video').find('iframe').attr('src') : $this.parents('.post-video').find('video source').attr('data-src');
						
						$this.attr('href',src).addClass('video-modal');

						gsapLightbox($this,false);
					} else {
						setTimeout(function(){
							if (embed) {
								var src = video.attr('src');
								src =  (src.indexOf("?") == -1) ? src += '?' : src += '&';

								video.attr('src',src+'autoplay=1');

							} else {
								video.trigger('play');
							}
						},500);
					}
					
				}

				if (!$this.hasClass('video-modal')) {
					image.toggleClass('playing');
					video.toggleClass('playing');
					$this.parents('.post-video').toggleClass('playing');
					$this.parents('.post-video').find('.post-date-side').toggleClass('hidden');
				}

			});

		});
	}

	videoTrigger();

/* Sticky
----*/

	(function($){

		"use strict";

		var $bar = $('body.admin-bar');

	    if ($bar.length) {

		    $(window).on('scroll', function () {
		        if ($(this).scrollTop() > 100) {
		            $bar.addClass('scroll');
		        } else {
		            $bar.removeClass('scroll');
		        }
		    });

	    }

		function stickyWCTabs() {
			if ($(window).outerWidth() >= 1280) {
				let wcTabs = $('.wc-tabs');

				if (wcTabs.length) {
					let wcTabsOffset = wcTabs.offset().top;
					let wcTabsHeight = wcTabs.outerHeight();

					// Create placeholder only once
					let placeholder = $('.sticky-placeholder');
					if (!placeholder.length) {
						placeholder = $('<div class="sticky-placeholder"></div>').insertAfter(wcTabs).hide();
					}

					$(window).off('scroll.stickyWCTabs').on('scroll.stickyWCTabs', function () {
						if ($(window).scrollTop() > wcTabsOffset) {
							if (!$('.et__wc-tabs.sticky').length) {
								wcTabs.addClass('container').wrap('<div class="et__wc-tabs sticky"></div>');


								$('.et__header.desktop.sticky').addClass('disable');

								var productShort = {};

								if ($('.single-product-main img').length) {
									productShort['image'] = $('.single-product-main img.wp-post-image').first().attr('src');
								}
							
								if ($('.single-product-summary-info .product_title').length) {
									productShort['title'] = $('.single-product-summary-info .product_title').text();
								}

								if ($('.savings-wrapper').length) {
									productShort['savings'] = $('.savings-wrapper').html();
								}

								if ($('.single-product-add-to-cart > .price').length) {
									productShort['price'] = $('.single-product-add-to-cart > .price').html();
								}

								if ($('.single-product-add-to-cart button.single_add_to_cart_button').length) {
									productShort['button'] = $('.single-product-add-to-cart button.single_add_to_cart_button').text();
								}

								if (!$('et__wc-tabs').find('.product-short-info').length) {

									let productShortInfo = '<li class="product-short-info">';

										if (productShort.hasOwnProperty('image')) {
											productShortInfo += '<img src="'+productShort['image']+'" />';
										}

										productShortInfo += '<div>';

											if (productShort.hasOwnProperty('title')) {
												productShortInfo += '<h6>'+productShort['title']+'</h6>';
												productShortInfo += '<span class="sep"></span>';
											}

											if (productShort.hasOwnProperty('price')) {
												productShortInfo += '<p class="price">'+productShort['price']+'</p>';
											}

											if (productShort.hasOwnProperty('savings')) {
												productShortInfo += '<p class="savings-wrapper">'+productShort['savings']+'</p>';
											}

										productShortInfo += '</div>';

										if (productShort.hasOwnProperty('button')) {
											productShortInfo += '<button data-target="#single-product-add-to-cart-wrap" class="et__button">'+productShort['button']+'</button>';
										}

									productShortInfo += '</li>';

									wcTabs.append(productShortInfo);
								}

							}
							placeholder.height(wcTabsHeight).show();
						} else {
							if ($('.et__wc-tabs.sticky').length) {
								wcTabs.removeClass('container').unwrap();
								$('.product-short-info').remove();
								$('.et__header.desktop.sticky').removeClass('disable');
							}
							placeholder.hide();
						}
					}).trigger('scroll');
				}
			} else {
				// On smaller screens, remove sticky behavior
				let wcTabs = $('.wc-tabs');
				let placeholder = $('.sticky-placeholder');
				if (placeholder.length) {
					placeholder.hide();
				}
				if (wcTabs.parent('.et__wc-tabs.sticky').length) {
					wcTabs.unwrap();
				}
				$(window).off('scroll.stickyWCTabs');
			}
		}


		stickyWCTabs();
		$(window).on('resize',stickyWCTabs);

		$('body').on('click', '.et__wc-tabs.sticky a, .et__wc-tabs.sticky button', function(e) {
			e.preventDefault();
			let $this = $(this);
			let targetSelector = $(this).attr('href') || $(this).attr('data-target');
			let targetElement = $(targetSelector);

			if (targetElement.length) {
				setTimeout(function(){
					let offsetTop = targetElement.offset().top - $this.parents('.et__wc-tabs').outerHeight();
					$('html, body').stop(true).animate({
						scrollTop: offsetTop
					}, 400, 'linear'); // ← linear easing
				},1);
			}
		});

		var stickyHeaders = [];
		const MIN_SCROLL = 300;
		const TIMEOUT    = window.self !== window.top ? 3000 : 50;

		function updateStickyHeaders() {
			let scrollTop = $(window).scrollTop();

			stickyHeaders.forEach(function (item) {

				const threshold = Math.max(item.offset, MIN_SCROLL);

				if (scrollTop > threshold) {
					item.placeholder.height(item.height).show();
					item.header.addClass('active');
				} else {
					item.placeholder.hide();
					item.header.removeClass('active');
				}
			});
		}

		setTimeout(function(){

			$('.et__header.sticky').each(function () {
				let header = $(this);
				let headerPlaceholder = $('<div class="et__header-placeholder"></div>').hide();
				let headerStickyOffset = header.offset().top;
				let headerHeight = header.outerHeight();

				header.after(headerPlaceholder);

				stickyHeaders.push({
					header: header,
					placeholder: headerPlaceholder,
					offset: headerStickyOffset,
					height: headerHeight
				});
			});

			updateStickyHeaders();

		},TIMEOUT);

		$(window).on('scroll', updateStickyHeaders);

		function stickyProductInfoBuild(info) {
			if ($(window).outerWidth() <= 767) {
				if (!$('.sticky-product-nav').length) {
					let stickyProductNav = '<ul class="sticky-product-nav">';
					info.forEach(function (item) {
						stickyProductNav += '<li data-sticky-target="' + item.target + '">' + item.label + '</li>';
					});
					stickyProductNav += '</ul>';

					$('.title-section').after(stickyProductNav); // ← Corrected from `.next()`
				}
			} else {
				$('.sticky-dashboard').remove(); // ← Corrected selector
			}
		}

		function stickyProductInfoBuild(info) {
			if ($(window).outerWidth() <= 767) {
				if (!$('.sticky-product-nav').length) {
					let stickyNav = '<ul class="sticky-product-nav">';
					info.forEach(function (item, index) {
						let activeClass = index === 0 ? ' class="active"' : '';
						stickyNav += '<li' + activeClass + ' data-sticky-target="' + item.target + '">' + item.label + '</li>';
					});
					stickyNav += '</ul>';
					$('.title-section').after(stickyNav);
				}
			} else {
				$('.sticky-product-nav').remove();
			}
		}

		if ($('body').hasClass('single-product')) {
			let stickyProductInfo = [];

			function addStickySection(selector, label) {
				let $el = $(selector);
				if ($el.length) {
					let id = 'st-item-' + uniqueID();
					$el.attr('data-sticky-id', id);
					stickyProductInfo.push({ target: id, label: label });
				}
			}

			addStickySection('.woocommerce-product-gallery-wrapper', copt.strings.productGallery);
			addStickySection('.loop-products.fbt', copt.strings.productFBT);
			addStickySection('.woocommerce-Tabs-panel--description', copt.strings.productDescription);
			addStickySection('.woocommerce-Tabs-panel--additional_information', copt.strings.productInformation);
			addStickySection('.woocommerce-Tabs-panel--reviews', copt.strings.productReviews);
			addStickySection('.compare-products-single', copt.strings.productCompare);
			addStickySection('.related.products', copt.strings.productRelated);
			addStickySection('.history.products', copt.strings.productViewed);

			if (stickyProductInfo.length) {
				stickyProductInfoBuild(stickyProductInfo);

				let resizeTimeout;
				$(window).on('resize', function () {
					clearTimeout(resizeTimeout);
					resizeTimeout = setTimeout(function () {
						$('.sticky-product-nav').remove();
						stickyProductInfoBuild(stickyProductInfo);
						setupStickyProductNav(); // rebuild sticky offsets after re-render
					}, 150);
				});

				function setupStickyProductNav() {
					let $productInfo = $('.sticky-product-nav');
					if (!$productInfo.length) return;

					let $placeholder = $('<div class="sticky-product-nav-placeholder"></div>').hide();
					$productInfo.after($placeholder);


					let stickyProductNav = {
						productInfo: $productInfo,
						placeholder: $placeholder,
						offset: $productInfo.offset().top,
						height: $productInfo.outerHeight()
					};

					function updateStickyProductInfo() {

						const threshold = Math.max(stickyProductNav.offset, 300);

						let scrollTop = $(window).scrollTop();
						if (scrollTop > threshold) {
							stickyProductNav.placeholder.height(stickyProductNav.height).show();
							stickyProductNav.productInfo.addClass('sticky');

							if ($('.et__header.sticky').length) {
								stickyProductNav.productInfo.css('top',$('.et__header.sticky').outerHeight());
							}

						} else {
							stickyProductNav.placeholder.hide();
							stickyProductNav.productInfo.removeClass('sticky').removeAttr('style');
						}
					}

					$(window).on('scroll', updateStickyProductInfo);

					$('.sticky-product-nav li').each(function () {
						let $this = $(this),
							target = $this.attr('data-sticky-target');

						inView('[data-sticky-id="' + target + '"]', function (isVisible) {
							if (isVisible) {
								$this.addClass('active').siblings().removeClass('active');

								var $parent = $this.parent();
								var scrollAmount = $this.position().left + $parent.scrollLeft() - 12;

								$parent.scrollLeft(scrollAmount);
							}
						}, false,0.5,false);

					});

					$('body').on('click', '.sticky-product-nav li', function () {
						let $this = $(this),
							target = $this.attr('data-sticky-target'),
							$dashboard = $this.closest('.sticky-product-nav'),
							$targetEl = $('[data-sticky-id="' + target + '"]');

						if ($targetEl.length) {

							$this.addClass('active').siblings().removeClass('active');

							// Delay and then double-check layout is stable
							setTimeout(function () {
								requestAnimationFrame(function () {
									let stickyHeaderOffset = $('.et__header.sticky').length ? $('.et__header.sticky').outerHeight() : 0;
									let offsetTop = $targetEl.offset().top - $dashboard.outerHeight() - stickyHeaderOffset;

									if (!$('.sticky-product-nav.sticky').length) {
										offsetTop -= $('.sticky-product-nav').outerHeight();
									}

									$('html, body').stop(true).animate({
										scrollTop: offsetTop
									}, 400, 'linear');
								});
							}, 30); // Slightly longer than 1ms to ensure layout settles
						}
					});


					// Initial check
					updateStickyProductInfo();
				}

				// Run setup after short delay to ensure DOM is updated
				setTimeout(setupStickyProductNav, 50);
			}

			function stickyAddToCart() {
				if ($(window).outerWidth() > 767) {
					$('.single-product-add-to-cart').removeClass('sticky');
					$('.single-product-add-to-cart-placeholder').remove();
					return;
				}

				let $main = $('.single-product-add-to-cart-wrap');
				let $addToCart = $('.single-product-add-to-cart');

				if (!$main.length || !$addToCart.length) return;

				let mainBottom = $main.offset().top + $main.outerHeight();
				let scrollTop = $(window).scrollTop();

				if (scrollTop >= mainBottom) {
					let addToCartHeight = $addToCart.outerHeight();

					if (
						$('.qvw').length ||
						$('.et__cart.active').length ||
						$('.mobile-container.active').length ||
						$('.account-nav.active').length ||
						$('.product-categories-popup.active').length ||
						$('.search-wrapper.active').length ||
						$('.compare-table-wrapper').length
					) {
						return;
					}

					$addToCart.addClass('sticky');

					if (!$addToCart.next('.single-product-add-to-cart-placeholder').length) {
						let $placeholder = $('<div style="height:' + addToCartHeight + 'px" class="single-product-add-to-cart-placeholder"></div>');
						$addToCart.after($placeholder);
					}
				} else {
					$addToCart.removeClass('sticky');
					$('.single-product-add-to-cart-placeholder').remove();
				}
			}

			$(window).on('load', stickyAddToCart);
			$(window).on('scroll resize', stickyAddToCart);



		}


		function stickyBeforeShopLoop() {
		  const $bar = $('.before-shop-loop');
		  if (!$bar.length || !$bar.is(':visible')) return;

		  // Mobile-only (your original logic)
		  if ($(window).outerWidth() >= 768) {
		    $bar.removeClass('sticky').removeAttr('style');
		    $('.before-shop-loop-placeholder').remove();
		    $bar.removeData('origTop origHeight');
		    return;
		  }

		  // Cache original top/height ONCE (stable trigger; doesn't change when sticky)
		  let origTop = $bar.data('origTop');
		  let origHeight = $bar.data('origHeight');
		  if (origTop == null || origHeight == null) {
		    $bar.data('origTop', $bar.offset().top);
		    $bar.data('origHeight', $bar.outerHeight());
		    origTop = $bar.data('origTop');
		    origHeight = $bar.data('origHeight');
		  }

		  const scrollTop = $(window).scrollTop();
		  const isSticky = $bar.hasClass('sticky');

		  // Stick when we pass the original bottom; unstick when we go above original top
		  if (!isSticky && scrollTop >= origTop + origHeight) {
		    // 1) placeholder first to avoid jump
		    if (!$bar.next('.before-shop-loop-placeholder').length) {
		      $('<div class="before-shop-loop-placeholder">')
		        .css('height', origHeight + 'px')
		        .insertAfter($bar);
		    } else {
		      $bar.next('.before-shop-loop-placeholder').css('height', origHeight + 'px');
		    }

		    // 2) (optional) lock width/left to prevent tiny shifts (safe, minimal)
		    const rect = $bar[0].getBoundingClientRect();
		    const pageX = window.pageXOffset || document.documentElement.scrollLeft || 0;

		    $bar.addClass('sticky');
		  } else if (isSticky && scrollTop < origTop) {
		    // Reset when scrolled back above original position
		    $bar.removeClass('sticky').removeAttr('style');
		    $('.before-shop-loop-placeholder').remove();
		  }
		}

		// init & listeners
		$(window).on('load', stickyBeforeShopLoop);
		$(window).on('scroll resize', function () {
		  // On resize, recalc baseline IF not sticky (so we don't measure a fixed element)
		  const $bar = $('.before-shop-loop');
		  if ($bar.length && !$bar.hasClass('sticky')) {
		    $bar.removeData('origTop origHeight');
		  }
		  stickyBeforeShopLoop();
		});

	})(jQuery);

/* Slider parallax
----*/

	(function($){

	  function isDisplayBlock(el) {
	    return window.getComputedStyle(el).display === 'block';
	  }

	  var PARALLAX_DELAY = 1000; // <-- change to 700 / 1200 etc.
	  var readyTimers = {};      // per module timer

	  function setModuleReady($module) {
	    var id = $module.attr('id') || ($module.data('id') ? ('sr7_' + $module.data('id')) : 'sr7_unknown');

	    // disable immediately (during transition)
	    $module.removeClass('parallax-ready');

	    // reset timer
	    if (readyTimers[id]) clearTimeout(readyTimers[id]);

	    // enable after delay
	    readyTimers[id] = setTimeout(function(){
	      $module.addClass('parallax-ready');
	    }, PARALLAX_DELAY);
	  }

	  function resetParallax($scope){
	    $scope.find('.parallax-on-move')
	      .removeClass('moving')
	      .css('transform', 'translate(0px,0px)');
	  }

	  // Run only on desktop
	  function bindParallax(){
	    // initial mark: wait a bit after page load for first render
	    $('sr7-module').each(function(){
	      setModuleReady($(this));
	    });

	    // If SR7 fires module/slide events, re-arm on every slide change (best case)
	    document.addEventListener('sr.slide.afterChange', function(e){
	      if (!e || !e.id) return;
	      var el = document.getElementById(e.id);
	      if (el) {
	        var $module = $(el);
	        setModuleReady($module);
	        resetParallax($module);
	      }
	    });

	    // Fallback: also watch data-current changes (works even if events don’t fire)
	    // Lightweight polling every 300ms
	    var lastCurrent = {};
	    setInterval(function(){
	      $('sr7-module').each(function(){
	        var $m = $(this);
	        var mid = $m.attr('id') || 'sr7_unknown';
	        var cur = String($m.attr('data-current') || '');
	        if (lastCurrent[mid] !== cur) {
	          lastCurrent[mid] = cur;
	          setModuleReady($m);
	          resetParallax($m);
	        }
	      });
	    }, 300);

	    // Your handlers (scoped + guarded)
	    $('body')
	      .on('mousemove', 'sr7-slide', function(e){

	        if ($(window).width() <= 1200) return;
	        if (!isDisplayBlock(this)) return;

	        var $slide = $(this);
	        var $module = $slide.closest('sr7-module');

	        // wait until transition finished + delay passed
	        if (!$module.hasClass('parallax-ready')) return;

	        // IMPORTANT: scope to this slide only (not global!)
	        $slide.find('.parallax-on-move').each(function(){
	          var amountMovedX = (e.pageX * -1 / 40);
	          var amountMovedY = (e.pageY * 1 / 40);

	          $(this)
	            .addClass('moving')
	            .css('transform', 'translate(' + amountMovedX + 'px,' + amountMovedY + 'px)');
	        });

	      })
	      .on('mouseleave', 'sr7-module', function(){

			    var $module = $(this);

			    // reset transform immediately
			    $module.find('.parallax-on-move')
			        .css('transform', 'translate(0px,0px)');

			    // remove "moving" after 300ms
			    setTimeout(function(){
			        $module.find('.parallax-on-move').removeClass('moving');
			    }, 300);

			});
	  }

	  // init
	  $(function(){
	    if ($(window).width() > 1200) {
	      bindParallax();
	    } else {
	      resetParallax($(document));
	    }

	    // If you resize across breakpoint, keep things clean
	    $(window).on('resize', function(){
	      if ($(window).width() <= 1200) {
	        resetParallax($(document));
	        $('sr7-module').removeClass('parallax-ready');
	      } else {
	        $('sr7-module').each(function(){ setModuleReady($(this)); });
	      }
	    });
	  });

	})(jQuery);

/* Dynamic categories
----*/

	(function($){

		"use strict";

		const currentLanguage = currentLang;

		// Single source of truth for path (root = [])
		let catPath = [];

		// ---- Animations
		function animateItemsIn() {
		  const items = $('.et__categories_dynamic').children('li');
		  items.css('will-change', 'transform, opacity');

		  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

		  tl.from(items, {
		    duration: 0.5,
		    y: 24,
		    opacity: 0,
		    stagger: {
		      each: 0.06,
		      from: "start"
		    },
		    autoAlpha: 0,
		    transformPerspective: 600,
		    force3D: true
		  });
		}


		// ---- Back button (shows only if depth > 0)
		function renderBackButton($container) {
		  $container.find('.cat-back-wrapper').remove();

		  if (catPath.length === 0) return; // root -> no back

		  // previous level target (if depth >= 2 it's the slug before the current)
		  const backSlug = (catPath.length >= 2) ? catPath[catPath.length - 2] : '';
		  const slugAttr = backSlug ? `data-slug="${backSlug}"` : '';
		  $container.prepend(
		    `<div class="cat-back-wrapper"><a class="cat-back" ${slugAttr} href="#" title="${copt.strings.back}">${copt.strings.back}</a></div>`
		  );
		}

		// ---- Category grid template
		function productCategoriesGridTemplate(
			categories = false, 
			options = {}
		) {
		  
		  const {
		    lazyPlaceholder = '',
		    imageWidth = null,
		    imageHeight = null,
		  } = options;

		  const escAttr = (v) => String(v ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
		  const escHtml = (v) => String(v ?? '').replace(/</g, '&lt;');

		  let output = ``;

		  if (categories && Array.isArray(categories)) {
		    categories.forEach((category) => {
		      const slug = category.slug || '';
		      const name = category.name || '';
		      const link = category.link || '#';

		      const catClass = ['category', 'item', slug];
		      if (typeof category.children !== 'undefined' && Number(category.children) === 1) {
		        catClass.push('item-has-children');
		      }

		      output += `<li class="${escAttr(catClass.join(' '))}">`;

		      // Keep parent_slug if you still pass it (not required for stack logic)
		      const parentSlugAttr = category.hasOwnProperty('parent_slug')
		        ? `data-parent-slug="${escAttr(category.parent_slug)}"` : '';

		      output += `<a href="${escAttr(link)}" ${parentSlugAttr} data-slug="${escAttr(slug)}" title="${escAttr(name)}">`;

		      if (category.image) {
		        const imgSrc = category.image;
		        const w = imageWidth ? ` width="${escAttr(imageWidth)}"` : '';
		        const h = imageHeight ? ` height="${escAttr(imageHeight)}"` : '';

		        output += `<div class="image-container">`;
		        output += `<img src="${escAttr(imgSrc)}" ${w}${h} alt="${escAttr(name)}" />`;

		        const box = imageWidth || 300;
		        output += `<svg viewBox="0 0 ${escAttr(box)} ${escAttr(box)}"><path d="M0,0H${escAttr(box)}V${escAttr(box)}H0V0Z" /></svg>`;
		        output += `</div>`;
		      }

		      output += `<h3 class="attribute-title">${escHtml(name)}</h3>`;
		      output += `</a>`;
		      output += `</li>`;
		    });
		  }

		  return output;
		}

		// ---- Fetch + render (works with either preloaded categoryIndex or AJAX)
		function fetchProductCategories(currentSlug = false,container) {
		  container.addClass('loading');

		  const renderDone = () => {
		    animateItemsIn();
		    renderBackButton(container);
		  };

		  const renderFromList = (allCats) => {
		    let list = (currentLanguage in categoryIndex) ? allCats[currentLanguage] : allCats['default'];

		    if (currentSlug) {
		      const parent = list.find(cat => cat.slug === currentSlug);
		      if (parent) list = list.filter(cat => cat.parent_id === parent.id);
		      else list = []; // no children found -> empty
		    } else {
		      list = list.filter(cat => cat.parent_id === 0); // root
		    }

		    const html = productCategoriesGridTemplate(list);
		    container.html(html).removeClass('loading');
		    renderDone();
		  };

		  if (typeof categoryIndex !== 'undefined' && categoryIndex) {
		    // Use preloaded index
		    renderFromList(categoryIndex);
		  } else {
		    // Fallback to AJAX
		    $.ajax({
		      url: copt.ajaxUrl,
		      type: 'POST',
		      data: {
		        nonce: copt.dynamicProductCategoriesNonce,
		        category: currentSlug || false,
		        lang: currentLanguage,
		        action: 'et__fetch_product_dynamic_categories_list',
		      },
		      success: function (response) {
		        if (response && response.success) {
		          container
		            .html(response.data.html)
		            .removeClass('loading');

		          if (typeof lazyLoad === 'function') {
		            lazyLoad(container[0]);
		          }
		          renderDone();
		        } else {
		          container.removeClass('loading');
		        }
		      },
		      error: function (xhr, status, error) {
		        console.log(error);
		        container.removeClass('loading');
		      }
		    });
		  }
		}

		/* ---------------- Handlers ---------------- */

		// Go deeper (push slug)
		$('body').on('click', '.et__categories_dynamic .category.item-has-children > a', function(e){
		  e.preventDefault();
		  const slug = $(this).attr('data-slug');
		  if (!slug) return;

		  const container = $(this).parents('.et__categories_dynamic');

		  catPath.push(slug);
		  fetchProductCategories(slug,container);
		});

		// Back (pop one level)
		$('body').on('click', '.et__categories_dynamic a.cat-back', function(e){
		  e.preventDefault();

		  if (catPath.length > 0) catPath.pop(); // go up
		  const newCurrent = catPath.length ? catPath[catPath.length - 1] : false;

		  const container = $(this).parents('.et__categories_dynamic');

		  fetchProductCategories(newCurrent,container);
		});

	})(jQuery);


/* Misc
----*/

	(function($){

		"use strict";

		/* To top
		----*/

			$('.to-top').on('click',function(e){
				e.preventDefault();
				let target = $(this).attr('href');
				$('html, body').animate({
				    scrollTop: $(target).offset().top
				}, 500); // 500 = duration in milliseconds
			});

		/* HBE toggle
		----*/

			function hbeOff(current) {
				setTimeout(function () {
					$('.hbe-toggle').not(current).each(function () {
						if ($(this).hasClass('active')) {
							$(this).removeClass('active');
							$(this).parent().removeClass('active');
							$(this).next('.login-box, .dropdown').removeClass('active');
						}
					});
				}, 10);
			}

			$('body').on('click', '.et__language-switcher.dropdown .language-toggle', function () {
				const $this = $(this);
				$this.toggleClass('active').parent('.et__language-switcher.dropdown').toggleClass('active');
				hbeOff($this);
			});

			$('body').on('click', '.et__login .login-toggle', function () {
				const $this = $(this);
				$this.toggleClass('active').next('.login-box').toggleClass('active');
				hbeOff($this);
			});

			$('.yay-currency-custom-select__trigger').each(function(){
				$(this).addClass('hbe-toggle');
			});

			$('body').on('click', '.yay-currency-custom-select__trigger', function () {
				const $this = $(this);
				hbeOff($this);
			});

		/* Widgets
		----*/

			$('.widget_title').on('click',function(){
				$(this).parent().toggleClass('close');
			});


			$('.widget_calendar').each(function(){

				var $this = $(this);
				var caption = $this.find('caption');

				$this.find('.wp-calendar-nav-prev a').clone().addClass('prev').html('').appendTo(caption);
				$this.find('.wp-calendar-nav-next a').clone().addClass('next').html('').appendTo(caption);
				$this.find('.wp-calendar-nav').remove();

			});

			$('.wp-block-calendar').each(function(){

				var $this = $(this);
				var caption = $this.find('caption');

				$this.find('.wp-calendar-nav a').clone().addClass('prev').html('').appendTo(caption);
				$this.find('.wp-calendar-nav a').clone().addClass('next').html('').appendTo(caption);
				$this.find('.wp-calendar-nav').remove();

			});

		/* Mailchimp
		----*/

			function validateField($input, isValid, message) {
				const $alert = $input.next('.alert');
				if (!isValid) { $alert.text(message).addClass('visible'); }
				else { $alert.removeClass('visible'); }
			}

		    $('.et__mailchimp-form').each(function () {
			  const $form = $(this);

			  $form.off('submit').on('submit', function (event) {
			    event.preventDefault();

			    const $email = $form.find("input[name='email']");
			    const $fname = $form.find("input[name='fname']");
			    const emailVal = ($email.val() || '').trim();
			    const fnameVal = $fname.length ? ($fname.val() || '').trim() : '';
			    const requiredName = $fname.length && $fname.attr('data-required') === "true";

			    let hasError = false;

			    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
			    validateField($email, isValidEmail, 'Invalid or empty email');
			    if (!isValidEmail) hasError = true;

			    if (requiredName) {
			      const isValidFname = fnameVal !== '';
			      validateField($fname, isValidFname, 'Please enter your First name');
			      if (!isValidFname) hasError = true;
			    }

			    if (hasError) return;

			    $form.find(".et__button").attr('disabled',true).addClass('sending');

			    const payload = $form.serialize();

			    $.ajax({
			      type: 'POST',
			      url: copt.ajaxUrl, // admin-ajax.php
			      data: payload,
			      success: function (res) {
			        console.log('Success:', res);
			        $form.find(".et__mailchimp-success").addClass('visible');
			      },
			      error: function (xhr) {
			        console.error('Error:', xhr?.responseText || xhr?.statusText || 'Error');
			        $form.find(".et__mailchimp-error").addClass('visible');
			      },
			      complete: function () {
			        $form.find(".et__button").removeClass('sending').removeAttr('disabled');
			        setTimeout(function () {
			          $form.find(".et__mailchimp-success, .et__mailchimp-error").removeClass('visible');
			          $email.val('');
			          if ($fname.length) $fname.val('');
			        }, 2000);
			      }
			    });
			  });

			  $form.find('input').on('focus', function () {
			    $(this).next('.alert.visible').removeClass('visible');
			  });
			  
			});

		/* Form placeholder
		----*/

			$('.widget_login, .widget_reglog').each(function(){
				var $this = $(this);

				$this.find('label').each(function(){
					var labelText = $(this).text();
					$(this).next('input').attr('placeholder',labelText);
					$(this).remove();
				});

				$this.find('input[type="submit"]').on("click",function(event) {
					var $identity = $this.find('input[type="email"], input[type="text"]').first();
					var $password = $this.find('input[type="password"]').first();
					var identityValue = String($identity.val() || '').trim();
					var passwordValue = String($password.val() || '');

					if (!identityValue || !passwordValue ||
						identityValue == $identity.data('placeholder') ||
						passwordValue == $password.data('placeholder')) {
						event.preventDefault();
					}

				});
			});

		/* et__products
		----*/

			function etBannerHeight($container) {
			    if (!$container || !$container.length || $container.hasClass('list')) return;
			   
			    setTimeout(function () {
			        let $items = $container.find('.item, .post, .et__banner');
			        if (!$items.length) return;

			        // 1) Reset min-height so we can shrink too
			        $items.css('min-height', '');

			        // 2) Find max height
			        let maxHeight = 0;
			        $items.each(function () {
			            let h = jQuery(this).outerHeight(); // or $(this)
			            if (h > maxHeight) maxHeight = h;
			        });

			        // 3) Apply min-height to all
			        if (maxHeight > 0) {
			            $items.css('min-height', maxHeight + 'px');
			        }
			    }, 100);
			}

			function etInitProductsAfterInsert($placeholder, $insertedRoot) {
			  // Your original logic, but safer:
			  let etProducts =
			    $insertedRoot && $insertedRoot.hasClass('et__products') ? $insertedRoot :
			    $placeholder.next('.et__products').length ? $placeholder.next('.et__products') :
			    $placeholder.next('.igc-wrapper').length ? $placeholder.next('.igc-wrapper').children('.et__products') :
			    $placeholder.parent().find('.et__products');

			  if (!etProducts || !etProducts.length) return;

			  if (etProducts.hasClass('items-carousel-container')) {
			    buildSwiperCarousel(etProducts);
			    waitForElement('#'+etProducts.attr('id')+' .swiper-initialized', () => {
			      etBannerHeight(etProducts);
			    });
			  }

			  lazyLoad(etProducts[0]);

			  // Stagger either immediately (when inserted) or on view
			  if (etProducts.attr('data-stagger') === 'true') {
			    inView(etProducts[0], function (isVisible) {
			      if (isVisible) staggerItems(etProducts, true);
			    }, true, 0.1);
			  }
			}

			waitForElement('.et__products .swiper-initialized', () => {
				$('.et__products').each(function(){
					etBannerHeight($(this));
				});
			});

			var onLoadproducts = {};

			$('.et__products_ajax').each(function(){
			  let $this = $(this),
			      load = window.location.hostname.includes('enovathemes.com') ? 'onload' : $this.attr('data-load'),
			      id = $this.attr('id'),
			      configKey = $this.attr('data-config-key');

			  let data = {
			    'nonce': copt.etProductsAjaxNonce,
			    'config_key': configKey,
			    'lang': currentLang,
			    'currency': (typeof copt !== 'undefined' ? copt.activeCurrency : '')
			  };

			  if (load == "onload") {
			    onLoadproducts[id] = configKey;

			  } else {

			    inView(this, function (isVisible) {

			      // prevent double-fire just in case
			      if ($this.data('et-loading')) return;
			      $this.data('et-loading', 1);

			      wpAjaxRetry("et__products_ajax", data, 2, 450)
			        .then(resp => {

			          // If server says success but html empty, retry once more (strong “must show”)
			          if (!resp || !resp.html || !String(resp.html).trim()) {
			            return wpAjaxRetry("et__products_ajax", data, 2, 650);
			          }
			          return resp;
			        })
			        .then(resp => {
			          if (resp && resp.html && String(resp.html).trim()) {

			            const $inserted = jQuery(resp.html);
			            $inserted.insertAfter($this);

			            etInitProductsAfterInsert($this, $inserted);

			          } else {
			            console.warn('Products single: empty html after retries', { id, configKey });
			          }

			          $this.remove(); // NEVER keep loader forever
			        })
			        .catch(error => {
			          console.error("AJAX error (single, after retry):", error);
			          $this.remove();
			        });

			    }, true, 0.1);

			  }
			});


			// BULK (onload) — run only when page fully loaded
			if (onLoadproducts && Object.keys(onLoadproducts).length > 0) {

			  etWhenFullyLoaded(function () {

			    let wpAjaxData = {
			      'nonce': copt.productsAjaxBulkNonce,
			      'configs': JSON.stringify(onLoadproducts),
			      'lang': currentLang,
			      'currency': (typeof copt !== 'undefined' ? copt.activeCurrency : '')
			    };

			    wpAjaxRetry("et__products_ajax_bulk", wpAjaxData, 2, 450)
			      .then(resp => {
			        const output = (resp && resp.output) ? resp.output : {};
			        const errors = (resp && resp.errors) ? resp.errors : {};

			        const ids = Object.keys(onLoadproducts);
			        const fallbackIds = [];

			        ids.forEach((domId) => {
			          const $ph = $('#'+domId);
			          if (!$ph.length) return;

			          const html = output.hasOwnProperty(domId) ? output[domId] : '';

			          if (html && String(html).trim()) {
			            const $inserted = jQuery(html);
			            $inserted.insertAfter($ph);
			            etInitProductsAfterInsert($ph, $inserted);
			            $ph.remove();
			          } else {
			            if (errors[domId]) console.warn('Products bulk missing:', domId, errors[domId]);
			            fallbackIds.push(domId);
			          }
			        });

			        return (async function runFallbackSingles(){
			          for (const domId of fallbackIds) {
			            const $ph = $('#'+domId);
			            if (!$ph.length) continue;

			            const configKey = onLoadproducts[domId];

			            const singleData = {
			              'nonce': copt.etProductsAjaxNonce,
			              'config_key': configKey,
			              'lang': currentLang,
			              'currency': (typeof copt !== 'undefined' ? copt.activeCurrency : '')
			            };

			            try {
			              const r1 = await wpAjaxRetry("et__products_ajax", singleData, 2, 450);
			              const finalResp = (!r1 || !r1.html || !String(r1.html).trim())
			                ? await wpAjaxRetry("et__products_ajax", singleData, 2, 650)
			                : r1;

			              if (finalResp && finalResp.html && String(finalResp.html).trim()) {
			                const $inserted = jQuery(finalResp.html);
			                $inserted.insertAfter($ph);
			                etInitProductsAfterInsert($ph, $inserted);
			              } else {
			                console.warn('Products fallback single still empty:', domId, configKey);
			              }
			            } catch (e) {
			              console.error('Products fallback single error:', domId, e);
			            }

			            $ph.remove();
			          }
			        })();
			      })
			      .catch(error => {
			        console.error("AJAX error (bulk, after retry):", error);

			        const ids = Object.keys(onLoadproducts);
			        (async function fallbackAllSingles(){
			          for (const domId of ids) {
			            const $ph = $('#'+domId);
			            if (!$ph.length) continue;

			            const configKey = onLoadproducts[domId];

			            const singleData = {
			              'nonce': copt.etProductsAjaxNonce,
			              'config_key': configKey,
			              'lang': currentLang,
			              'currency': (typeof copt !== 'undefined' ? copt.activeCurrency : '')
			            };

			            try {
			              const resp = await wpAjaxRetry("et__products_ajax", singleData, 2, 450);
			              if (resp && resp.html && String(resp.html).trim()) {
			                const $inserted = jQuery(resp.html);
			                $inserted.insertAfter($ph);
			                etInitProductsAfterInsert($ph, $inserted);
			              }
			            } catch (e) {
			              console.error('Products bulk-fallback single error:', domId, e);
			            }

			            $ph.remove();
			          }
			        })();
			      });

			  }, 6000); // maxWaitMs
			}



		/* et__posts
		----*/

			function etInitPostsAfterInsert($placeholder, $insertedRoot) {
			  let etPosts =
			    $insertedRoot && $insertedRoot.hasClass('et__posts') ? $insertedRoot :
			    $placeholder.next('.et__posts').length ? $placeholder.next('.et__posts') :
			    $placeholder.parent().find('.et__posts');

			  if (!etPosts || !etPosts.length) return;

			  if (etPosts.hasClass('items-carousel-container')) {

			    let opt = {};

			    if (etPosts.hasClass('grid')) {
			      opt['inc-mobile'] = 0.6;
			    }

			    buildSwiperCarousel(etPosts, opt);

			    waitForElement('#'+etPosts.attr('id')+' .swiper-initialized', () => {
			      etBannerHeight(etPosts);
			    });
			  }

			  lazyLoad(etPosts[0]);
			  videoTrigger();

			  if (etPosts.attr('data-stagger') === 'true') {
			    inView(etPosts[0], function (isVisible) {
			      if (isVisible) staggerItems(etPosts, true);
			    }, true, 0.1);
			  }
			}

			if ($('#loop-posts').find('.banner').length) {
				etBannerHeight($('#loop-posts'));
			}

			waitForElement('.et__posts .swiper-initialized', () => {
				$('.et__posts').each(function(){
					etBannerHeight($(this));
				});
			});

			var onLoadposts = {};

			$('.et__posts_ajax').each(function(){

			  let $this     = $(this),
			      load      = $this.attr('data-load'),
			      id        = $this.attr('id'),
			      configKey = $this.attr('data-config-key');

			  let data = {
			    'nonce': copt.etPostsAjaxNonce,
			    'config_key': configKey,
			    'lang': currentLang
			  };

			  if (load == "onload") {
			    onLoadposts[id] = configKey;

			  } else {

			    inView(this, function () {

			      if ($this.data('et-loading')) return;
			      $this.data('et-loading', 1);

			      wpAjaxRetry("et__posts_ajax", data, 2, 450)
			        .then(resp => {
			          // If success but empty html, retry once more stronger
			          if (!resp || !resp.html || !String(resp.html).trim()) {
			            return wpAjaxRetry("et__posts_ajax", data, 2, 650);
			          }
			          return resp;
			        })
			        .then(resp => {

			          if (resp && resp.html && String(resp.html).trim()) {
			            const $inserted = jQuery(resp.html);
			            $inserted.insertAfter($this);
			            etInitPostsAfterInsert($this, $inserted);
			          } else {
			            console.warn('Posts single: empty html after retries', { id, configKey });
			          }

			          $this.remove();
			        })
			        .catch(error => {
			          console.error("AJAX error (posts single, after retry):", error);
			          $this.remove();
			        });

			    }, true, 0.1);

			  }
			});


			// BULK (onload)
			if (onLoadposts && Object.keys(onLoadposts).length > 0) {

			  let wpAjaxData = {
			    'nonce': copt.postsAjaxBulkNonce,
			    'configs': JSON.stringify(onLoadposts),
			    'lang': currentLang
			  };

			  wpAjaxRetry("et__posts_ajax_bulk", wpAjaxData, 2, 450)
			    .then(resp => {

			      const output = (resp && resp.output) ? resp.output : {};
			      const errors = (resp && resp.errors) ? resp.errors : {};

			      const ids = Object.keys(onLoadposts);
			      const fallbackIds = [];

			      ids.forEach((domId) => {
			        const $ph = $('#'+domId);
			        if (!$ph.length) return;

			        const html = output.hasOwnProperty(domId) ? output[domId] : '';

			        if (html && String(html).trim()) {
			          const $inserted = jQuery(html);
			          $inserted.insertAfter($ph);
			          etInitPostsAfterInsert($ph, $inserted);
			          $ph.remove();
			        } else {
			          if (errors[domId]) console.warn('Posts bulk missing:', domId, errors[domId]);
			          fallbackIds.push(domId);
			        }
			      });

			      return (async function runFallbackSingles(){
			        for (const domId of fallbackIds) {

			          const $ph = $('#'+domId);
			          if (!$ph.length) continue;

			          const configKey = onLoadposts[domId];

			          const singleData = {
			            'nonce': copt.etPostsAjaxNonce,
			            'config_key': configKey,
			            'lang': currentLang
			          };

			          try {
			            const r1 = await wpAjaxRetry("et__posts_ajax", singleData, 2, 450);
			            const finalResp = (!r1 || !r1.html || !String(r1.html).trim())
			              ? await wpAjaxRetry("et__posts_ajax", singleData, 2, 650)
			              : r1;

			            if (finalResp && finalResp.html && String(finalResp.html).trim()) {
			              const $inserted = jQuery(finalResp.html);
			              $inserted.insertAfter($ph);
			              etInitPostsAfterInsert($ph, $inserted);
			            } else {
			              console.warn('Posts fallback single still empty:', domId, configKey);
			            }

			          } catch (e) {
			            console.error('Posts fallback single error:', domId, e);
			          }

			          $ph.remove();
			        }
			      })();

			    })
			    .catch(error => {
			      console.error("AJAX error (posts bulk, after retry):", error);

			      // If bulk totally fails, fallback to singles for ALL
			      const ids = Object.keys(onLoadposts);

			      (async function fallbackAllSingles(){
			        for (const domId of ids) {

			          const $ph = $('#'+domId);
			          if (!$ph.length) continue;

			          const configKey = onLoadposts[domId];

			          const singleData = {
			            'nonce': copt.etPostsAjaxNonce,
			            'config_key': configKey,
			            'lang': currentLang
			          };

			          try {
			            const resp = await wpAjaxRetry("et__posts_ajax", singleData, 2, 450);
			            if (resp && resp.html && String(resp.html).trim()) {
			              const $inserted = jQuery(resp.html);
			              $inserted.insertAfter($ph);
			              etInitPostsAfterInsert($ph, $inserted);
			            }
			          } catch (e) {
			            console.error('Posts bulk-fallback single error:', domId, e);
			          }

			          $ph.remove();
			        }
			      })();
			    });

			}


			let etBannerResizeTimer;
			$(window).on('resize', function(){
				clearTimeout(etBannerResizeTimer);
			    etBannerResizeTimer = setTimeout(function () {
			        jQuery('.et__products, .et__posts').each(function () {
			            etBannerHeight(jQuery(this));
			        });
			    }, 100);
			});

		/* post image
		----*/

			function postImageReplace() {

			    var $images = $('#single-post > .image-container, #single-post > .post-gallery .image-container, #single-post > .post-video .image-container, .full .only-posts .post .image-container > a'),
			        replaceWIDTH  = 600,
			        replaceHEIGHT = 400,
			        isMobile      = $(window).width() <= 767;

			    $images.each(function () {

			        var $wrapper = $(this),
			            $img     = $wrapper.find('img'),
			            $svg     = $wrapper.children('svg'),
			            $path    = $svg.children('path');

			        if (!$img.length) {
			            return; // Nothing to do
			        }

			        $wrapper = $wrapper.attr('href') ? $wrapper.closest('.image-container') : $wrapper;

			        if (isMobile) {
			            // Store original dimensions only once
			            if (!$wrapper.data('original-width') || !$wrapper.data('original-height')) {
			                var originalWIDTH  = parseInt($img.attr('width'), 10)  || ($img[0] && $img[0].naturalWidth)  || replaceWIDTH;
			                var originalHEIGHT = parseInt($img.attr('height'), 10) || ($img[0] && $img[0].naturalHeight) || replaceHEIGHT;

			                $wrapper.data('original-width',  originalWIDTH);
			                $wrapper.data('original-height', originalHEIGHT);
			            }

			            // Set background image
			            var src = ($img.attr('data-src') || $img.attr('src'));
			            if (src) {
			                $wrapper.css('background-image', 'url(' + src + ')');
			            }

			            // Override SVG to placeholder size
			            if ($svg.length) {
			                $svg.attr('viewBox', '0 0 ' + replaceWIDTH + ' ' + replaceHEIGHT);
			            }
			            if ($path.length) {
			                $path.attr('d', 'M0,0H' + replaceWIDTH + 'V' + replaceHEIGHT + 'H0V0Z');
			            }

			            $img.hide();

			        } else {
			            // Restore original dimensions if we have them
			            var originalWIDTH  = $wrapper.data('original-width'),
			                originalHEIGHT = $wrapper.data('original-height');

			            // Remove the background image we added
			            $wrapper.css('background-image', '');

			            if (originalWIDTH && originalHEIGHT) {
			                if ($svg.length) {
			                    $svg.attr('viewBox', '0 0 ' + originalWIDTH + ' ' + originalHEIGHT);
			                }
			                if ($path.length) {
			                    $path.attr('d', 'M0,0H' + originalWIDTH + 'V' + originalHEIGHT + 'H0V0Z');
			                }
			            }

			            $img.show();
			        }
			    });
			}

			postImageReplace();
			$(window).resize(postImageReplace);

		/* sidebar menu
		----*/

			$('.sidebar-menu-container.accordion .menu-item-has-children > a').each(function(){

				let $link = $(this);
				let $linkHref = $link.attr('href');

				if (!$link.attr('href').startsWith('#')) {
					$link.attr('href', '#');
					$link.next('ul').append(
					  $('<li class="view-all menu-item"><a class="mi-link" href="'+$linkHref+'"><span class="txt">'+copt.strings.viewAll+'</span><span class="arrow"></span></a></li>')
					);
				}

				if ($link.attr('href') == "#") {
					$link.on('click',function(e){
						e.preventDefault();
						$link.parent().toggleClass('active');
						$link.next('ul').stop().slideToggle(200);
					});
				} else {
					$link.find('.arrow').on("click", function(e){
						e.preventDefault();
						var $this = $(this);
						$link.next('ul').stop().slideToggle(200);
					});
				}
			});


	})(jQuery);

/* Quick view
----*/

	(function($){

		"use strict";
		
		var quickViewLoading = false;

		// Re-init everything inside a container (modal)
		function initQuickViewUI($root) {

			// A) Variations (core Woo)
			if ($.fn.wc_variation_form) {
			  $root.find('form.variations_form').each(function(){
			    var $f = $(this);
			    $f.wc_variation_form();
			    $f.find('.variations select').trigger('change');
			    $f.trigger('check_variations');
			  });
			}

			// B) Swatches (cover common plugins without hard-coupling)
			$(document).trigger('wvs_loaded');
			$(document).trigger('woo_variation_swatches_init');
			$(document).trigger('thvs_variations_init');

			if ($.fn.WooVariationSwatches) {
			  $root.find('form.variations_form').WooVariationSwatches();
			}

			// C) Gallery (core Woo)
			if ($.fn.wc_product_gallery) {
			  $root.find('.woocommerce-product-gallery').each(function(){
			    var $gal = $(this);
			    // Clear any leftover 3rd-party flags that might block reinit
			    $gal.removeClass('slick-initialized flexslider-initialized swiper-initialized');
			    var opts = (typeof qvopt !== 'undefined') ? qvopt : {};
			    $gal.trigger('wc-product-gallery-before-init', [this, opts]);
			    $gal.wc_product_gallery(opts);
			    $gal.trigger('wc-product-gallery-after-init', [this, opts]);
			  });
			}


		}

		// Open Quick View
		function bindQuickViewOpen() {
			$('body').on('click', '.quick-view-toggle', function(e){
			  e.preventDefault();
			  if (quickViewLoading) return;

			  var $btn = $(this);
			  var product = $btn.attr('data-product');

			  quickViewLoading = true;
			  $btn.addClass('loading');
			  $('body').append('<div class="qv-shadow-loading" />');

			  $.ajax({
			    url: (typeof copt !== 'undefined' ? copt.ajaxUrl : window.ajaxurl),
			    type: 'POST',
			    dataType: 'json',
			    data: {
			      action: 'quick_view',
			      id: product,
			      currency: (typeof copt !== 'undefined' ? copt.activeCurrency : ''),
			      nonce: (typeof copt !== 'undefined' ? copt.quickviewNonce : '')
			    }
			  }).done(function(resp){
			    $btn.removeClass('loading');

			    if (!(resp && resp.success && resp.data && resp.data.html)) {
			      quickViewLoading = false;
			      $('.qv-shadow-loading').remove();
			      return;
			    }

			    // Remove any existing modal
			    $('.qv-shadow').remove();

			    var $html = $(resp.data.html);
			    $('.qv-shadow-loading').remove();
			    $('body').append($html);

			    var $modal = $('.qvw');
			    initQuickViewUI($modal);

			    let additionalInfo = $modal.find('.additional-information').clone();

				// If you want to remove it from the modal afterwards:
				$modal.find('.additional-information').remove();

				// Insert the cloned block into your target:
				$(additionalInfo).insertBefore('.qvw #single-product-add-to-cart-wrap');


			    // Let CSS transition in
			    setTimeout(function(){ $modal.removeClass('loading'); }, 120);

			  }).fail(function(){
			    $btn.removeClass('loading');
			    $('.qv-shadow-loading').remove();
			    console.error('Quick view AJAX failed');
			  }).always(function(){
			    quickViewLoading = false;
			  });
			});
		}

		// Close Quick View
		function bindQuickViewClose() {
			$('body').on('click', '.qvw-close', function(e){
			  e.preventDefault();
			  $('.qv-shadow').remove();
			});

			// Optional: click on overlay background to close (outside content)
			$('body').on('click', '.qv-shadow', function(e){
			  if ($(e.target).is('.qv-shadow')) {
			    $('.qv-shadow').remove();
			  }
			});
		}

		$('body').on('click','.qvw .additional-information > h2',function(){
			$(this).toggleClass('active');
		});

	    bindQuickViewOpen();
	    bindQuickViewClose();

	})(jQuery);

/* Woo
----*/

	(function ($) {
	    'use strict';

	    var et_gallery_autoplay_timers = new WeakMap();
	    var et_gallery_user_paginated  = new WeakMap();

	    function et__start_gallery_pagination_autoplay($gallery) {
	        var gallery_el = $gallery.get(0);

	        if (et_gallery_autoplay_timers.has(gallery_el)) {
	            return;
	        }

	        var timer = setInterval(function () {

	            var $pagination = $gallery.find('.swiper-pagination').first();

	            if (!$pagination.length || !$gallery.is(':hover')) {
	                et__stop_gallery_pagination_autoplay($gallery);
	                return;
	            }

	            var $bullets = $pagination.find('.swiper-pagination-bullet');

	            if (!$bullets.length) {
	                return;
	            }

	            var current_index = $bullets.index(
	                $bullets.filter('.swiper-pagination-bullet-active').first()
	            );

	            var next_index = current_index + 1;

	            if (next_index >= $bullets.length || current_index === -1) {
	                next_index = 0;
	            }

	            $bullets.eq(next_index).trigger('click');

	        }, 250);

	        et_gallery_autoplay_timers.set(gallery_el, timer);
	    }

	    function et__stop_gallery_pagination_autoplay($gallery) {
	        var gallery_el = $gallery.get(0);
	        var timer = et_gallery_autoplay_timers.get(gallery_el);

	        if (timer) {
	            clearInterval(timer);
	            et_gallery_autoplay_timers.delete(gallery_el);
	        }
	    }

	    function et__reset_gallery_to_first($gallery) {
	        var $pagination = $gallery.find('.swiper-pagination').first();

	        if (!$pagination.length) {
	            return;
	        }

	        var $first = $pagination.find('.swiper-pagination-bullet').first();

	        if ($first.length) {
	            $first.trigger('click');
	        }
	    }

	    // START autoplay on hover
	    $(document).on('mouseenter', '.et__product_loop_gallery', function () {
	        var $gallery = $(this);

	        et_gallery_user_paginated.set($gallery.get(0), false);
	        et__start_gallery_pagination_autoplay($gallery);
	    });

	    // Stop autoplay only on real user pagination hover/click
	    $(document).on('click', '.swiper-pagination-bullets .swiper-pagination-bullet', function () {
	        var $gallery    = $(this).closest('.et__product_loop_gallery');
	        var $pagination = $(this).closest('.swiper-pagination');

	        if ($gallery.is(':hover') && $pagination.is(':hover')) {
	            et_gallery_user_paginated.set($gallery.get(0), true);
	            et__stop_gallery_pagination_autoplay($gallery);
	        }
	    });

	    // STOP on leave, RESET only if user did not paginate manually
	    $(document).on('mouseleave', '.et__product_loop_gallery', function () {
	        var $gallery        = $(this);
	        var gallery_el      = $gallery.get(0);
	        var user_paginated  = et_gallery_user_paginated.get(gallery_el) === true;

	        et__stop_gallery_pagination_autoplay($gallery);

	        if (!user_paginated) {
	            et__reset_gallery_to_first($gallery);
	        }

	        et_gallery_user_paginated.delete(gallery_el);
	    });

	})(jQuery);

	(function($){

		"use strict";

		$('.product .button').hover(function(){
			$(this).attr('title',$(this).attr('aria-label'));
		});

		$(document).on('click', '[data-display-type="label"] .woocommerce-widget-layered-nav-list__item', function(e) {

		    // Prevent double trigger if user actually clicks the <a>
		    if ($(e.target).is('a')) {
		        return;
		    }

		    let link = $(this).find('a').first();

		    if (link.length) {
		        link[0].click(); // native click (better than .trigger('click'))
		    }
		});

		/* Layout changer
		-----*/

			function toggleShopLayout(layout,toggle){

				if (!toggle.hasClass('active')) {
					$('#et-content')
					.removeClass('grid list full')
					.addClass(layout)
					toggle.addClass('active').siblings().removeClass('active');

					let cookieName = [];

					if ($('body').data('site-name')) {
						cookieName.push($('body').data('site-name'));
					}

					cookieName.push('shop-layout');

					setCookie(cookieName.join('-'), layout);
				}

			}

			$('body').on('click','.shop-layout-group a',function(e){

				e.preventDefault();

				const toggle = $(this),
					  layout = toggle.data('layout');

				toggleShopLayout(layout,toggle);

			});

		/* Sidebar toggle
		-----*/

			function sidebarToggle() {

				if ($(window).outerWidth() < 1279) {

					if (
						!$('.post-layout.sidebar-active .title-section > .sidebar-toggle').length
						&& $('.sidebar-widget-area').length
					) {
						$('.post-layout.sidebar-active .title-section')
						.prepend('<a href="#" class="sidebar-toggle" title="'+copt.strings.sidebarToggle+'">'+copt.strings.sidebarToggle+'</a>');
					}


					if (
						!$('.before-shop-loop > .sidebar-toggle').length && 
						$('.sidebar-widget-area').length
					) {
						$('.before-shop-loop')
						.prepend('<a href="#" class="sidebar-toggle" title="'+copt.strings.sidebarToggleShop+'">'+copt.strings.sidebarToggleShop+'</a>');
					}

					if (!$('.sidebar-widget-area > .sidebar-toggle.active').length) {
						const title = ($('.sidebar-widget-area').hasClass('shop-widgets')) ? copt.strings.sidebarToggleShop : copt.strings.sidebarToggle;
						$('.sidebar-widget-area')
						.prepend('<a href="#" class="sidebar-toggle active" title="'+title+'"></a>');

						$('<div class="widget-area-shadow" />').insertAfter($('.sidebar-widget-area'));

					}
					
				} else {
					$('.post-layout.sidebar-active .title-section .sidebar-toggle').remove();
					$('.before-shop-loop .sidebar-toggle').remove();
					$('.sidebar-widget-area .sidebar-toggle').remove();
					$('.sidebar-widget-area').next('.widget-area-shadow').remove();
				}
			}

			sidebarToggle();

			$(window).on('resize',function(){
				sidebarToggle();
			});

			$('body').on('click','.sidebar-toggle',function(e){
				e.preventDefault();
				$('.sidebar-widget-area').toggleClass('active');
				$('.sticky-dashboard').toggleClass('off');
				$('.before-shop-loop.sticky').toggleClass('off');
			});

			$('body').on('click','.widget-area-shadow',function(){
				$('.sidebar-widget-area').removeClass('active');
				$('.sticky-dashboard').toggleClass('off');
				$('.before-shop-loop.sticky').toggleClass('off');
			});

			$('body').on('click','.found-total',function(){
				$('.sidebar-widget-area').removeClass('active');
				$('.sticky-dashboard').removeClass('off');
				$('.before-shop-loop.sticky').removeClass('off');

				$('html, body').animate({
				    scrollTop: $('.before-shop-loop').offset().top
				}, 500); // 500 = duration in milliseconds

			});
		
		/* Product +-
		-----*/

			$('body').on('click','.product .input-group input[type="button"]',function(e){
				let val = parseInt($(this).parents('.product').find('.qty').val());
	                val += $(this).hasClass('button-minus') ? - 1 : + 1;
	            
	            let max = parseFloat($(this).parents('.product').find('.qty').attr('max'));

	                if (val == 0 || val < 0) {val = 1} else
	                if (val > max) {val = 1}

	                if (!isNaN(val)) {
	                    $(this).parents('.product').find('.qty').val(val);
	                    $(this).parents('.product').find('.add_to_cart_button').attr('data-quantity',val);
	                }
			});

			$('body').on('click', '.shop_table .quantity', function (e) {
				    
				    let $this = $(this);
				    let offset = $this.offset();
				    let relativeX = e.pageX - offset.left; // Get relative X position inside .quantity
				    let width = $this.width();
				    let $qtyInput = $this.children('.qty');
				    let currentVal = parseInt($qtyInput.val()) || 1;

				    if (relativeX <= 48) {
				        if (currentVal > 1) {
				            $qtyInput.val(currentVal - 1);
				        }
				    } else if (relativeX >= width - 48) {
				        $qtyInput.val(currentVal + 1);
				    }

				});

			function toggleDisable(){
            	if($( 'form.cart' ).find( '.qty' ).val() > 1){$('button.minus').removeAttr('disabled');}
            	else if($( 'form.cart' ).find( '.qty' ).val() <= 1){$('button.minus').attr('disabled','disabled');}
            }

            function ProductCount(){
	            $('form.cart').on( 'click', 'button.plus, button.minus', function() {
	 
		            // Get current quantity values
		            var qty  = $( this ).closest( 'form.cart' ).find( '.qty' );
		            var val  = parseFloat(qty.val());
		            var max  = parseFloat(qty.attr( 'max' ));
		            var min  = parseFloat(qty.attr( 'min' ));
		 			var step = parseFloat(qty.attr( 'step' ));
		            // Change the value if plus or minus
		            if ( $( this ).is( '.plus' ) ) {
		               if ( max && ( max <= val ) ) {
		                  qty.val( max );
		               } 
		            else {
		               qty.val( val + step );
		                 }
		            } 
		            else {
		               if ( min && ( min >= val ) ) {
		                  qty.val( min );
		               } 
		               else if ( val > 1 ) {
		                  qty.val( val - step );
		               }
		            }
		            toggleDisable();
		        });

		        $( 'form.cart' ).find( '.qty' ).on('change',function(){
		            toggleDisable();
		        });
	        }

		/* Wishlist
		-----*/

	        function updateWihslistCounter(wishlist){
	        	if ($('.wishlist-counter').length) {
	        		$('.wishlist-counter').html(wishlist.length).addClass('active');
	        	} else {
	        		$('.wishlist-counter').html('').removeClass('active');
	        	}
	        }

	        function onWishlistComplete(toggle,wishlist){
	        	
	        	toggle
	        	.removeClass('loading')
	        	.attr('title',copt.strings.wishlistIn)
	        	.addClass('active');

	        	updateWihslistCounter(wishlist);
	        }

	        function updateUserWishlist(user_id,wishlist){
	        	return new Promise((resolve, reject) => {
			        $.ajax({
			            type: 'POST',
			            url: copt.ajaxUrl,
			            data: {
			                action: 'et__update_user_wishlist',
			                user_id: user_id,
			                nonce: copt.updateUserWishlistNonce,
			                wishlist: wishlist.join(',')
			            },
			            success: function(response) {
			                resolve(response); // Resolve the promise with the response
			            },
			            error: function(error) {
			                reject(error); // Reject the promise with the error
			            }
			        });
			    });
	        }

	        function etWishlist(wishlist,toggle=false){

	        	if (addon == false) {
	        		return
	        	}

	        	$.ajax({
		            type: 'POST',
		            url: copt.ajaxUrl,
		            data: {
		                'action' : 'et__fetch_user_data',
		                'nonce'  : copt.fetchUserDataNonce,
		                'dataType': 'json'
		            },
		            success:function(data) {

		                let userData = data['data'];

		                if (
		                	typeof(userData['wishlist']) != 'undefined' &&
		                	userData['wishlist'] != null &&
		                	userData['wishlist'] != "" &&
		                	!$('.wishlist-table').length
		                ) {

		                    var userWishlist = userData['wishlist'].split(',');

		                    if (wishlist.length) {

		                        wishlist = wishlist.concat(userWishlist);
		                        wishlist = arrayUnique(wishlist);

		                        updateUserWishlist(userData['user_id'],wishlist)
		                        .then(function(responce) {
		                        	if (toggle) {
		                        		onWishlistComplete(toggle,wishlist);
		                        	} else {
		                        		wishlist.forEach(function(value, index) {
		                        			if ($('.wishlist-toggle[data-product="'+value+'"]').length) {
												
												$('.wishlist-toggle[data-product="'+value+'"]')
												.attr('title',copt.strings.wishlistIn);

												if (!$('.wishlist-toggle[data-product="'+value+'"]').hasClass('remove')) {
									        		$('.wishlist-toggle[data-product="'+value+'"]').addClass('active');
												}

							        		}
										});
	                        			updateWihslistCounter(wishlist);
		                        	}
		                        	// removeCookie(copt.shopName+'-wishlist');
			                		setCookie(copt.shopName+'-wishlist', wishlist);

		                        });

		                    } else {
		                        wishlist = userWishlist;
		                        if (toggle) {
		                        		onWishlistComplete(toggle,wishlist);
	                        	} else {
	                        		wishlist.forEach(function(value, index) {
	                        			if ($('.wishlist-toggle[data-product="'+value+'"]').length) {
											$('.wishlist-toggle[data-product="'+value+'"]')
											.attr('title',copt.strings.wishlistIn);

											if (!$('.wishlist-toggle[data-product="'+value+'"]').hasClass('remove')) {
								        		$('.wishlist-toggle[data-product="'+value+'"]').addClass('active');
											}
						        		}
									});
						        	updateWihslistCounter(wishlist);
	                        	}
			                	setCookie(copt.shopName+'-wishlist', wishlist);
		                        // removeCookie(copt.shopName+'-wishlist');
		                    }


		                } else if(wishlist.length) {
		                    updateUserWishlist(userData['user_id'],wishlist)
		                    .then(function(responce) {
	                        	if (toggle) {
	                        		onWishlistComplete(toggle,wishlist);
	                        	} else {
	                        		wishlist.forEach(function(value, index) {
	                        			if ($('.wishlist-toggle[data-product="'+value+'"]').length) {
											$('.wishlist-toggle[data-product="'+value+'"]')
											.attr('title',copt.strings.wishlistIn);

											if (!$('.wishlist-toggle[data-product="'+value+'"]').hasClass('remove')) {
								        		$('.wishlist-toggle[data-product="'+value+'"]').addClass('active');
											}
						        		}
									});
						        	updateWihslistCounter(wishlist);
	                        	}
	                        	setCookie(copt.shopName+'-wishlist', wishlist);
								// removeCookie(copt.shopName+'-wishlist');
	                        });
		                }
		            },
		            error: function(){
		                console.log('No user data returned');
		            }
		        });
	        }

	        function etRemoveWishlist(product_id){

	        	$.ajax({
		            type: 'POST',
		            url: copt.ajaxUrl,
		            data: {
		                'action' : 'et__fetch_user_data',
		                'product_id':product_id,
		                'nonce'  : copt.fetchUserDataNonce,
		                'dataType': 'json'
		            },
		            success:function(response) {

		                let userData = response['data'];

		                if (
		                	typeof(userData['wishlist']) != 'undefined' &&
		                	userData['wishlist'] != null &&
		                	userData['wishlist'] != ""
		                ) {

		                    var wishlist = userData['wishlist'].split(',');

		                	wishlist = wishlist.filter(item => item !== product_id);

		                    updateUserWishlist(userData['user_id'],wishlist)
	                        .then(function(responce) {
	                        	updateWihslistCounter(wishlist);
	                        	$('.wishlist-table .post-'+product_id).remove();
	                        	$('.wishlist-table').removeClass('loading');
	                        	if (!wishlist.length) {
		                    		$('.wishlist-table').html(copt.strings.noProductsFound);
	                        	}

			                	setCookie(copt.shopName+'-wishlist', wishlist);


	                        });


		                } else if($('.wishlist-table').length) {

		                    updateUserWishlist(userData['user_id'],[]);

		                    $('.wishlist-table').html(copt.strings.noProductsFound).removeClass('loading');

		                    removeCookie(copt.shopName+'-wishlist');

		                }
		            },
		            error: function(){
		                console.log('No user data returned');
		            }
		        });
	        }

	        var loggedIn = ($('body').hasClass('logged-in')) ? true : false,
				wishlist = getCookie(copt.shopName+'-wishlist') ? getCookie(copt.shopName+'-wishlist').split(',') : [];

			if (!loggedIn && wishlist.length) {

				wishlist.forEach(function(value, index) {
					$('.wishlist-toggle[data-product="'+value+'"]')
					.attr('title',copt.strings.wishlistIn)
	        		.addClass('active');
				});

				updateWihslistCounter(wishlist.length);

			} else if(loggedIn) {

				etWishlist(wishlist);

				if ($('.wishlist-table').length) {

					$('.wishlist-table .product .wishlist-toggle').each(function(){
						$(this)
						.attr('title',copt.strings.wishlistRemove)
						.removeClass('active')
						.addClass('remove');
					});

				}

			}

	        $('body').on('click','.wishlist-toggle',function(e){

	        	let toggle = $(this);

	        	if (
	        		!toggle.hasClass('active') && 
	        		!toggle.hasClass('loading')
	        		) {

	        		e.preventDefault();

	        		if (toggle.hasClass('remove')) {

	        			if (confirm(copt.strings.wishlistRemove)) {

	        				$('.wishlist-table').addClass('loading');

	        				etRemoveWishlist(toggle.attr('data-product'));
	        			}

	        		} else {

	        			toggle.addClass('loading');

		        		wishlist.push(toggle.attr('data-product'));
	            		wishlist = arrayUnique(wishlist);

	            		if (loggedIn) {
	            			etWishlist(wishlist,toggle);
			            } else {
			                setCookie(copt.shopName+'-wishlist', wishlist);
			                onWishlistComplete(toggle,wishlist);
			            }

		            }

	        	}

	        });

		/* Compare
		-----*/

	        function updateCompareCounter(compare){
	        	if ($('.compare-counter').length) {
	        		if (compare.length) {
	        			$('.compare-counter').html(compare.length).addClass('active');
	        		} else {
	        			$('.compare-counter').html('').removeClass('active');
	        		}
	        	}
	        }

		    function renderCompareTable(products){

		    	return new Promise((resolve, reject) => {
			        $.ajax({
			            type: 'POST',
			            url: copt.ajaxUrl,
			            data: {
			                'action' : 'et__fetch_compare_products',
			                'dataType': 'json',
			                'products':products
			            },
			            success: function(response) {
			                resolve(response); // Resolve the promise with the response
			            },
			            error: function(error) {
			                reject(error); // Reject the promise with the error
			            }
			        });
			    });

	        }

	        let isDragging = false;
			let startX, scrollLeft;
			let scrollStep = 4;

			function removeCompareTableScrollAnimation(){
				setTimeout(function(){
					$('.cbt-wrapper').removeClass('scroll');
				},1500);
			}

			function calculateMaxScroll(wrapper) {
			    return wrapper.offsetWidth / scrollStep;  // Calculate each step to be 1/5th of the wrapper width
			}

			function handleMouseDown(e, wrapper) {
			    isDragging = true;
			    startX = e.pageX - wrapper.offsetLeft; // Mouse starting X position
			    scrollLeft = wrapper.scrollLeft; // Current scroll position
			    e.preventDefault(); // Prevent text selection
			}

			function handleMouseMove(e, wrapper) {

				wrapper.classList.add("active");

			    if (!isDragging) return; // Stop if not dragging
			    const x = e.pageX - wrapper.offsetLeft; // Current mouse position
			    const walk = x - startX; // Movement distance

			    // Calculate the new scroll position in increments of 1/5th of wrapper width
			    const increment = calculateMaxScroll(wrapper);
			    let newScrollLeft = scrollLeft - walk;

			    // Round the new scroll position to the nearest increment of 1/5th of the wrapper width
			    newScrollLeft = Math.round(newScrollLeft / increment) * increment;

			    // Apply the new scroll position
			    wrapper.scrollLeft = newScrollLeft;
			}

			function handleMouseUp(e, wrapper) {
				wrapper.classList.remove("active");
			    isDragging = false;
			}

			function compareScroll(wrapper) {


			    if ($(window).outerWidth() < 1280 || !wrapper.classList.contains('max')) {
			        return; // Disable scrolling for screen width < 1280
			    }

			    // Event Listeners
			    wrapper.addEventListener('mousedown', (e) => handleMouseDown(e, wrapper));
			    wrapper.addEventListener('mousemove', (e) => handleMouseMove(e, wrapper));
			    wrapper.addEventListener('mouseup', (e) => handleMouseUp(e, wrapper));
			    wrapper.addEventListener('mouseleave', (e) => handleMouseUp(e, wrapper));
			}

			function compareFreezeTopRow(wrapper) {
			    wrapper.addEventListener("scroll", () => {

			        const svgContainers = wrapper.querySelectorAll('svg.image-container');
			        const imageContainers = wrapper.querySelectorAll('.image-container');

			        if (wrapper.scrollTop === 0) {

			            wrapper.classList.remove('active-freeze');

			            gsap.to(imageContainers, {
			                duration: 0.2,
			                height: 'auto',
			                ease: 'power3.out',
			            });

			            // Hide SVGs
			            svgContainers.forEach(svg => svg.classList.remove('hidden'));

			        } else {

			            wrapper.classList.add('active-freeze');

			            // Show SVGs
			            svgContainers.forEach(svg => svg.classList.add('hidden'));

			            gsap.to(imageContainers, {
			                duration: 0.2,
			                height: '0',
			                ease: 'power3.out',
			            });
			            
			        }
			    });
			}



			function responsiveCompareTable(single = false) {
			    const container = single ? '.compare-products-single' : '.compare-table-wrapper';
			    const columnModal = parseInt($(`${container} .compare-table`).attr('data-length'));
			    const cbtWrapper = $(`${container} .cbt-wrapper`);
			    const compareTable = $(`${container} .compare-table`);

			    const windowWidth = $(window).outerWidth();

			    let colNoScroll;

			    if (windowWidth < 768) {
			        colNoScroll = 2;
			    } else if (windowWidth < 1024) {
			        colNoScroll = 3;
			    } else if (windowWidth < 1280 && single) {
			        colNoScroll = 4;
			    } else if (windowWidth < 1600 && single) {
			        colNoScroll = 5;
			    } else {
			        colNoScroll = single ? 6 : 4;
			    }

			    if (columnModal > colNoScroll) {
			    	cbtWrapper.addClass('max scroll');
			        compareTable.css('width', `${(columnModal * 100) / colNoScroll}%`);
			        removeCompareTableScrollAnimation();
			    } else {
			        cbtWrapper.removeClass('max scroll');
			        compareTable.removeAttr('style');
			    }
			}


		    function toggleCompareRows(wrapper) {
		        wrapper.find('tr:not(.freeze)').each(function() {
		            var $row = $(this);
		            var tds = $row.find('td');
		            var firstContent = (
		            	tds.first().find('img').length ?
		            	tds.first().find('img').attr('alt').trim() : 
		            	tds.first().find('.color').length ? 
		            	tds.first().find('.color').attr('title').trim() :
		            	tds.first().text().trim()
		            ); // Get the content of the first td

		            // Check if all td contents in this row are the same
		            var allSame = true;
		            tds.each(function() {

		            	let $this = $(this);
		            	let compare = (
		            		$this.find('img').length ? 
		            		$this.find('img').attr('alt').trim() : 
		            		$this.find('.color').length ? 
		            		$this.find('.color').attr('title').trim() : 
		            		$this.text().trim()
		            	);

		                if (compare !== firstContent) {

		                    allSame = false;
		                    return false; // Exit loop early if contents are not the same
		                }
		            });

		            if (allSame) {
		                // Hide this row if contents are all the same
		                $row.hide();
		            } else {
		                // Highlight the row and ensure it is visible
		                $row.addClass('highlight').show();
		            }
		        });
		    }

		    function etCompare(compare){
		    	if (!$('.compare-table-wrapper').length) {
		        	$('body').append('<div class="compare-table-wrapper loading" />');
	        		renderCompareTable(compare)
	        		.then(function(response) {

	        			if (response == 0) {
	        				$('.compare-table-wrapper').remove();
	        				return;
	        			}

	        			let data = JSON.parse(response);

	        			if (
	        				$('.compare-table-wrapper').length &&
	        				typeof(data['html']) != "undefined"
	        			) {
		            		$('.compare-table-wrapper')
		            		.removeClass('loading')
		            		.html(data['html'])
		            		.prepend('<div class="compare-table-remove" />');

		            		// console.log(data['dev']);

		            		responsiveCompareTable();
		            		compareScroll($('.compare-table-wrapper .cbt-wrapper')[0]);
		            		compareFreezeTopRow($('.compare-table-wrapper .cbt-wrapper')[0]);

	                		// removeCompareTableScrollAnimation();

		            		updateCompareCounter(compare);

		            		lazyLoad(document.querySelector('.compare-table-wrapper'));

		            	}
	        		});
		        }
		    }

			var compare = getCookie(copt.shopName+'-compare') ? getCookie(copt.shopName+'-compare').split(',') : [];

			$(window).on('resize',function(){
				if (document.querySelector('.cbt-wrapper') != null) {
					compareScroll(document.querySelector('.cbt-wrapper'));
				}
				responsiveCompareTable();
				responsiveCompareTable(true);
			});

			$('body').on('click','.compare-toggle',function(e){

	        	e.preventDefault();

				let toggle = $(this);

				if (toggle.hasClass('et__compare-toggle')) {
					if (compare.length) {
						etCompare(compare);
					} else {
		        		alert(copt.strings.compareNone);
					}

					return
				}

				toggle
	        	.attr('title',copt.strings.compareIn)
	        	.addClass('active');

				compare.push(toggle.attr('data-product'));

		        compare = arrayUnique(compare);

		        setCookie(copt.shopName+'-compare', compare);

		        if (compare.length == 1) {
		        	alert(copt.strings.compareSingle);
			       updateCompareCounter(compare);
		        } else if(compare.length > 1) {
			       etCompare(compare);
		        }

			});

			$('body').on('click','.compare-toggle-remove',function(e){
	        	e.preventDefault();

				if (confirm(copt.strings.compareRemove)) {
					let productID = $(this).attr('data-product');
					compare = compare.filter(item => item !== productID);
		        	setCookie(copt.shopName+'-compare', compare);

		        	$('.compare-toggle.active[data-product="'+productID+'"]')
		        	.removeClass('active')
    				.attr('title',copt.strings.compare);

    				$(this).parents('.compare-table-wrapper').remove();

    				if (compare.length) {
    					etCompare(compare);
    				}

    			}
			});

			$('body').on('click','.compare-toggle-clear',function(e){
				e.preventDefault();
				if (confirm(copt.strings.compareClear)) {
    				$(this).parents('.compare-table-wrapper').remove();

    				$('.compare-toggle').each(function(){
    					$(this)
    					.removeClass('active')
    					.attr('title',copt.strings.compare);
    				});

    				compare = [];
    				setCookie(copt.shopName+'-compare', compare);
    				updateCompareCounter(compare)
    			}
			});

			$('body').on('click','.compare-table-remove',function(e){
    			$(this).parent('.compare-table-wrapper').remove();
			});

			$('body').on('click','.compare-toggle-difference', function(e) {

				e.preventDefault();

				$(this).toggleClass('active');

				if ($(this).hasClass('active')) {
		        	toggleCompareRows($('.cbt-wrapper table'));
				} else {
					$('.cbt-wrapper table').find('tr').show().removeClass('highlight');
				}
		    });

	

		    if ($('.compare-products-single').length) {

		    	responsiveCompareTable($('.compare-products-single'));
        		compareScroll($('.compare-products-single .cbt-wrapper')[0]);
        		compareFreezeTopRow($('.compare-products-single .cbt-wrapper')[0]);

		    }
		   
		/* Cart
		-----*/

			$(document.body).on('wc_fragments_loaded wc_fragments_refreshed', handleCartFragmentsEvent);

			$(document.body).on('added_to_cart', function(){
				if ($('body').hasClass('woocommerce-cart')) {return;}
			    $('.et__cart').addClass('active');
			    toggleStickyDashboardOnCartToggle();
			});

			$(window).resize(adjustCartListHeight);

			$('body').on('click','.et__cart-toggle',function(e){
				e.preventDefault();
				if(
					$('body').hasClass('woocommerce-cart') || 
					$('body').hasClass('woocommerce-checkout')
				) {
					return;
				}
				$('.et__cart').toggleClass('active');
				toggleStickyDashboardOnCartToggle();
			});

			$('body').on('click','.et__cart-toggle-remove',function(e){
				e.preventDefault();
				$('.et__cart').removeClass('active');
				toggleStickyDashboardOnCartToggle();
			});

			$('body').on('click','.et__cart-shadow',function(){
				$('.et__cart').removeClass('active');
				toggleStickyDashboardOnCartToggle();
			});

			$('body').on('click', '.et__cart .product_list_widget li .qtn .inc', function () {

				const $btn       = $(this);
				const $qtn       = $btn.closest('.qtn');
				const $val       = $qtn.find('.val');
				const $cartItem  = $btn.closest('li');

				const prevQuantity = parseInt($val.text(), 10) || 1;
				let quantity       = prevQuantity + ($btn.hasClass('plus') ? 1 : -1);

				if (quantity < 1) quantity = 1;

				$val.text(quantity);

				// Get cart item key from data attribute
				const cartItemKey = $cartItem.find('.remove').data('cart_item_key');

				// If no key OR quantity didn't actually change, bail
				if (!cartItemKey || quantity === prevQuantity) {
					return;
				}

				$('.et__cart').addClass('loading');

				
				etAjaxRetryBadNonce({
				  type: 'POST',
				  url: copt.wc_cart_params.ajax_url,
				  dataType: 'json',
				  data: {
				    nonce: copt.updateCartItemQuantityNonce,
				    action: 'woocommerce_update_cart_item_quantity',
				    cart_item_key: cartItemKey,
				    quantity: quantity,
				    security: copt.wc_cart_params.nonce,
				    offset: $('.et__cart .woocommerce-mini-cart').attr('style')
				  },
				  success: function (response) {
				    if (response && response.success && response.data && response.data.cart_list_html) {

				      $('.et__cart ul.woocommerce-mini-cart')
				        .replaceWith(response.data.cart_list_html);

				      if (response.data.cart_subtotal) {
				        $('.et__cart .woocommerce-mini-cart__total .amount')
				          .replaceWith(response.data.cart_subtotal);
				      }

				      if (response.data.cart_count) {
				        $('.cart-contents').html(response.data.cart_count);
				      }

				      extendCartItemHTML();
				      $('.et__cart').removeClass('loading');
				    }
				  },
				  error: function (err) {
				    console.error('Cart update failed:', err);
				  }
				}, 'updateCartItemQuantityNonce');


			});

			$('body').on('click','.qvw .single_add_to_cart_button',function(e){

		    	e.preventDefault();

		    	let $this = $(this);
			    let $form = $this.parents('.product').find('.variations_form');

			    $this.parents('.product').addClass('loading');

			    let product_id = null;
			    let quantity = 1;
			    let variation_id = null;
			    let variations = {};

			    if ($this.parents('.product').hasClass('product-type-simple')) {
			        product_id = $this.val();
			        quantity = $this.prev('.quantity').children('input').val() || 1;
			    } else if ($this.parents('.product').hasClass('product-type-variable')) {
			        let formData = $form.serializeArray();

			        formData.forEach(field => {
			            if (field.name.startsWith('attribute_')) {
			                variations[field.name] = field.value;
			            }
			        });

			        product_id = parseInt($form.find('input[name="product_id"]').val());
			        quantity = parseInt($form.find('input.qty').val()) || 1;

			        let variationData = $form.data('product_variations');
			        let match = variationData.find(v => {
			            let found = true;
			            for (let attr in v.attributes) {
			                if (v.attributes[attr] !== variations[attr]) {
			                    found = false;
			                    break;
			                }
			            }
			            return found;
			        });

			        if (match) {
					    variation_id = match.variation_id;
					} else {
					    let variationData = $form.data('product_variations');
					    if (variationData && variationData.length > 0) {
					        variation_id = variationData[0].variation_id;

					        // Also auto-fill variations object
					        variations = variationData[0].attributes;
					    }
					}
			    }

			    // Now product_id, variation_id, variations, quantity are ready!
			    etAjaxRetryBadNonce({
				  type: 'POST',
				  url: copt.ajaxUrl,
				  dataType: 'json',
				  data: {
				    nonce: copt.updateCartNonce,
				    action: 'et__update_cart',
				    product_id: product_id,
				    variation_id: variation_id,
				    variations: variations,
				    quantity: quantity
				  },
				  success: function (response) {

				    if (response) {

				      response = response.data;

				      if (response && response['cart_count']) {
				        if ($('.cart-contents').length) {
				          $('.cart-contents').html(response['cart_count']);
				        }
				      }

				      $this.parents('.product').removeClass('loading');
				      $this.parents('.qvw').find('.qvw-close').trigger('click');

				      if (response && response['cart']) {
				        $('.widget_shopping_cart_content').html(response['cart']);
				        handleCartFragmentsEvent();
				        $('.et__cart').addClass('active');
				        toggleStickyDashboardOnCartToggle();
				      }

				    }
				  }
				}, 'updateCartNonce');


		    });

			$('body').on('click','.wc-block-cart-item__remove-link',function(e){
				e.preventDefault();
			});

			function stickyCartSummary($cartOrderSummary) {
			    if (!$cartOrderSummary.length) return;

			    let offsetTop, originalWidth, setY, $placeholder;
			    let initialized = false;
			    let $parent = $('.wc-block-components-sidebar');

			    function enableSticky() {
			        if (initialized) return;

			        offsetTop = $cartOrderSummary.offset().top;
			        originalWidth = $cartOrderSummary.outerWidth();
			        setY = gsap.quickSetter($cartOrderSummary[0], "y", "px");


			        // Create placeholder
			        $placeholder = $('<div class="sticky-wc-block-cart__sidebar-placeholder" style="height:'+$cartOrderSummary.outerHeight()+'px"></div>')
			        .insertAfter($cartOrderSummary);

			        $(window).on('scroll.stickyCartSummary', function () {
			            const scrollTop = $(window).scrollTop() + ($('.et__header.sticky.desktop.active').is(":visible") ? $('.et__header.desktop.sticky.active').outerHeight() : 0) + 72; 
			            const parentTop = $parent.offset().top;
			            const parentBottom = parentTop + $parent.outerHeight();
			            const $cartOrderSummaryHeight = $cartOrderSummary.outerHeight();
			            const maxTranslate = parentBottom - $cartOrderSummaryHeight - offsetTop + 50;

			            if (scrollTop >= offsetTop && scrollTop <= maxTranslate + offsetTop) {
			                if (!$cartOrderSummary.hasClass('scroll')) {
			                    $cartOrderSummary.css({ width: originalWidth + 'px' });
			                }
			                $cartOrderSummary.addClass('scroll');
			                setY(scrollTop - offsetTop);
			            } else if (scrollTop > maxTranslate + offsetTop) {
			                setY(maxTranslate); // stop at bottom
			            } else {
			                if ($cartOrderSummary.hasClass('scroll')) {
			                    $cartOrderSummary.removeClass('scroll');
			                    $cartOrderSummary.removeAttr('style');
			                }
			                setY(0);
			            }
			        });

			        initialized = true;
			    }

			    function disableSticky() {
			        $(window).off('scroll.stickyCartSummary');
			        if ($cartOrderSummary.hasClass('scroll')) {
			            $cartOrderSummary.removeClass('scroll');
			            $cartOrderSummary.removeAttr('style');
			        }
			        if ($placeholder) $placeholder.remove();
			        initialized = false;
			    }

			    function updateStickyState() {
			        if ($(window).outerWidth() >= 1024) {
			            enableSticky();
			        } else {
			            disableSticky();
			        }
			    }

			    // On resize, update original width and reset sticky state if necessary
			    function updateWidthOnResize() {
			        if (initialized) {
			            originalWidth = $cartOrderSummary.next('.wp-block-woocommerce-cart-order-summary-block-placeholder').outerWidth();
			            $cartOrderSummary.css({ width: originalWidth + 'px' });
			        }
			    }

			    updateStickyState();
			    $(window).on('resize.stickyCartSummary', function () {
			        updateStickyState();
			        updateWidthOnResize(); // Ensure width is updated on resize
			    });
			}

			setTimeout(function(){
				$('.wc-block-cart__sidebar').wrapInner('<div class="sticky-wc-block-cart__sidebar">');
				stickyCartSummary($('.sticky-wc-block-cart__sidebar'));
			},3000);

			function stickyCartTotals($cartOrderSummary) {
			    if (!$cartOrderSummary.length) return;

			    let offsetTop, originalWidth, setY, $placeholder;
			    let initialized = false;
			    let $parent = $('.cart-collaterals');

			    function enableSticky() {
			        if (initialized) return;

			        offsetTop     = $cartOrderSummary.offset().top;
			        originalWidth = $cartOrderSummary.outerWidth();
			        setY          = gsap.quickSetter($cartOrderSummary[0], 'y', 'px');

			        // Create placeholder
			        $placeholder = $('<div class="sticky-wc-block-cart__sidebar-placeholder" style="height:' +
			                         $cartOrderSummary.outerHeight() + 'px"></div>').insertAfter($cartOrderSummary);

			        $(window).on('scroll.stickyCartTotals', function () {
			            const scrollTop  = $(window).scrollTop() +
			                               ($('.et__header.sticky.active').is(':visible')
			                                 ? $('.et__header.sticky.active').outerHeight()
			                                 : 0) + 36;
			            const parentTop    = $parent.offset().top;
			            const parentBottom = parentTop + $parent.outerHeight();
			            const boxHeight    = $cartOrderSummary.outerHeight();
			            const maxTranslate = parentBottom - boxHeight - offsetTop;

			            if (scrollTop >= offsetTop && scrollTop <= maxTranslate + offsetTop) {
			                if (!$cartOrderSummary.hasClass('scroll')) {
			                    $cartOrderSummary.css({ width: originalWidth + 'px' });
			                }
			                $cartOrderSummary.addClass('scroll');
			                setY(scrollTop - offsetTop);
			            } else if (scrollTop > maxTranslate + offsetTop) {
			                setY(maxTranslate); // stop at bottom
			            } else {
			                if ($cartOrderSummary.hasClass('scroll')) {
			                    $cartOrderSummary.removeClass('scroll').removeAttr('style');
			                }
			                setY(0);
			            }
			        });

			        initialized = true;
			    }

			    function disableSticky() {
			        $(window).off('scroll.stickyCartTotals');
			        if ($cartOrderSummary.hasClass('scroll')) {
			            $cartOrderSummary.removeClass('scroll').removeAttr('style');
			        }
			        if ($placeholder) $placeholder.remove();
			        initialized = false;
			    }

			    function updateStickyState() {
			        if ($(window).outerWidth() >= 1280) {
			            enableSticky();
			        } else {
			            disableSticky();
			        }
			    }

			    function updateWidthOnResize() {
			        if (initialized) {
			            originalWidth = $cartOrderSummary
			                .next('.wp-block-woocommerce-cart-order-summary-block-placeholder')
			                .outerWidth();
			            $cartOrderSummary.css({ width: originalWidth + 'px' });
			        }
			    }

			    updateStickyState();
			    $(window).on('resize.stickyCartTotals', function () {
			        updateStickyState();
			        updateWidthOnResize();
			    });
			}

			/* initialise */
			stickyCartTotals($('.cart_totals'));

			function fetchCartCrossSellsProducts(){

		    	$.ajax({

					url: copt.ajaxUrl,
		            type: 'POST',
		            data: {
		            	'nonce':copt.fetchCrossSellsProductsNonce,
		            	'action':'fetch_cross_sells_products',
		            	'lang':currentLang
		            },
		            success: function(response) {

		            	if (response.data) {

		            		response = response.data;

		            		if (response['products']) {

								let template = $('<div class="cross-sells-products">').html(response['products']);
								template.find('.product').addClass('swiper-slide');
								template.prepend('<h2 class="cross-sells-products-title">' + copt.strings.like + '</h2>');
								
								$('.wp-block-woocommerce-cart-cross-sells-block').remove();
								$('[data-collection="woocommerce/product-collection/cross-sells"]').remove();

								setTimeout(function(){

									$('.wp-block-woocommerce-cart').after(template);

									let opt = {
						    			'gap-d':12,
						    			'gap-lp':12,
						    			'gap-tb':12,
						    			'gap-mb':8,
						    			'gap-mbs':8,
						    		};

		            				buildSwiperCarousel($('.cross-sells-products-carousel-container'),opt);
									setTimeout(function(){
										lazyLoad(document.querySelector('.cross-sells-products-carousel-container'));
						    			$('.cross-sells-products-carousel-container').find('.swiper-slide').removeClass('swiper-hidden');
						    			$('.cross-sells-products').removeClass('loading');
						    		},300);

								    $('.cross-sells-products').addClass('active');

					    		},1000);

		            		}

		            	}

		            },
		            error: function(xhr, status, error) {
		                console.log(error);
		            }

			    });
		    }

		    function fetchCartNewProducts(){

		    	$.ajax({

					url: copt.ajaxUrl,
		            type: 'POST',
		            data: {
		            	'nonce':copt.fetchNewProductsNonce,
		            	'action':'fetch_new_products',
		            	'lang':currentLang
		            },
		            success: function(response) {

		            	if (response.data) {

		            		response = response.data;

		            		if (response['products']) {

								let template = $('<div class="new-products">').html(response['products']);
								template.find('.product').addClass('swiper-slide');
								template.prepend('<h2 class="new-products-title">' + copt.strings.new + '</h2>');
								
								$('.wp-block-product-new').prev('.wp-block-heading').remove();
								$('.wp-block-product-new').remove();

								setTimeout(function(){

									$('.wc-block-cart__empty-cart__title').after(template);

									let opt = {
						    			'gap-d':12,
						    			'gap-lp':12,
						    			'gap-tb':12,
						    			'gap-mb':8,
						    			'gap-mbs':8,
						    		};

		            				buildSwiperCarousel($('.new-products-carousel-container'),opt);
									setTimeout(function(){
										lazyLoad(document.querySelector('.new-products-carousel-container'));
						    			$('.new-products-carousel-container').find('.swiper-slide').removeClass('swiper-hidden');
						    			$('.new-products').removeClass('loading');

						    		},300);

								    $('.new-products').addClass('active');

					    		},1000);

		            		}

		            	}

		            },
		            error: function(xhr, status, error) {
		                console.log(error);
		            }

			    });
		    }

		    waitForElement('.wc-block-cart-items', () => {
			    fetchCartCrossSellsProducts();
			});

			waitForElement('.wp-block-product-new', () => {
			    fetchCartNewProducts();
			});

			function responsiveCartTable(){
				if ($(window).outerWidth() <= 767) {
					let label = $('.wc-block-cart-items__header-total span').text();
					if (label && !$('.wc-block-cart-item__total .label').length) {
						$('.wc-block-cart-item__total')
						.prepend('<strong class="label">'+label+':</strong>');
					}
				} else {
					$('.wc-block-cart-item__total .label').remove();
				}
			}

			waitForElement('.wc-block-cart-items__row', () => {
				responsiveCartTable();
			});

			$(window).resize(responsiveCartTable);

		/* My account
		-----*/

			function respMyaccountNav(){
				if($(window).outerWidth() <= 1023){

					if ($('.account-nav.active.dynamic').length) {
						return;
					}

					let wanToggle = '<a href="#" class="wan-toggle">'+copt.strings.myAccountNav+'</a>';
					if(!$('.wan-toggle').length){

						$(wanToggle).insertAfter($('.woocommerce-MyAccount-navigation'));

						$('.woocommerce-MyAccount-navigation').prepend(wanToggle);
						$('.woocommerce-MyAccount-navigation .wan-toggle').addClass('close');

						$('.woocommerce-MyAccount-content')
						.prepend('<h2 class="woocommerce-MyAccount-content-title">'+$('.woocommerce-MyAccount-navigation .is-active a').text()+'</h2>');
					}
				} else {
					$('.wan-toggle').remove();	
					$('.woocommerce-MyAccount-content-title').remove();	
				}
			}
			respMyaccountNav();
			$(window).resize(respMyaccountNav);

			$('body').on('click','.wan-toggle',function(e){
				e.preventDefault();
				$('.woocommerce-MyAccount-navigation').toggleClass('active');
				$('.sticky-dashboard').toggleClass('off');
			});

			function respMyaccountTabs(){
				if(
					!$('body').hasClass('logged-in') && 
					$('#customer_login > .col-2').length && 
					$(window).outerWidth() <= 767
				){

					let accountTabs = '<ul class="account-tabs">';

					accountTabs += '<li data-target="col-1" class="active">'+$('#customer_login > .col-1 h2').text()+'</li>';
					accountTabs += '<li data-target="col-2">'+$('#customer_login > .col-2 h2').text()+'</li>';

					accountTabs += '</ul>';

					if(!$('.account-tabs').length){
						$('#customer_login').prepend(accountTabs);
					}

					$('#customer_login .col-1').addClass('active');

				} else {
					$('.account-tabs').remove();
					$('#customer_login > div').removeClass('active');
				}
			}
			respMyaccountTabs();
			$(window).resize(respMyaccountTabs);

			$('body').on('click','.account-tabs li',function(){
				$(this).addClass('active').siblings().removeClass('active');
				$('.'+$(this).attr('data-target')).addClass('active').siblings().removeClass('active');
			});

	})(jQuery);

/* Woo single gallery
----*/

	(function($){
	    "use strict";

	    function etResetProductVideos($gallery) {
	        $gallery.find('.et-product-gallery__video').each(function(){
	            var $slide = $(this);
	            $slide.find('.et-product-video-frame').empty().removeClass('active');
	            $slide.find('.et-product-video-trigger').show();
	        });
	    }

	    function etBuildVideo(type, url, embedUrl) {

	        if (type === 'file') {
	            return '<video controls autoplay playsinline preload="metadata">' +
	                '<source src="' + url + '">' +
	            '</video>';
	        }

	        if (type === 'youtube' || type === 'vimeo' || type === 'iframe') {
	            return '<iframe src="' + embedUrl + '" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>';
	        }

	        return '';
	    }

	    $(document).on('click', '.et-product-video-trigger', function(e){
	        e.preventDefault();

	        var $trigger  = $(this);
	        var $slide    = $trigger.closest('.et-product-gallery__video');
	        var $gallery  = $trigger.closest('.woocommerce-product-gallery');
	        var $frame    = $slide.find('.et-product-video-frame');
	        var videoType = $slide.attr('data-video-type');
	        var videoUrl  = $slide.attr('data-video-url');
	        var embedUrl  = $slide.attr('data-video-embed');

	        etResetProductVideos($gallery);

	        if (!videoUrl && !embedUrl) {
	            return;
	        }

	        var html = etBuildVideo(videoType, videoUrl, embedUrl);

	        if (!html) {
	            return;
	        }

	        $frame.html(html).addClass('active');
	        $trigger.hide();
	    });

	    $(document).on('click', '.flex-control-thumbs img, .flex-prev, .flex-next', function(){
	        var $gallery = $(this).closest('.woocommerce-product-gallery');

	        if (!$gallery.length) {
	            $gallery = $('.woocommerce-product-gallery');
	        }

	        etResetProductVideos($gallery);
	    });

	    function etAddVideoClassToGalleryThumbs() {
	        var $gallery = $('.woocommerce-product-gallery');

	        if (!$gallery.length) {
	            return;
	        }

	        var $slides = $gallery.find('.woocommerce-product-gallery__wrapper .woocommerce-product-gallery__image');
	        var $thumbs = $gallery.find('.flex-control-thumbs li');

	        if (!$slides.length || !$thumbs.length) {
	            return;
	        }

	        $slides.each(function(index){
	            var $slide = $(this);

	            if ($slide.hasClass('et-product-gallery__video') || $slide.attr('data-thumb-type') === 'video') {
	                $thumbs.eq(index).addClass('et-gallery-thumb-video');
	            }
	        });
	    }

	    $(window).on('load', function(){
	        setTimeout(etAddVideoClassToGalleryThumbs, 150);
	    });



	})(jQuery);

/* Woo single gallery thumbnails
----*/

	(function ($) {

	    'use strict';

	    function initThumbsHoverScroll() {

	        const $thumbs = $('.product-layout.side .woocommerce-product-gallery--with-images .flex-control-thumbs');

	        if (!$thumbs.length) {
	            return;
	        }

	        $thumbs.each(function () {

	            const el = this;

	            let isPointerInside    = false;
	            let isWheelScrolling   = false;
	            let wheelTimer         = null;

	            let lastMouseY         = 0;
	            let lastScrollTop      = 0;
	            let hasMouseReference  = false;

	            el.addEventListener('mouseenter', function (e) {
	                isPointerInside   = true;
	                lastMouseY        = e.clientY;
	                lastScrollTop     = el.scrollTop;
	                hasMouseReference = true;
	            });

	            el.addEventListener('mouseleave', function () {
	                isPointerInside   = false;
	                hasMouseReference = false;
	            });

	            el.addEventListener('wheel', function () {
	                isWheelScrolling = true;

	                clearTimeout(wheelTimer);

	                wheelTimer = setTimeout(function () {
	                    isWheelScrolling = false;

	                    // After wheel scrolling ends, reset reference point
	                    // so next mousemove starts from current position
	                    hasMouseReference = false;
	                }, 200);

	            }, { passive: true });

	            el.addEventListener('mousemove', function (e) {

	                if (!isPointerInside || isWheelScrolling) {
	                    return;
	                }

	                const maxScroll = el.scrollHeight - el.clientHeight;

	                if (maxScroll <= 0) {
	                    return;
	                }

	                // First move after enter / wheel end:
	                // store current position and do nothing to avoid jump
	                if (!hasMouseReference) {
	                    lastMouseY        = e.clientY;
	                    lastScrollTop     = el.scrollTop;
	                    hasMouseReference = true;
	                    return;
	                }

	                const deltaY = e.clientY - lastMouseY;
	                let newScrollTop = lastScrollTop + deltaY;

	                if (newScrollTop < 0) {
	                    newScrollTop = 0;
	                }

	                if (newScrollTop > maxScroll) {
	                    newScrollTop = maxScroll;
	                }

	                el.scrollTop = newScrollTop;

	                lastMouseY    = e.clientY;
	                lastScrollTop = el.scrollTop;

	            });

	            // If scroll changes by any other means, keep references synced
	            el.addEventListener('scroll', function () {
	                if (!isWheelScrolling && hasMouseReference) {
	                    lastScrollTop = el.scrollTop;
	                }
	            }, { passive: true });

	        });
	    }

	    $(document).ready(function () {
	        initThumbsHoverScroll();
	    });

	})(jQuery);

/* Woo single product
----*/

	(function($){

		"use strict";

		let reviewCount = $('.woocommerce-review-link > .count').text();

		if (reviewCount) {
			$('.reviews_tab .review-count').text(reviewCount).addClass('active');
		}

		$(document).on('click','.single-product .woo-product__attributes .details',function(e){
			e.preventDefault();

			let target = $(this).attr('href');

			$('.additional_information_tab > a').trigger('click');

			$('html, body').animate({
			    scrollTop: $(target).offset().top - ($('.et__header.sticky:visible').outerHeight() || 0)
			}, 500); // 500 = duration in milliseconds

		});

		/* Variations / Fbt
		---*/

			var productDefaultPrice    = $('.single-product-add-to-cart > .price').length ? $('.single-product-add-to-cart > .price').html() : 0;
			
			var productDefaultSavingsHtml  = $('.single-product-add-to-cart .savings > .savings-price').length
			    ? $('.single-product-add-to-cart .savings > .savings-price').html()
			    : '';

			var productDefaultDiscountHtml = $('.single-product-add-to-cart .savings-discount').length
			    ? $('.single-product-add-to-cart .savings-discount').html()
			    : '';

			var currentProduct         = $('#et-content > .product').length ? $('#et-content > .product').attr('id').split('-').pop() : false;
			var restoreDefaultPrice    = false;
			var variableProductData    = {};

			if ($('.variations_form').length) {

				$('.variations_form').on('found_variation', function(event, variation) {
			        
			        const $form = $(this);

			        // Extract form data
			        const formData = $form.serializeArray();
			        const attributes = {};

			        formData.forEach(field => {
			            if (field.name.startsWith('attribute_')) {
			                attributes[field.name] = field.value;
			            }
			        });

			        const product_id = parseInt($form.find('input[name="product_id"]').val());
			        const variation_id = parseInt(variation.variation_id);
			        const quantity = parseInt($form.find('input.qty').val()) || 1;

			        variableProductData['variable_product_id'] = product_id;
			        variableProductData['variation_id'] = variation_id;
			        variableProductData['quantity'] = quantity;
			        variableProductData['variations'] = attributes;

			    });

		    }

			function updateCurrentPrice(restoreDefault = false, variablePriceHtml = '') {

			    const setPriceHtml = (selector, priceHtml) => {
			        $(selector).html(priceHtml);
			    };

			    const setPrice = (selector, newPrice) => {
			        $(selector).each(function () {
			            const bdiContent = $(this).html().trim();
			            const currencyMatch = bdiContent.match(/^(.*?)([\d.,]+)(.*?)$/);

			            if (currencyMatch) {
			                const before = currencyMatch[1];
			                const after = currencyMatch[3];
			                $(this).html(before + newPrice + after);
			            }
			        });
			    };

			    const getFBTCalculations = () => {

			        let allRegularPrices = [];
			        let allSalePrices    = [];
			        let decimalPlaces    = 0;

			        $('.fbt-content .product').each(function () {

			            let $this = $(this);

			            let regularPrice = $this.find('.price > .amount > bdi').length ?
			                $this.find('.price > .amount > bdi') :
			                $this.find('.price > del > .amount > bdi').length ?
			                $this.find('.price > del > .amount > bdi') : 0;

			            let salePrice = $this.find('.price > ins > .amount > bdi').length ?
			                $this.find('.price > ins > .amount > bdi') :
			                regularPrice;

			            if (regularPrice) {

			                regularPrice = regularPrice.text().trim().replace(/[^\d.]/g, '');

			                const decimalMatch = regularPrice.match(/\.(\d+)/);

			                decimalPlaces = decimalMatch ? decimalMatch[1].length : 0;

			                regularPrice = parseFloat(regularPrice).toFixed(decimalPlaces);

			                allRegularPrices.push(regularPrice);
			            }

			            if (salePrice) {

			                salePrice = salePrice.text().trim().replace(/[^\d.]/g, '');

			                if (decimalPlaces == 0) {
			                    const decimalMatch = salePrice.match(/\.(\d+)/);
			                    decimalPlaces = decimalMatch ? decimalMatch[1].length : 0;
			                }

			                const formattedSalePrice = parseFloat(salePrice).toFixed(decimalPlaces);
			                allSalePrices.push(formattedSalePrice);
			            }

			        });

			        if (allSalePrices.length) {

			            let regularPrice = allRegularPrices.reduce((sum, val) => sum + parseFloat(val), 0);
			            let salePrice    = allSalePrices.reduce((sum, val) => sum + parseFloat(val), 0);

			            const savings  = parseFloat(regularPrice - salePrice).toFixed(decimalPlaces);
			            const discount = '-' + Math.round(100 - 100 * (salePrice / regularPrice)) + '%';

			            if (savings) {
			                return {
			                    'savings': savings,
			                    'discount': discount,
			                    'salePrice': salePrice,
			                    'regularPrice': regularPrice,
			                };
			            }

			            return false;
			        }

			    };

			    const setSavingsAndDiscount = (savings, discount) => {

			        if ($('.savings > .savings-price bdi').length) {
			            setPrice('.single-product-add-to-cart .savings > .savings-price bdi', savings);

			            $('.single-product-add-to-cart .savings-wrapper').removeClass('hidden');
			        }

			        if (discount && $('.savings-discount').length) {
			            $('.single-product-add-to-cart .savings-discount').html(discount);
			        }

			        if ($('.fbt-info').length) {

			            let fbtCalc = getFBTCalculations();

			            if (fbtCalc && 'savings' in fbtCalc) {
			                setPrice('.fbt-info .savings > .savings-price bdi', fbtCalc['savings']);
			            }

			            if (fbtCalc && 'discount' in fbtCalc) {
			                $('.fbt-info .savings-discount').html(fbtCalc['discount']);
			            }

			            if (fbtCalc && 'regularPrice' in fbtCalc) {
			                setPrice('.fbt-info .total-price del > .amount > bdi', fbtCalc['regularPrice']);

			                if ('salePrice' in fbtCalc) {
			                    setPrice('.fbt-info .total-price ins > .amount > bdi', fbtCalc['salePrice']);
			                }
			            }

			        }

			    };

			    const updateAllPriceDisplays = (priceHtml) => {
			        setPriceHtml('.single-product-add-to-cart > .price', priceHtml);

			        if (currentProduct && $('.fbt-content .post-' + currentProduct).length) {
			            setPriceHtml('.fbt-content .post-' + currentProduct + ' .price', priceHtml);
			        }
			    };

			    if (restoreDefault && typeof productDefaultPrice !== 'undefined' && productDefaultPrice) {
			        updateAllPriceDisplays(productDefaultPrice);

			        $('.single-product-add-to-cart .savings-wrapper').addClass('hidden');
			        
			        if ($('.single-product-add-to-cart .savings > .savings-price').length) {
					    $('.single-product-add-to-cart .savings > .savings-price').html(productDefaultSavingsHtml);
					}

					if ($('.single-product-add-to-cart .savings-discount').length) {
					    $('.single-product-add-to-cart .savings-discount').html(productDefaultDiscountHtml);
					}

			        restoreDefaultPrice = false;
			        return;
			    }

			    if (!variablePriceHtml) {
			        return;
			    }

			    updateAllPriceDisplays(variablePriceHtml);

			    const parsedHtml   = $('<div>').html(variablePriceHtml);
			    let regularPrice   = parsedHtml.find('del bdi').text().trim().replace(/[^\d.]/g, '');
			    const salePriceRaw = parsedHtml.find('ins bdi').text().trim().replace(/[^\d.]/g, '');
			    const salePrice    = parsedHtml.find('ins').length ? salePriceRaw : false;

			    if (salePrice && regularPrice) {
			        const decimalMatch = regularPrice.match(/\.(\d+)/);
			        const decimalPlaces = decimalMatch ? decimalMatch[1].length : 0;

			        regularPrice = parseFloat(regularPrice).toFixed(decimalPlaces);
			        const formattedSalePrice = parseFloat(salePrice).toFixed(decimalPlaces);
			        const savings = parseFloat(regularPrice - formattedSalePrice).toFixed(decimalPlaces);
			        const discount = '-' + Math.round(100 - 100 * (formattedSalePrice / regularPrice)) + '%';

			        setSavingsAndDiscount(savings, discount);
			    }
			}

		    function updateCustomVariationAttr(attr,etAttr){
		    	if (attr.val()){
	    			etAttr.find('select').val(attr.val());
	    			etAttr.find('a[data-value="'+attr.val()+'"]')
	    			.addClass('chosen')
	    			.siblings()
	    			.removeClass('chosen');

	    			etAttr.parent().find('.clear').addClass('active');

	    		} else {
	    			etAttr.find('select').val('');
	    			etAttr.find('a[data-value="'+attr.val()+'"]')
	    			.removeClass('chosen');

	    			if (
	    				!etAttr.parent().find('.chosen').length ||
	    				!etAttr.parent().find('select').val()
	    			) {
	    				etAttr.parent().find('.clear').removeClass('active');
	    			}
	    		}
		    }

		    function updateDefaultVariationAttr(attr,val){

		    	attr.parents('.summary')
		    	.find('select#'+attr.parent().attr('id').replace(/^attr-/, ''))
		    	.val(val)
		    	.trigger('change');

		    }

		    function toggleVariationClear(attr){
		    	if (attr.is('select') && attr.val()) {
		    		attr.parents('.et__variation-swatches').find('.et__clear_variation-swatches a').addClass('active')
		    	} else if (attr.is('a') && attr.hasClass('chosen')) {
		    		attr.parents('.et__variation-swatches').find('.et__clear_variation-swatches a').addClass('active')
		    	} else {
		    		attr.parents('.et__variation-swatches').find('.et__clear_variation-swatches a').removeClass('active')
		    	}
		    }

			$('body').on('click','.single-product-main .flex-control-thumbs li',function(){
				$(this).addClass('active').siblings().removeClass('active')
			});

			$('body').on('click','.sku_wrapper',function(){
		        let skuText = $(this).find('.sku').text().trim();
		        if (skuText) {
		            let tempInput = $('<input>');
		            $('body').append(tempInput);
		            tempInput.val(skuText).select();
		            document.execCommand('copy');

		            alert(copt.strings.skuCopy.replace('##',skuText));

		            tempInput.remove();
		        }
		    });

		    updateCurrentPrice(restoreDefaultPrice);

		    $('body').on('click','.et__clear_variation-swatches a',function(e){

		    	e.preventDefault()

		    	let $this = $(this);

		    	$this.parents('.et__variation-swatches').find('.chosen').removeClass('chosen');
		    	$this.parents('.et__variation-swatches').find('select').val('');
		    	$this.removeClass('active');

		    	restoreDefaultPrice = true;

		    	$this.parents('.summary').find('.reset_variations').trigger('click');


		    });

		    $('body').on('click','.summary .reset_variations',function(e){
		    	updateCurrentPrice(restoreDefaultPrice);
		    });

		    $('body').on('click','.et__variation-swatches a.variation-item-opt',function(e){

		    	e.preventDefault();

		    	let $this = $(this);
		    	$this.toggleClass('chosen').siblings().removeClass('chosen');
		    	toggleVariationClear($this);
		    	updateDefaultVariationAttr($this,$this.attr('data-value'));
		    });

		    if ($('.variations_form').length) {

			    $('.variations_form')
			    .on('found_variation', function(event, variation) {

			        const $form = $(this);

			        const formData = $form.serializeArray();
			        const attributes = {};

			        formData.forEach(field => {
			            if (field.name.startsWith('attribute_')) {
			                attributes[field.name] = field.value;
			            }
			        });

			        const product_id   = parseInt($form.find('input[name="product_id"]').val());
			        const variation_id = parseInt(variation.variation_id);
			        const quantity     = parseInt($form.find('input.qty').val()) || 1;

			        variableProductData['variable_product_id'] = product_id;
			        variableProductData['variation_id'] = variation_id;
			        variableProductData['quantity'] = quantity;
			        variableProductData['variations'] = attributes;

			        restoreDefaultPrice = false;

			        updateCurrentPrice(false, variation.price_html || '');
			    })
			    .on('reset_data hide_variation', function() {
			        updateCurrentPrice(true);
			    });

			}

		    $('.variation-item-opt.select').on('change',function(){
		    	let $this = $(this);
		    	toggleVariationClear($this);
		    	updateDefaultVariationAttr($this,$this.val());
		    });

		    if ($('.variations_form.cart').length) {

		    	let variationForm = $('.variations_form.cart'),
		    		variationAtts =  variationForm.find('select');

		    	variationAtts.each(function(){
		    		
		    		let $this  = $(this),
		    			etThis = $this.parents('.summary').find('.et__variation-swatches #attr-'+$this.attr('id'));

		    		if (typeof(etThis) != "undefined" && etThis.length) {
		    			updateCustomVariationAttr($this,etThis);
			    		$this.on('change',function(){
		    				updateCustomVariationAttr($this,etThis);
			    		});
		    		}
		    		
		    	});

		    }

		    $('body').on('click', '.single-product-add-to-cart .quantity', function (e) {
			    
			    let $this = $(this);
			    let offset = $this.offset();
			    let relativeX = e.pageX - offset.left; // Get relative X position inside .quantity
			    let width = $this.width();
			    let $qtyInput = $this.children('.qty');
			    let currentVal = parseInt($qtyInput.val()) || 1;

			    if (relativeX <= 48) {
			        if (currentVal > 1) {
			            $qtyInput.val(currentVal - 1);
			        }
			    } else if (relativeX >= width - 48) {
			        $qtyInput.val(currentVal + 1);
			    }

			});

			function updateFBTlayout(){

				if ($(window).outerWidth() >= 1024 && $(window).outerWidth() < 1600) {
					$('.loop-products.fbt')
					.removeClass('list')
					.addClass('grid');
				} else {
					$('.loop-products.fbt')
					.removeClass('grid')
					.addClass('list');
				}
			}

			updateFBTlayout();
			$(window).on('resize',updateFBTlayout);

		/* Add to cart all fbt
		----*/

			function updateMiniCart(onComplete) {

			    etAjaxRetryBadNonce({
				  type: 'POST',
				  url: copt.ajaxUrl,
				  dataType: 'json',
				  data: {
				    action: 'update_mini_cart_content',
				    nonce: copt.updateMiniCartNonce,
				  },
				  success: function(response) {

				    if (response) {

				      // your handler returns { success:true, data:{...} }
				      // keep your original logic
				      response = response.data;

				      if (response && typeof response === 'object') {

				        if ('html' in response) {
				          $('.widget_shopping_cart_content').html(response['html']);
				        }

				        if ('cart_content' in response) {
				          $('.cart-contents').each(function(){
				            $(this).html(response['cart_content']);
				          });
				        }

				      }

				      afterCartUpdate();

				      $('.et__cart').addClass('active');
				    }

				    // ✅ Call the callback AFTER everything is done
				    if (typeof onComplete === 'function') {
				      onComplete(response);
				    }
				  }
				}, 'updateMiniCartNonce');

			}


			$('.add_to_cart_all').on('click',function(e){

				if (addon == false) {return}

				let $this = $(this);

				let fbtActive = $('.fbt-content .product');

				if (!$this.hasClass('added') && fbtActive.length) {

					e.preventDefault();

					$this.parent().addClass('loading');

					var products = [];

					fbtActive.each(function(){
						products.push($(this).find('.add_to_cart_button').attr('data-product_id'));
					});

					if (products.length) {

						let ajaxData = {
						  'action': 'add_to_cart_all',
						  'nonce': copt.fbtNonce,
						  'products': JSON.stringify(products),
						}

						if (Object.keys(variableProductData).length > 0) {
						  ajaxData = { ...ajaxData, ...variableProductData };
						}

						etAjaxRetryBadNonce({
						  type: 'POST',
						  url: copt.ajaxUrl,
						  data: ajaxData,
						  success: function(response) {

						    updateMiniCart(function() {
						      // This runs ONLY after updateMiniCart finished
						      $this
						        .addClass('added')
						        .html(copt.strings.viewCart)
						        .attr('href', copt.cartPage)
						        .parent()
						        .removeClass('loading');

						      $('.sticky-dashboard').addClass('off');
						    });

						  }
						}, 'fbtNonce');


			        }
				}
			});

		/* Sticky gallery
		----*/

			function stickyProductGallery($gallery) {
			    if (!$gallery.length) return;

			    let offsetTop, originalWidth, setY, $placeholder;
			    let initialized = false;
			    let $parent = $gallery.parent();

			    function enableSticky() {
			        if (initialized) return;

			        offsetTop = $gallery.offset().top;
			        originalWidth = $gallery.outerWidth();
			        setY = gsap.quickSetter($gallery[0], "y", "px");

			        // Create placeholder
			        $placeholder = $('<div class="woocommerce-product-gallery-wrapper-placeholder"></div>')
			        .insertAfter($gallery);

			        $(window).on('scroll.stickyGallery', function () {
			            const scrollTop = $(window).scrollTop() + ($('.et__header.sticky.active').is(":visible") ? $('.et__header.sticky.active').outerHeight() + 32 : 0);
			            const parentTop = $parent.offset().top;
			            const parentBottom = parentTop + $parent.outerHeight();
			            const galleryHeight = $gallery.outerHeight();
			            const maxTranslate = parentBottom - galleryHeight - offsetTop;

			            if (scrollTop >= offsetTop && scrollTop <= maxTranslate + offsetTop) {
			                if (!$gallery.hasClass('scroll')) {
			                    $gallery.css({ width: originalWidth + 'px' });
			                }
			                $gallery.addClass('scroll');
			                setY(scrollTop - offsetTop);
			            } else if (scrollTop > maxTranslate + offsetTop) {
			                setY(maxTranslate); // stop at bottom
			            } else {
			                if ($gallery.hasClass('scroll')) {
			                    $gallery.removeClass('scroll');
			                    $gallery.removeAttr('style');
			                }
			                setY(0);
			            }
			        });

			        initialized = true;
			    }

			    function disableSticky() {
			        $(window).off('scroll.stickyGallery');
			        if ($gallery.hasClass('scroll')) {
			            $gallery.removeClass('scroll');
			            $gallery.removeAttr('style');
			        }
			        if ($placeholder) $placeholder.remove();
			        initialized = false;
			    }

			    function updateStickyState() {
			        if ($(window).outerWidth() >= 1280) {
			            enableSticky();
			        } else {
			            disableSticky();
			        }
			    }

			    // On resize, update original width and reset sticky state if necessary
			    function updateWidthOnResize() {
			        if (initialized) {
			            originalWidth = $gallery.next('.woocommerce-product-gallery-wrapper-placeholder').outerWidth();
			            $gallery.css({ width: originalWidth + 'px' });
			        }
			    }

			    updateStickyState();
			    $(window).on('resize.stickyGallery', function () {
			        updateStickyState();
			        updateWidthOnResize(); // Ensure width is updated on resize
			    });
			}

			const $gallery = $('.woocommerce-product-gallery-wrapper');
			stickyProductGallery($gallery);


	})(jQuery);

/* Woo cart
----*/

	document.addEventListener('DOMContentLoaded', function () {

		const cartRoot = document.querySelector('.wp-block-woocommerce-cart');
		if (!cartRoot) return;

		// Adjust this selector if your cart rows differ
		const CART_ITEM_SELECTOR = 'img';

		let emptyTimeout = null;
		let initialStateResolved = false; // we only do this logic once on initial load

		function hasCartItems() {
			return !!cartRoot.querySelector(CART_ITEM_SELECTOR);
		}

		function ensureLoadingState() {
			if (!cartRoot.classList.contains('is-loading')) {
				cartRoot.classList.add('is-loading');
			}
		}

		function clearLoadingState() {
			cartRoot.classList.remove('is-loading');
			cartRoot.classList.add('loaded');
		}

		function applyEmptyState() {
			// No items even after timeout → treat as empty, not loading
			clearLoadingState();
			cartRoot.classList.add('et-cart-empty'); // you style this in CSS
			// Optional: you can also clear or hide inner content here if needed
		}

		function handleInitialCartState() {
			if (initialStateResolved || !cartRoot) return;

			// If items already present → just clear loading and done
			if (hasCartItems()) {
				clearLoadingState();
				cartRoot.classList.remove('et-cart-empty');
				initialStateResolved = true;
				if (emptyTimeout) {
					clearTimeout(emptyTimeout);
					emptyTimeout = null;
				}
				return;
			}

			// No items yet → keep it in "loading" until either:
			// - rows appear, or
			// - timeout fires
			ensureLoadingState();

			if (!emptyTimeout) {
				emptyTimeout = setTimeout(function () {
					if (!hasCartItems() && !initialStateResolved) {
						applyEmptyState();
						initialStateResolved = true;
						observer.disconnect();
					}
				}, 5000); // 5 seconds
			}
		}

		const observer = new MutationObserver(function (mutationsList) {
			if (initialStateResolved) {
				observer.disconnect();
				return;
			}

			// Any DOM change in the cart → re-check
			if (hasCartItems()) {
				// First real row appeared
				clearLoadingState();
				cartRoot.classList.remove('et-cart-empty');
				initialStateResolved = true;
				if (emptyTimeout) {
					clearTimeout(emptyTimeout);
					emptyTimeout = null;
				}
				observer.disconnect();
			} else {
				// Still no items → enforce loading state
				ensureLoadingState();
			}
		});

		observer.observe(cartRoot, {
			subtree: true,
			childList: true,
			attributes: true
		});

		// Run once immediately
		handleInitialCartState();
	});

/* Product filter
----*/

	(function($){

		"use strict";

		/* Helper functions
		----*/

			function createBaseUrl(baseURL){
				
				if (Object.keys(baseURL).length > 1) {

					let filterUrl   = ''; // First item is the base URL

					if ('base' in baseURL) {
						filterUrl = baseURL['base'];
					}

					Object.entries(baseURL).forEach(([key, value], index) => {
						if (key != "base") {
							filterUrl += (index == 1) ?  '?' : '&';
							filterUrl += key+'='+value;
						}
					});

					if (filterUrl.length) {
						baseURL = filterUrl;
					}

				} else if('base' in baseURL) {
					baseURL = baseURL['base'];
				}

				return baseURL;
			}

			function multipleChoosenLayeredNav(items){
				return items.map(function() {
				    return $(this).text();
				}).get().join(', ');
			}

			function layeredNavListScroll(list,removeSearchBar=true) {
			    // Calculate the height of only visible items
			    var visibleHeight = list.find('li:visible').outerHeight(true) * list.find('li:visible').length;

			    if (visibleHeight >= 216) {
			        list.addClass('scroll');
			        if (list.prev('input').length === 0) {
			            $('<input type="search" placeholder="'+copt.strings.termSearchText+'" class="term-search" />').insertBefore(list);
			        }
			    } else {
			        list.removeClass('scroll');
			        if (removeSearchBar) {
			        	list.prev('.term-search').remove();
			        }
			    }
			}

			function listToSelect($list, level = 0) {
		        let options = '';
		        $list.children('li').each(function () {
		            const $item = $(this);
		            const current = $item.hasClass('current-cat') ? $item.find('a').attr('href') : false;
		            const text = '&nbsp;'.repeat(level * 4) + $item.find('a').attr('title');
		            const value = $item.find('a').attr('href');

		            options += '<option value="'+value+'"';

		            if (current) {
		            	options += ' selected="selected"';
		            }

		            options += '>'+text+'</option>';

		            // If there is a nested <ul>, process it recursively
		            const $nestedList = $item.children('ul');
		            if ($nestedList.length > 0) {
		                options += listToSelect($nestedList, level + 1);
		            }
		        });
		        return options;
		    }

		    function getItemCountBySlug(termInfo, slug) {
			    const term = termInfo.find(item => item.slug === slug);
			    return term ? term.count : 0;  // Return count if found, or null if not
			}

			function getCategoryBreadcrumbs(categories, slug) {
			    // Find the category that matches the given slug
			    let filteredCategory = categories.find(category => category.slug === slug);

			    // If the category is not found, return an empty array
			    if (!filteredCategory) {
			        return [];
			    }

			    // Initialize the breadcrumbs array
			    let breadcrumbs = [filteredCategory];

			    // Traverse the parent categories up the hierarchy
			    let parentId = filteredCategory.parent_id;
			    while (parentId !== 0) {
			        let parentCategory = categories.find(category => category.id === parentId);
			        if (parentCategory) {
			            breadcrumbs.push(parentCategory);
			            parentId = parentCategory.parent_id;
			        } else {
			            break; // Stop if no parent is found
			        }
			    }

			    // Reverse the breadcrumbs array to display from root to current category
			    return breadcrumbs.reverse();
			}

			function generatePagination(currentPage, totalPages, baseURL, midSize = 2, endSize = 1) {
			    if (totalPages <= 1) return ''; // No pagination needed if only one page

			    baseURL = baseURL.replace(/page\/\d+\/?/, '');

			    baseURL += 'page/';

			    let paginationHTML = '<ul class="page-numbers">';

			    // Previous button
			    if (currentPage > 1) {
			        paginationHTML += `<li><a class="prev page-numbers" href="${baseURL}${currentPage - 1}/">←</a></li>`;
			    }

			    let outputPages = new Set(); // To store visible pages

			    // Always show first N pages
			    for (let i = 1; i <= endSize; i++) outputPages.add(i);

			    // Always show last N pages
			    for (let i = totalPages - endSize + 1; i <= totalPages; i++) outputPages.add(i);

			    // Add middle range pages
			    for (let i = currentPage - midSize; i <= currentPage + midSize; i++) {
			        if (i > 0 && i <= totalPages) outputPages.add(i);
			    }

			    // Convert to sorted array
			    let pagesArray = Array.from(outputPages).sort((a, b) => a - b);

			    // Generate pagination with ellipses
			    let lastPage = 0;
			    pagesArray.forEach(page => {
			        if (lastPage && page !== lastPage + 1) {
			            paginationHTML += '<li><span class="page-numbers dots">…</span></li>';
			        }

			        if (page === currentPage) {
			            paginationHTML += `<li><span aria-label="Page ${page}" aria-current="page" class="page-numbers current">${page}</span></li>`;
			        } else {
			            paginationHTML += `<li><a aria-label="Page ${page}" class="page-numbers" href="${baseURL}${page}/">${page}</a></li>`;
			        }

			        lastPage = page;
			    });

			    // Next button
			    if (currentPage < totalPages) {
			        paginationHTML += `<li><a class="next page-numbers" href="${baseURL}${currentPage + 1}/">→</a></li>`;
			    }

			    paginationHTML += '</ul>';
			    return paginationHTML;
			}

			function updatepushState(baseURL,filterUrl){
				let newUrl = baseURL;

		        newUrl = newUrl.replace('/&', '/?');
		        newUrl = encodeURI(newUrl);

		        history.pushState({ url: newUrl }, "", newUrl);
			}

			function layeredNavDropdownEvents(trigger,activeFilters,baseURL){
		    	let activeTerm  = (trigger.is('select')) ? trigger.val() : trigger.parents('.widget').find('select').val(),
					attribute   = trigger.parents('.widget').attr('data-attribute'),
					queryType   = trigger.parents('.widget').attr('data-query-type');

				if (activeTerm.length) {

					if ('and' == queryType) {

						activeFilters['filter_'+attribute] = activeTerm;
						baseURL['filter_'+attribute]   = activeFilters['filter_'+attribute];

					} else {

						activeFilters['filter_'+attribute] = activeTerm.join(',');
						baseURL['query_type_'+attribute] = 'or';
						baseURL['filter_'+attribute] = activeFilters['filter_'+attribute];

					}


				} else {
					delete activeFilters['filter_'+attribute];
					delete baseURL['filter_'+attribute];
					delete activeFilters['query_type_'+attribute];
					delete baseURL['query_type_'+attribute];
				}

				ajaxProductFilter(activeFilters,baseURL);
		    }

		    function rebuildCategoriesCarousel(items){

		    	if (items.length) {

			    	let products = '';

			    	items.forEach(function(product){
			    		products += '<li class="swiper-hidden swiper-slide category '+product.slug+'">';
			    			products += '<a href="'+product.link+'" title="'+product.name+'">';
			    				products += '<div class="image-container">';
			    					products += '<img src="'+product.image+'" width="300" height="250" alt="'+product.name+'">';
			    					products += '<svg viewBox="0 0 300 300"><path d="M0,0H300V300H0V0Z"></path></svg>';
			    				products += '</div>';
			    				products += '<h3>'+product.name+'</h3>';
			    			products += '</a>';
			    		products += '</li>';
			    	});

			    	if (products.length) {
			    		return products;
			    	}

		    	}

		    }

		    function renderCategoryDescription(category) {

		    	var categoryName = '';
			    var categoryDesc = '';
			    var categoryImg  = '';

		    	if (typeof category === 'object') {
		    		categoryName = category.name;
				    categoryDesc = category.description;
				    categoryImg  = category.image;
		    	} else {
				    // --- Guard: no index or language ---
				    if (!BIGXON.categoryIndex || !BIGXON.currentLang || !BIGXON.categoryIndex[BIGXON.currentLang]) {
				        return;
				    }

				    // --- Find category by slug for current language ---
				    const cat = BIGXON.categoryIndex[BIGXON.currentLang].find(cat => cat.slug === category);
				    if (!cat) {
				        return;
				    }
				    categoryName = cat.name;
				    categoryDesc = cat.description;
				    categoryImg  = cat.image;
			    }

			    if (!categoryDesc.length) {
			    	$('.et__cat-bottom-description').remove();
			    	return;
			    }

			    // --- Ensure container exists (create once) ---
			    let $catBottom = $('.et__cat-bottom-description');

			    if (!$catBottom.length) {
			        $catBottom = $(
			            '<div class="et__cat-bottom-description">' +
			                '<div class="et__cat-bottom-image">' +
			                    '<img src="" alt="" />' +
			                '</div>' +
			                '<div class="et__cat-info-wrap">' +
			                    '<h2 class="et__cat-bottom-title"></h2>' +
			                    '<div class="et__cat-bottom-text"></div>' +
			                '</div>' +
			            '</div>'
			        ).insertAfter('#loop-products');
			    }

			    const $img   = $catBottom.find('.et__cat-bottom-image img');
			    const $title = $catBottom.find('.et__cat-bottom-title');
			    const $text  = $catBottom.find('.et__cat-bottom-text');

			    // --- Image handling ---
			    if (categoryImg) {
			        if (!$img.length) {
			            // If img was removed earlier, recreate it
			            $catBottom.find('.et__cat-bottom-image').html('<img src="" alt="" />');
			        }
			        const $newImg = $catBottom.find('.et__cat-bottom-image img');
			        $newImg.attr('src', categoryImg);
			        $newImg.attr('alt', categoryName || '');
			    } else {
			        $img.remove();
			    }

			    // --- Title handling ---
			    if (categoryName) {
			        if (!$title.length) {
			            $catBottom.find('.et__cat-info-wrap')
			                .prepend('<h2 class="et__cat-bottom-title"></h2>');
			        }
			        $catBottom.find('.et__cat-bottom-title').text(categoryName);
			    } else {
			        $title.remove();
			    }

			    // --- Description handling (HTML from WP) ---
			    if (categoryDesc) {
			        if (!$text.length) {
			            $catBottom.find('.et__cat-info-wrap')
			                .append('<div class="et__cat-bottom-text"></div>');
			        }
			        $catBottom.find('.et__cat-bottom-text').html(categoryDesc);
			    } else {
			        $text.remove();
			    }
			}

		    async function getSpellingSuggestions(word) {
			    const url = `https://api.datamuse.com/sug?s=${encodeURIComponent(word)}`;
			    try {
			        const response = await fetch(url);
			        const data = await response.json();
			        return data.map(item => item.word); // Extract only suggested words
			    } catch (error) {
			        console.error("Error fetching suggestions:", error);
			        return [];
			    }
			}

			function offerKeywordSuggestions(suggestions) {
			    let suggestionCount = parseInt(localStorage.getItem(copt.shopName + '-suggestion-count')) || 0;

			    // If suggestions exist
			    if (suggestions.length > 0) {
			        // Increment suggestion count and store in localStorage
			        suggestionCount++;
			        localStorage.setItem(copt.shopName + '-suggestion-count', suggestionCount);

			        // If suggestion count exceeds 2, remove suggestions and exit
			        if (suggestionCount > 2) {
			            $('.et__product_ajax_search_keyword_suggestions').remove();
			            localStorage.removeItem(copt.shopName + '-suggestion-count');
			            return;
			        }

			        // Generate the suggestions HTML
			        let suggestionsHTML = '<div class="et__product_ajax_search_keyword_suggestions">';
			        suggestionsHTML += copt.strings.searchSuggestion + ': ';

			        // Add suggestions (up to 3)
			        suggestions.slice(0, 3).forEach(function(value) {
			            suggestionsHTML += '<span class="keyword-suggestion">' + value + '</span>';
			        });

			        suggestionsHTML += '</div>';

			        // Replace or insert suggestions HTML
			        if ($('.et__product_ajax_search_keyword_suggestions').length) {
			            $('.et__product_ajax_search_keyword_suggestions').replaceWith(suggestionsHTML);
			        } else {
			            $(suggestionsHTML).insertAfter($('.et__product_ajax_search.embed'));
			        }

			    } else {
			        console.log("No suggestions found.");
			    }
			}


			function handleProductSearch(query,activeFilters,baseURL){
		        let form  = query.parent();

		        form.addClass('loading');

		        if (form.find('a').length) {
		        	form.attr('style','--loading-offset-value:'+form.find('a').outerWidth()+'px');
		        } else {
		        	form.removeAttr('style');
		        }

		        $('#loop-products .products').html('');
		        $('#loop-products .woocommerce-pagination').remove();
		        
		        clearTimeout(query.data('timeout')); // Clear any previously set timeouts
		        query.data('timeout', setTimeout(function() {
		            let inputValue = query.val().trim(); // Get the input value

		            if (inputValue.length) {
			            activeFilters['s'] = inputValue;
			            baseURL['s']   = inputValue;
			            ajaxProductFilter(activeFilters, baseURL);
		            } else {

						delete activeFilters['s'];
						delete baseURL['s'];

		            	ajaxProductFilter(activeFilters, baseURL);
		            }

		        }, 500)); // 500ms delay after the last keyup/input event
			}

		/* Active clear functions
		----*/

			function clearActiveWidgetFromUrl(clearUrlData,clearLink){
				if (Object.keys(clearUrlData).length != 0) {

					clearLink += '?';

				    // Get all keys of the object
				    const keys = Object.keys(clearUrlData);

				    // Iterate through each key
				    keys.forEach(function(key, index) {
				        // Append key and value to clearLink
				        clearLink += key + '=' + clearUrlData[key];

				        // Check if it's not the last element
				        if (index < keys.length - 1) {
				            clearLink += '&'; // Add '&' between elements
				        }
				    });
			   	}

			   	return clearLink;
			}

			function isActiveWidgetInUrl(url,value){
				if(typeof(value) != "undefined"){
					return value.split(',').some(item => url.includes(item));
				}
				return false;
			}

			function appendActiveFilter(label,activeFilter,clearLink,$class=""){

				let activeFilterLabel = Array.isArray(activeFilter) ? activeFilter[0] : activeFilter;
				let activeFilterSlug  = Array.isArray(activeFilter) ? activeFilter[1] : '';

				if ($('#loop-products ul.products').length) {

					if (!$('.active-filters').length) {
						$('<div class="active-filters original"></div>')
						.insertBefore($('#loop-products ul.products'));

						$('.shop-widgets').prepend($('<div class="active-filters sidebar"></div>'));

					}

					if (!$('.clear-all-filters').length && $('.active-filters.original a').length == 1) {
						$('.active-filters')
						.prepend($('<a class="clear-all-filters" href="'+copt.shopLink+'" title="'+copt.strings.widgetClearAll+'"><span class="remove"></span>'+copt.strings.widgetClearAll+'</a>'))
					}


					let html = '<a class="'+$class+'" href="'+clearLink+'" title="'+copt.strings.widgetClear+'">';
							html += '<span class="remove"></span>';
							html += label+': '+activeFilterLabel;
							html += '</a>';

					if ($('.active-filters').find('a:contains("'+label+'")').length) {
						$('.active-filters').find('a:contains("'+label+'")')
						.replaceWith(html);
					} else {
						$('.active-filters').append(html);
					}

					if ($class == "category" && $('.et__product_ajax_search').length) {

						html = '<a class="'+$class+'" href="'+clearLink+'" data-slug="'+activeFilterSlug+'" title="'+copt.strings.widgetClear+'">';
							html += '<span class="remove"></span>';
							html += activeFilterLabel;
							html += '</a>';

						if ($('.et__product_ajax_search').children('a.category').length) {
							$('.et__product_ajax_search').children('a.category')
							.replaceWith(html);
						} else {
							$('.et__product_ajax_search').prepend(html);
						}
					}

				} else if ($class == "category" && $('.et__product_ajax_search').length) {

					let html = '<a class="'+$class+'" href="'+clearLink+'" data-slug="'+activeFilterSlug+'" title="'+copt.strings.widgetClear+'">';
						html += '<span class="remove"></span>';
						html += label+': '+activeFilterLabel;
						html += '</a>';

					html = '<a class="'+$class+'" href="'+clearLink+'" data-slug="'+activeFilterSlug+'" title="'+copt.strings.widgetClear+'">';
						html += '<span class="remove"></span>';
						html += activeFilterLabel;
						html += '</a>';

					if ($('.et__product_ajax_search').children('a.category').length) {
						$('.et__product_ajax_search').children('a.category')
						.replaceWith(html);
					} else {
						$('.et__product_ajax_search').prepend(html);
					}
				}
			}

			function activeWidgetClear(currentUrl){

				const currentUrlAttrs = currentUrl.split('?').pop();
				const currentUrlData  = {};

				currentUrlAttrs.split('&').forEach(function(value,index){
					let attribute = value.split('=');
					if (typeof(attribute[1]) != "undefined") {
						currentUrlData[attribute[0]] = attribute[1];
					}
				});

				$('.widget_product_categories').each(function(){
					
					let $this = $(this),
						title = $this.find('.widget_title');

					let active = false;
					let activeSlug = false;
					let activeValue = false;

					if ($this.find('select').length && $this.find('select').val() != '') {
						active = $this.find('select option[value="'+$this.find('select').val()+'"]').text().trim();
						activeValue = $this.find('select').val();
					} else if($this.find('.current-cat').length) {
						active = $this.find('.current-cat > a').attr('title');
						activeSlug = $this.find('.current-cat > a').attr('data-slug');
						activeValue = $this.find('.current-cat > a').attr('href');
					}

					if(title.find('.clear').length && (activeValue == false || isActiveWidgetInUrl(currentUrl,activeValue) == false)) {
						title.find('.clear').remove();
						$this.find('select').val('').trigger('change.select2');
						$this.find('.current-cat').removeClass('current-cat');
					} else if (active && active.length) {

						let clearUrlData = Object.assign({}, currentUrlData);

						if (Array.isArray(active)) {active = active.join(', ')}

						let clearLink = clearActiveWidgetFromUrl(clearUrlData,copt.shopLink);

						appendActiveFilter(copt.categoriesLabel,[active,activeSlug],clearLink,'category');

						if (title.find('.clear').length === 0) {
							title.append('<a href="'+clearLink+'" class="clear">'+copt.strings.widgetClear+'</a>');
						} else {
							title.find('.clear').replaceWith('<a href="'+clearLink+'" class="clear">'+copt.strings.widgetClear+'</a>');
						}

					}

				});

				$('.woocommerce-widget-layered-nav').each(function(){
					
					let $this  = $(this);

					let title     = $this.find('.widget_title'),
						clearLink = '#';

					let active = false;
					let activeValue = false;

					if ($this.find('select').length) {

						var value = $this.find('select').val();
						active = (typeof value === 'string' ? value.trim() : value) || false;

						activeValue = active;

						if (Array.isArray(active)) {
							if (active.length == 0 || (active.length == 1 && active[0] == '')) {
								active = false;
								activeValue = false;
							} else {
								active = active.map(value => $this.find('select option[value="'+value+'"]').text()).join(', ');
								activeValue = activeValue.join(',');
							}
						} else if(active) {
							active = $this.find('select option[value="'+$this.find('select').val()+'"]').text();
							activeValue = $this.find('select').val();
						}

					} else {

						if ($this.find('.chosen a').length > 1) {
							active = multipleChoosenLayeredNav($this.find('.chosen a'));
							activeValue = $this.find('.chosen a').map(function() {
							    return $(this).attr('data-term');
							}).get().join(',');
						} else {
							active = $this.find('.chosen a').text();
							activeValue = $this.find('.chosen a').attr('data-term');
						}
					}

					if(title.find('.clear').length && (activeValue == false || isActiveWidgetInUrl(currentUrl,activeValue) == false)) {
						title.find('.clear').remove();
						$this.find('select').val(false).trigger('change.select2');
						$this.find('.chosen').removeClass('chosen');
					} else if (active && active.length) {

						let activeAttribute = $this.attr('data-attribute');
						let clearUrlData    = Object.assign({}, currentUrlData);

						if('filter_' + activeAttribute in clearUrlData){delete clearUrlData['filter_' + activeAttribute];}
					    if('query_type_' + activeAttribute in clearUrlData){delete clearUrlData['query_type_' + activeAttribute];}

					    if (Array.isArray(active)) {active = active.join(', ')}

						let clearLink = clearActiveWidgetFromUrl(clearUrlData,window.location.origin + window.location.pathname);
						let label = $this.attr('data-attribute-label') ? $this.attr('data-attribute-label') : title.text();

						appendActiveFilter(label,active,clearLink,activeAttribute);

						if (title.find('.clear').length === 0) {
							title.append('<a href="'+clearLink+'" class="clear">'+copt.strings.widgetClear+'</a>');
						} else {
							title.find('.clear').replaceWith('<a href="'+clearLink+'" class="clear">'+copt.strings.widgetClear+'</a>');
						}
					}

				});

				if (
					currentUrl.indexOf('min_price') != -1 ||
					currentUrl.indexOf('max_price') != -1
				) {
					$('.widget_price_filter').each(function(){
						let $this = $(this),
							title = $this.find('.widget_title'),
							active = [];

						let min_price = currentUrlData['min_price'],
							max_price = currentUrlData['max_price'];

						switch(copt.currencyPosition){
							case 'left':
								min_price = copt.currencySymbol + min_price;
								max_price = copt.currencySymbol + max_price;
							break
							case 'left_space':
								min_price = copt.currencySymbol + ' ' + min_price;
								max_price = copt.currencySymbol + ' ' + max_price;
							break
							case 'right':
								min_price = min_price + copt.currencySymbol;
								max_price = max_price + copt.currencySymbol;
							break
							case 'right_space':
								min_price = min_price + ' ' + copt.currencySymbol;
								max_price = max_price + ' ' + copt.currencySymbol;
							break
						}

						active.push(min_price);
						active.push(max_price);

						if (active.length) {

							let clearLink = '#';
							let clearUrlData = Object.assign({}, currentUrlData);

							delete clearUrlData['min_price'];
						    delete clearUrlData['max_price'];

							clearLink = clearActiveWidgetFromUrl(
								clearUrlData,
								window.location.origin + window.location.pathname
							);

							appendActiveFilter(copt.strings.priceLabel,active.join(' - '),clearLink,'price');

							if (title.find('.clear').length === 0) {
								title.append('<a href="'+clearLink+'" class="clear">'+copt.strings.widgetClear+'</a>');
							} else {
								title.find('.clear').replaceWith('<a href="'+clearLink+'" class="clear">'+copt.strings.widgetClear+'</a>');
							}
						}

					});
				} else {
					$('.widget_price_filter').each(function(){
						$(this).find('.widget_title .clear').remove();
					});
				}

				if (currentUrl.indexOf('rating_filter') != -1) {
					$('.widget_rating_filter').each(function(){

						let $this     = $(this);

						let title     = $this.find('.widget_title'),
							clearLink = '#';

						let active = false;

						if (typeof(currentUrlData['rating_filter']) != "undefined" && currentUrlData['rating_filter'] != null) {
							active = currentUrlData['rating_filter'];
						}

						if(title.find('.clear').length && (active == false || isActiveWidgetInUrl(currentUrl,active) == false)) {

							title.find('.clear').remove();
							$this.find('.chosen').removeClass('chosen');
						} else if (active) {

							
							let clearLink = '#';
							let clearUrlData = Object.assign({}, currentUrlData);

							delete clearUrlData['rating_filter'];
							
							clearLink = clearActiveWidgetFromUrl(
								clearUrlData,
								window.location.origin + window.location.pathname
							);

							appendActiveFilter(
								title.contents()
							    .filter(function() {
							        return this.nodeType === Node.TEXT_NODE;
							    }).text(),
								active,
								clearLink,
								'rating'
							);

							if (title.find('.clear').length === 0) {
								title.append('<a href="'+clearLink+'" class="clear">'+copt.strings.widgetClear+'</a>');
							} else {
								title.find('.clear').replaceWith('<a href="'+clearLink+'" class="clear">'+copt.strings.widgetClear+'</a>');
							}
							
						}

					});
				} else {
					$('.widget_rating_filter').each(function(){
						$(this).find('.widget_title .clear').remove();
						$(this).find('.chosen').removeClass('chosen');
					});
				}


				if (currentUrl.indexOf('s=') != -1 && currentUrl.indexOf('s=1') === -1) {

					let clearLink = '#';
					let clearUrlData = Object.assign({}, currentUrlData);

					delete clearUrlData['s'];
					
					clearLink = clearActiveWidgetFromUrl(
						clearUrlData,
						window.location.origin + window.location.pathname
					);
					
					appendActiveFilter(
						copt.strings.searchLabel,
					    decodeURIComponent(currentUrlData['s'].replace('+', ' ')),
					    clearLink,
					    'search'
					);

				}

			}
		
		/* Widget display handle
		----*/

			function handleCategoryWidgetDisplay(atts) {

				let activeParams = getUrlParams();

				if (
					!atts ||
					!Array.isArray(atts.categoryTerms) ||
					!atts.categoryTerms.length
				) {
					return;
				}

				let categoryTerms   = atts.categoryTerms;
				let baseURL         = atts.baseURL || '';
				let allowedTermIds  = [];
				let termsMap        = {};
				let termsBySlug     = {};
				let childrenMap     = {};

				$.each(categoryTerms, function(index, term) {
					let termId   = String(term.term_id);
					let slug     = String(term.slug || '');
					let parentId = parseInt(term.parent, 10) > 0 ? String(term.parent) : '';

					termsMap[termId] = term;

					if (slug) {
						termsBySlug[slug] = term;
					}

					if (parentId) {
						if (!childrenMap[parentId]) {
							childrenMap[parentId] = [];
						}
						childrenMap[parentId].push(termId);
					}
				});

				function getActiveCategorySlugFromUrl(url) {
					if (!url) {
						return '';
					}

					let cleanUrl = String(url).replace(/\/+$/, '');
					let matches  = cleanUrl.match(/\/product-category\/(.+)$/i);

					if (!matches || !matches[1]) {
						return '';
					}

					let parts = matches[1].split('/').filter(Boolean);

					if (!parts.length) {
						return '';
					}

					return decodeURIComponent(parts[parts.length - 1]);
				}

				function collectParentIds(termId) {
					let currentId = String(termId);

					while (currentId && termsMap[currentId]) {
						allowedTermIds.push(currentId);

						let parentId = parseInt(termsMap[currentId].parent, 10);
						currentId = parentId > 0 ? String(parentId) : '';
					}
				}

				function collectChildIds(termId) {
					allowedTermIds.push(String(termId));

					if (!childrenMap[termId] || !childrenMap[termId].length) {
						return;
					}

					$.each(childrenMap[termId], function(index, childId) {
						collectChildIds(String(childId));
					});
				}

				let activeCategorySlug = getActiveCategorySlugFromUrl(baseURL);
				let activeCategoryTerm = activeCategorySlug && termsBySlug[activeCategorySlug]
					? termsBySlug[activeCategorySlug]
					: null;

				if (activeCategoryTerm) {
					let activeTermId = String(activeCategoryTerm.term_id);

					// Current category + all parents
					collectParentIds(activeTermId);

					// Current category + all children
					collectChildIds(activeTermId);
				} else {
					$.each(categoryTerms, function(index, term) {
						allowedTermIds.push(String(term.term_id));
					});
				}

				allowedTermIds = [...new Set(allowedTermIds)];

				$('.widget_product_categories').each(function() {

					let $widget = $(this);

					// LIST MODE
					$widget.find('.cat-item').addClass('hidden');

					$.each(categoryTerms, function(index, term) {

						let termId = String(term.term_id);
						let $item  = $widget.find('.cat-item-' + termId);

						if (!$item.length) {
							return;
						}

						if (allowedTermIds.includes(termId)) {
							$item.removeClass('hidden');
						}

						let $count = $item.find('> .count');

						if ($count.length) {
							$count.text('(' + term.count + ')');
						}
					});

					// Hide toggle if all child items are hidden
					$widget.find('.cat-parent').each(function() {
						let $parent   = $(this);
						let $children = $parent.children('.children').children('.cat-item');
						let $toggle   = $parent.children('.cat-toggle');

						if (!$toggle.length) {
							return;
						}

						if (!$children.length) {
							$toggle.addClass('hidden');
							return;
						}

						let visibleChildren = $children.not('.hidden').length;

						if (visibleChildren === 0) {
							$toggle.addClass('hidden');
						} else {
							$toggle.removeClass('hidden');
						}
					});

					// SELECT MODE
					let $select = $widget.find('select');

					if ($select.length) {
						$select.find('option').each(function() {

							let $option = $(this);
							let value   = String($option.attr('value') || '');

							if (!value) {
								$option.prop('disabled', false);
								return;
							}

							let term = termsMap[value];

							if (!term) {
								return;
							}

							if (allowedTermIds.includes(value)) {
								$option.prop('disabled', false);
							} else {
								$option.prop('disabled', true);
							}

							let text = $option.text();
							text = text.replace(/\s*\(\d+\)\s*$/, '').trim();
							$option.text(text + ' (' + term.count + ')');
						});
					}

				});
			}

			function handleAttributeWidgetDisplay(atts){

				$('.shop-widgets .widget[data-attribute]').each(function(){
					$(this).addClass('hidden');
				});

				Object.entries(atts['attributeTerms']).forEach(([taxonomy, terms]) => {

	        		let taxonomy_name = taxonomy.replace(/^pa_/, "");

	        		let widget = $('.widget[data-attribute="'+taxonomy_name+'"]');

					if (widget.length) {

						let active = false;

						let displayType = widget.attr('data-display-type'),
							queryType   = widget.attr('data-query-type'),
							dataCount   = widget.attr('data-count');

						if ('filter_'+taxonomy_name in atts['activeFilters']) {
							active = atts['activeFilters']['filter_'+taxonomy_name].split(',');
						}

						if (terms) {

							let html = '';

							terms.forEach(function(value){

								let termObj = value,
									slug    = termObj['slug'],
									label   = termObj['name'],
									count   = termObj['count'];

								if (displayType == 'dropdown') {

									let optAttr = [
										'value="'+slug+'"',
									];

									if (active && active.includes(slug)) {
										optAttr.push('selected');
										optAttr = optAttr.filter(item => item !== 'disabled');
									}

									html += '<option '+optAttr.join(' ')+'>'+label+'</option>';

								} else {

									let liClass = [
										'woocommerce-widget-layered-nav-list__item',
										'wc-layered-nav-term'
									]

									if (active && active.includes(slug)) {
										liClass.push('chosen');

										if ('or' == queryType) {
											count = getItemCountBySlug(terms, slug); 
										}

									}

									html += '<li class="'+liClass.join(' ')+'">';
										
										html += '<a rel="nofollow" href="'+atts['termLinkOrigin']+'filter_'+taxonomy_name+'='+slug;

										if ('or' == queryType) {html += 'query_type_'+taxonomy_name+'=or';}

										html += '"';

										html += 'data-term="'+slug+'" title="'+label+'">';

											if ('image_list' == displayType && 'img' in termObj) {
												html += '<img src="'+termObj['img']+'" alt="'+label+'" title="'+label+'" class="term-image">';
											} else if('color' == displayType){
												if ('color' in termObj) {
													html += '<span style="background-color:'+termObj['color']+'" class="term-color"></span>';
												} else if('color-light' in termObj){
													html += '<span style="background-color:'+termObj['color-light']+'" class="term-color light"></span>';
												} else {
													html += '<span class="term-color empty"></span>';
												}
											}

											html += label;
										html += '</a>';

										if(dataCount == 1){html += ' <span class="count">('+count+')</span>';}

									html += '</li>';

								}

							});

							if (html.length) {

							    let $html = $('<div>').html(html); // Wrap in a jQuery object for manipulation

							    if (displayType == 'dropdown') {

								  let $select = widget.find('select');

								  let $options = $html.find('option');
								  let $selected = $options.filter(':selected');
								  let $notSelected = $options.not(':selected');

								  // Get empty option from the real select, or create one
								  let $emptyOption = $select.find('option[value=""]').first();
								  $emptyOption = $emptyOption.length
								    ? $emptyOption.clone()
								    : $('<option value=""/>'); // you can set text too: .text('')

								  // Rebuild options: empty first, then selected, then not selected
								  $select
								    .empty()
								    .append($emptyOption)
								    .append($selected)
								    .append($notSelected)
								    .trigger('change.select2');

								} else {
							        // Move items with .chosen class to the top
							        let $items = $html.find('li');
							        let $chosen = $items.filter('.chosen');
							        let $notChosen = $items.not('.chosen');

							        widget.find('.woocommerce-widget-layered-nav-list')
							        .html('')
							        .prepend($notChosen)
							        .prepend($chosen)
							        .scrollTop(0);


							    }
							}

							widget.removeClass('hidden');

						} else {
							widget.addClass('hidden');
						}

					}

				});

	        	$('.woocommerce-widget-layered-nav-list').each(function(){
					layeredNavListScroll($(this));
				});

			}

			function handlePriceWidgetDisplay(priceFilter,activeFilters){

				let priceSlider = $(".price_slider");

		        if (priceSlider.length) {

		        	if (priceSlider.hasClass("ui-slider")) {
		            	priceSlider.slider( "destroy" );
		            }

		            let min_price = parseFloat(priceFilter['min_price']),
						max_price = parseFloat(priceFilter['max_price']),
						step      = parseFloat($( '.price_slider_amount' ).attr( 'data-step' )) || 1;

					['min_price', 'max_price'].forEach(key => {
					    if (key in activeFilters) {
					        const value = parseFloat(activeFilters[key]);
					        if (key === 'min_price' && value < min_price) {
					            min_price = value;
					        } else if (key === 'max_price' && value > max_price) {
					            max_price = value;
					        }
					    }
					});

					$( '.price_slider' ).slider({
						range: true,
						animate: true,
						min: min_price,
						max: max_price,
						step: step,
						values: [ min_price, max_price ],
						create: function() {
							$( '.price_slider_amount #min_price' ).val( min_price );
							$( '.price_slider_amount #max_price' ).val( max_price );

							$( '.price_label .from' ).text( min_price );
							$( '.price_label .to' ).text( max_price );

							$( document.body ).trigger( 'price_slider_create', [ min_price, max_price ] );
						},
						slide: function( event, ui ) {
							$( '.price_slider_amount #min_price' ).val( ui.values[0] );
							$( '.price_slider_amount #max_price' ).val( ui.values[1] );

							$( document.body ).trigger( 'price_slider_slide', [ ui.values[0], ui.values[1] ] );
						},
						change: function( event, ui ) {

							$( document.body ).trigger( 'price_slider_change', [ ui.values[0], ui.values[1] ] );
						}
					});

		        }

			}

			function handleRatingWidgetDisplay(ratingFilter){

				let widget = $(".shop-widgets .widget_rating_filter");

		        if (widget.length) {
		        	widget.find('ul').html(ratingFilter);
		        	widget.removeClass('hidden');
		        } else {
		        	widget.addClass('hidden');
		        }

			}

			function handleTitleSection(params){

				if (params['response']['current_results_title']) {
					$('.title-section .page-title').text(params['response']['current_results_title']);
				}

				if (params['response']['breadcrumbs']) {
					$('.et-breadcrumbs').html(params['response']['breadcrumbs'])
				}

			}

		/* Product filter
		----*/

			function ajaxProductFilter(activeFilters,filterUrl,updateHistory = true){

				$('#wrap').addClass('loading');

				let activeParams = getUrlParams();
				let baseURL = createBaseUrl(filterUrl);
				let paged = 1;

				let filterKeywords = copt.ajaxFilterKeywrods;

				if (filterKeywords.length) {

					filterKeywords.split(',').map(item => item.trim()).forEach((value) => {
						if (activeFilters.hasOwnProperty(value)) {
							delete activeFilters[value];
						}
					});

				}

				if ('paged' in activeFilters) {
					paged = activeFilters['paged'];
					delete activeFilters['paged'];
				} else {
					baseURL = baseURL.replace(/page\/\d+\/?/, '');
				}

				if (typeof(productIndex) != "undefined" && productIndex) {

		            let lang = currentLang;

					let params = {
		            	'active_filters':activeFilters,
		            	'base_url':baseURL.split('?').shift(),
		            	'url_params':(baseURL.includes('?') ? baseURL.split('?').pop() : ''),
						'currency':copt.activeCurrency,
		            	'paged':paged,
		            };

		            let productsIndex   = productIndex.hasOwnProperty(lang) ? productIndex[lang] : productIndex['default'];

		            params['productIndex'] = productsIndex;

		            if (typeof(categoryIndex) != "undefined" && categoryIndex) {
						let categoriesIndex = categoryIndex.hasOwnProperty(lang) ? categoryIndex[lang] : categoryIndex['default'];
		            	params['categoryIndex'] = categoriesIndex;
		            }

		            if (typeof(templateStructure) != "undefined" && templateStructure) {
		            	params['templateStructure'] = templateStructure;
		            }

		            if (typeof(noProductsFound) != "undefined" && noProductsFound) {
		            	params['noProductsFound'] = noProductsFound;
		            }

		            if (typeof(banners) != "undefined" && banners) {
		            	params['banners'] = banners;
		            }

		            if (typeof(categoriesCarousel) != "undefined" && categoriesCarousel) {
		            	params['categoriesCarousel'] = categoriesCarousel;
		            }

				    let response = productFilterFromIndex(params);

				    if (response) {
					  
					    preAfterAjaxProductFilter(response,activeFilters,baseURL);
					    if (updateHistory) {
				    		updatepushState(baseURL,filterUrl);
				    	}
					    activeWidgetClear(baseURL);
					}

				} else if(addon) {

					$.ajax({
			            url: copt.ajaxUrl, // Built-in WordPress AJAX URL for the admin area
			            type: 'POST',
			            data: {
			            	'nonce':copt.productFilterNonce,
			            	'action':'et__product_filter',
			            	'active_filters':JSON.stringify(activeFilters),
			            	'base_url':baseURL.split('?').shift(),
			            	'url_params':(baseURL.includes('?') ? baseURL.split('?').pop() : ''),
			            	'lang':currentLang,
							'currency':copt.activeCurrency,
			            	'paged':paged
			            },
			            success: function(response) {

			            	response = response.data;

			            	console.log(response);

			                preAfterAjaxProductFilter(response,activeFilters,baseURL);
							if (updateHistory) {
					    		updatepushState(baseURL,filterUrl);
					    	}
							activeWidgetClear(baseURL);

			            },
			            error: function(xhr, status, error) {
			                console.log(error);
			            }
			        });

		        }

			}

			function preAfterAjaxProductFilter(response,activeFilters,baseURL){

				let params = {
	            	'response':response,
	            	'activeFilters':activeFilters,
	            	'baseURL':baseURL
	            };

				afterProductFilter(params);
			}

			function afterProductFilter(params){

	            let termLinkOrigin = params['baseURL']+(params['baseURL'].includes('?') ? '&' : '?');

				if (params['response']['products']) {

	            	$('#loop-products > .before-shop-loop').show();
	            	$('#loop-products > .woocommerce-notices-wrapper').show();

	            	$('.woocommerce-no-products-found').remove();
	            	$('.no-results-form').remove();
					$('.woocommerce-info').remove();
					$('.return-to-shop').remove();

	            	if (!$('#loop-products > ul').length) {
	            		$('#loop-products').append($('<ul class="products columns-4" />'));
	            	}

	            	$('#loop-products > ul').html(params['response']['products']);

	                if (params['response']['pagination']) {

						if  ($('.woocommerce-pagination').length) {
	                		$('.woocommerce-pagination').html(params['response']['pagination']);
						} else {
							$('#loop-products').append('<nav class="woocommerce-pagination">'+params['response']['pagination']+'</nav>');
						}

	                } else {
	                	$('.woocommerce-pagination').remove();
	                }

	                if (params['response']['found_results']) {
	                	if ($('.woocommerce-result-count').length) {
	                		$('.woocommerce-result-count').html(params['response']['found_results']);
	                	} else {
	                		$('<p class="woocommerce-result-count">'+params['response']['found_results']+'</p>')
	                		.insertBefore($('.woocommerce-ordering'));
	                	}
	                }


	                if (params['response']['price_filter']) {
				        handlePriceWidgetDisplay(params['response']['price_filter'],params['activeFilters']);
		            }

		            if (params['response']['rating_filter']) {
				        handleRatingWidgetDisplay(params['response']['rating_filter']);
		            } else {
						$(".shop-widgets .widget_rating_filter").addClass('hidden');
		            }

		            if (params['response']['product_terms']) {

		            	let productTerms = params['response']['product_terms'];
		            	let productCats  = 'product_cat' in productTerms ? productTerms['product_cat'] : [];

		            	delete productTerms['product_cat'];

		            	let atts = {
		            		'attributeTerms':productTerms,
		            		'activeFilters':params['activeFilters'],
		            		'termLinkOrigin':termLinkOrigin
		            	};

		            	handleAttributeWidgetDisplay(atts);

		            	if (productCats.length) {
		            		let atts = {
			            		'categoryTerms':productCats,
			            		'baseURL':params['baseURL'],
			            	};

			            	handleCategoryWidgetDisplay(atts);
		            	}

		            } else {
		            	$('.shop-widgets .widget[data-attribute]').each(function(){
							$(this).addClass('hidden');
						});
		            }

	            } else if(params['response']['not_found']) {
	            	
	            	$('#loop-products > .before-shop-loop').hide();
	            	$('#loop-products > .woocommerce-notices-wrapper').hide();
	            	$('#loop-products > ul').replaceWith(params['response']['not_found']);

	            	if (!$('.return-to-shop').length) {
	            		$('<a href="'+copt.shopLink+'" class="button return-to-shop medium">'+copt.strings.clearSelection+'</a>')
	            		.insertAfter($('#loop-products .woocommerce-info'));
	            	}

	            	$('.woocommerce-pagination').remove();

	            	$('.widget[data-query-type="or"] .chosen .count').text('(0)');

		            setTimeout(function () {
				        jQuery('.wpcf7-form').each(function () {
				            if (typeof wpcf7 !== "undefined" && typeof wpcf7.init === "function") {
				                try {
				                    wpcf7.init(this); // Initialize each form individually
				                } catch (error) {
				                    console.error("CF7 Init Error:", error);
				                }
				            }
				        });
				    }, 500);

				    if (params['activeFilters'].hasOwnProperty('s')) {
						getSpellingSuggestions(String(params['activeFilters']['s'].trim())).then(offerKeywordSuggestions);
					}
	            	
	            }

	            let foundResultsText;
	            let foundTotalClass = 'positive';

				if ('found_total' in params['response']) {
				    if (params['response']['found_total'] == 1) {
				        foundResultsText = copt.strings.foundResult.replace('##', 1);
				    } else if(params['response']['found_total'] == 0) {
				        foundTotalClass = 'negative';
				    	foundResultsText = copt.strings.foundResults.replace('##', 0);
				    } else {
				        foundResultsText = copt.strings.foundResults.replace('##', params['response']['found_total']);
				    }
				} else {
					foundTotalClass = 'negative';
				    foundResultsText = copt.strings.foundResults.replace('##', 0);
				}

            	if ($('.found-total').length) {
            		$('.found-total')
            		.removeClass('active')
            		.removeClass('first')
            		.removeClass('negative')
            		.removeClass('positive')
            		.html(foundResultsText);

            		setTimeout(function(){
            			$('.found-total')
            			.addClass('active')
            			.addClass(foundTotalClass);
            		},1);

            	} else {
            		$('<div class="found-total active first '+foundTotalClass+'">'+foundResultsText+'</div>')
            		.insertAfter($('.shop-widgets.sidebar-widget-area + .widget-area-shadow'));

            		$('.shop-widgets.sidebar-widget-area').addClass('has-found-total');
            	}

	            if (!params['activeFilters'].hasOwnProperty('s') && $('.woocommerce-ordering select[name="orderby"]').val() == 'relevance') {
	            	if ($('.woocommerce-ordering select[name="orderby"] option[value="'+copt.defaultSort+'"]').length) {
	            		$('.woocommerce-ordering select[name="orderby"]').val(copt.defaultSort)
	            	} else {
	            		$('.woocommerce-ordering select[name="orderby"] option[value="relevance"]').attr('value','menu_order').text(copt.strings.defaultSortLabel)
	            		$('.woocommerce-ordering select[name="orderby"]').val('menu_order');
	            	}
	            }

	            if (params['response']['banners']) {

	            	Object.entries(params['response']['banners']).forEach(([key, value]) => {
						if ($('.banner-area-'+key).length && value.length) {

							let $html    = $('<div>').html(value);
							let bannerID = $html.find('.banner').attr('id');

							if (!$('.banner-area-'+key).find('#'+bannerID).length) {
								$('.banner-area-'+key).append(value);
								lazyLoad(document.querySelector('.banner-area-'+key));
							}

						}
						
					});
	            }

	            if (params['activeFilters'].hasOwnProperty('category')) {

	            	if (params['response']['current_cat_data']) {
						renderCategoryDescription(params['response']['current_cat_data']);
	            	} else {
	            		renderCategoryDescription(params['activeFilters']['category']);
	            	}

	            	$('.shop-banner').each(function(){
	            		let $this = $(this);
	            		if (typeof($this.attr('data-categories')) != "undefined") {
		            		let categories = $this.attr('data-categories').split(',');
		            		if (!categories.includes(params['activeFilters']['category'])) {
		            			$this.remove();
		            		}
	            		}
	            	});
	            } else {
	            	$('.shop-banner[data-categories]').remove();
	            	$('.et__cat-bottom-description').remove();
	            }

	            if (params['response']['categories_carousel']) {

		            if (!$('.categories-carousel-container').length) {
		            	$(params['response']['categories_carousel'])
						.insertAfter($('.banner-area-shop-top'));
		            } else {
		            	$('.categories-carousel-container').replaceWith(params['response']['categories_carousel']);
		            }

					buildSwiperCarousel($('.categories-carousel-container'));
					lazyLoad(document.querySelector('.categories-carousel-container'));

					setTimeout(function(){
		    			$('.categories-carousel').find('.swiper-slide').removeClass('swiper-hidden');
		    		},50);

	            } else {
	            	$('.categories-carousel-container').remove();
	            }

	            handleTitleSection(params);
				
				$('#wrap').removeClass('loading');

				lazyLoad(document.querySelector('#loop-products > ul'));

				if ($('.active-filters').length) {
					$('.active-filters').html('');
					$('.et__product_ajax_search a.category').remove();
				}

				$('.et__product_ajax_search.embed').removeClass('loading');
				$('.et__product_ajax_search_keyword_suggestions').remove();

				$('.et__product_loop_gallery').each(function(){

			    	let $this = jQuery(this),
			    		opt   = {};

			    	opt['effect']  = 'fade';
			    	opt['nested']  = true;

			    	if ($this.find('.swiper-initialized').length) {
			    		return;
			    	}

					buildSwiperCarousel($this,opt);
			    });

				$('html, body').animate({
				    scrollTop: ($('#loop-products').length ? $('#loop-products') : $('.before-shop-loop')).offset().top
				}, 500);

			}

		/* Product index
		----*/

			function filterProductIndex(filterKey, filterVal, productIndex) {
			    let query = productIndex; // Default to original productIndex

			    switch(filterKey) {
			        case 'category':
			            query = query.filter(product =>
			                product.categories.some(category => category.slug === filterVal)
			            );
			            break;
			        
			        case 'orderby':
			            // Handle sorting only, not filtering
			            switch(filterVal) {
			                case 'menu_order':
			                    query = [...query].sort((a, b) => a.title.localeCompare(b.title));
			                    break;
			                case 'popular':
			                    query = [...query].sort((a, b) => 
								    b.total_sales - a.total_sales || 
								    new b.date_created - a.date_created || 
								    a.title.localeCompare(b.title)
								);
			                    break;
			                case 'reviews':

			                    query = [...query].sort((a, b) => {
								    // First, compare by rating (highest first)
								    return parseFloat(b.rating) - parseFloat(a.rating) ||
								           // If ratings are equal, compare date_created (newest first)
								           new Date(b.date_created) - new Date(a.date_created) ||
								           // If ratings and dates are equal, compare by title (A-Z)
								           a.title.localeCompare(b.title);
								});

			                    break;
			                case 'latest':
			                    query = [...query].sort((a, b) =>
									(b.date_created - a.date_created) ||
									((b.id || 0) - (a.id || 0))
								);
			                    break;
			                case 'price':
			                    query = [...query].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
			                    break;
			                case 'price-desc':
			                    query = [...query].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
			                    break;
			            }
			            break;
			        
			        case 'rating_filter':
			            query = query.filter(product => {
			                let rating = parseFloat(product.rating);
			                filterVal = parseFloat(filterVal);
			                return rating >= (filterVal - 0.5) && rating <= (filterVal + 0.5);
			            });
			            break;
			        
			        case 'min_price':
			            query = query.filter(product =>
			                parseFloat(product.price) >= parseFloat(filterVal)
			            );
			            break;

			        case 'max_price':
			            query = query.filter(product =>
			                parseFloat(product.price) <= parseFloat(filterVal)
			            );
			            break;

			        case 's':

			        	const searchInKeys = ['search_in_global'];

						let fuseKeys = [];

						searchInKeys.forEach(function(item){
							fuseKeys.push({name: item, weight: 0.4});
						})

			        	const fuse = new Fuse(query, {
						    keys: fuseKeys,
						    threshold:parseFloat(copt.threshold),
						    shouldSort:false,
							includeScore: true,
							ignoreLocation: true,
							useExtendedSearch: true,
						});

						query = fuse.search(String(filterVal).trim());
						query = query.map(item => item.item);

			        break;

			        default:
			            if (filterKey.startsWith('filter_')) {
						    const attributeKey = filterKey.replace('filter_', 'pa_');

						    const filterValues = filterVal
						        .split(',')
						        .map(v => v.trim())
						        .filter(Boolean);

						    query = query.filter(product => {
						        if (!product.attributes || !product.attributes[attributeKey]) {
						            return false;
						        }

						        return product.attributes[attributeKey].some(attr =>
						            filterValues.includes(attr.slug)
						        );
						    });
						}
			            break;
			    }

			    return query;
			}

			function productFilterFromIndex(filterParams){

				const activeFilters     = filterParams['active_filters'],
					  baseURL           = filterParams['base_url'],
					  paged             = filterParams['paged'],
					  productPerPage    = copt.productPerPage,
					  templateStructure = filterParams['templateStructure'],
					  noProductsFound   = filterParams['noProductsFound'],
					  categoriesCarousel = filterParams['categoriesCarousel'],
					  bannersLocations = filterParams['banners'];

				const wishlist = getCookie(copt.shopName+'-wishlist') ? getCookie(copt.shopName+'-wishlist').split(',') : [];
				const compare  = getCookie(copt.shopName+'-compare') ? getCookie(copt.shopName+'-compare').split(',') : [];

				if (!activeFilters.hasOwnProperty('orderby')) {
					activeFilters['orderby'] = copt.defaultSort;
				}

				let $return = {
	                'products'      : '',
	                'not_found'     : '',
	                'pagination'    : '',
	                'found_results' : '',
	            };

				/* Variables
	    		-------*/

	    			let raquo               = '<span class="arrow"></span>',
	        			breadcrumbs         = '<a href="'+window.location.origin+'">' +copt.homeTitle+ '</a> '+raquo+' ',
	        			currentResultsTitle = '';

	        	/* Breadcrumbs
	    		-------*/

		            if (activeFilters.hasOwnProperty('category')) {

		            	breadcrumbs += '<a href="' +copt.shopLink+ '">' +copt.shopTitle+ '</a> '+raquo+' ';

		            	if (filterParams.hasOwnProperty('categoryIndex')) {

			            	const categoryBreadcrumbs = getCategoryBreadcrumbs(filterParams['categoryIndex'], activeFilters['category']);
			            	if (categoryBreadcrumbs.length > 0) {
			            		categoryBreadcrumbs.forEach((category, index) => {
								    if (index === categoryBreadcrumbs.length - 1) {
								        breadcrumbs += '<span>' + category.name + '</span>';
								    } else {
								        breadcrumbs += '<a href="' + category.link + '">' + category.name + '</a> ' + raquo + ' ';
								    }
								});

								currentResultsTitle = categoryBreadcrumbs[categoryBreadcrumbs.length - 1].name;
			            	}

			            	let currentCatId = filterParams['categoryIndex'].map(product => {
							    if (product.slug == activeFilters['category']) {return product.id}
							    return false;
							}).filter(product => product !== false) // Remove null values

							if (currentCatId.length) {
								currentCatId = currentCatId[0];

								const currentCatChildren = filterParams['categoryIndex'].map(product => {
								    if (product.parent_id == currentCatId) {return product}
								    return false;
								}).filter(product => product !== false) // Remove null values

								if (
									copt.productCategoriesCarousel == 1 && 
		            				typeof(categoriesCarousel) != "undefined" &&
		            				currentCatChildren.length
								) {

									let childCatsList = rebuildCategoriesCarousel(currentCatChildren);

									let carouseTemplate = $('<div>').html(categoriesCarousel);

									carouseTemplate.find('.swiper-wrapper').html(childCatsList);

									$return['categories_carousel'] = carouseTemplate.html();

								}

							}

							

		            	}


		            } else {

		            	currentResultsTitle = copt.shopTitle;

		            	breadcrumbs += '<span>' +copt.shopTitle+ '</span>';

		            	if (
		            		copt.productCategoriesCarousel == 1 && 
		            		typeof(categoriesCarousel) != "undefined"
		            	) {
		            		$return['categories_carousel'] = categoriesCarousel;
		            	}

		            }

		        /* Banners
	    		-------*/

		            if (bannersLocations) {
		            	$return['banners'] = bannersLocations;
		            }

		        /* Query
	    		-------*/

		            let productIndex = filterParams['productIndex'];

					if (activeFilters) {

					    Object.entries(activeFilters).forEach(([filterKey, filterVal]) => {
					        productIndex = filterProductIndex(filterKey, filterVal, productIndex);
					    });

					}

					if (productIndex) {

						let productTerms = [];
						let priceFilter  = {};
						let pHTML        = '';

						const attributesList = productIndex.map(product => {
						    if (!product.hasOwnProperty('attributes')) return {};

						    let productAttributes = product.attributes;

							return Object.fromEntries(
						        Object.entries(productAttributes).filter(([key, _]) => key.startsWith('pa_'))
						    );

						});

						const categoriesList = productIndex.flatMap(product => {
						    if (!product.hasOwnProperty('categories') || !Array.isArray(product.categories)) {
						        return [];
						    }

						    return product.categories;
						});

						const startIndex = (paged - 1) * productPerPage;
						const endIndex = paged * productPerPage;

						const totalProducts = productIndex.length; // Total number of products
						const totalPages = Math.ceil(totalProducts / productPerPage); // Total pages

						for (let [index, product] of productIndex.entries()) {

							if (index >= startIndex && index < endIndex) {

								let template = $('<div>').html(templateStructure);
								let productClass = product['classes'];

								template.find('.product').attr('class',Object.values(productClass).join(' '));

								
								/* Image/Gallery
								----------------*/

									if (product.hasOwnProperty('gallery')) {

										let gallery = '';

										$(product.gallery.slice(0, 5)).each(function(index, image) {

											if (index == 6) {return}

										    let imageWidth  = parseFloat(image.width);
										    let imageHeight = parseFloat(image.height);

										    gallery += '<div class="swiper-slide item">';
										        gallery += '<a class="image-container" title="' + product.title + '" href="' + product.link + '">';
										            gallery += '<img ';

										            if (image.hasOwnProperty('lazy')) {
										                gallery += 'class="lazy" data-src="' + image.url + '" src="' + image.lazy + '"';
										            } else {
										                gallery += 'src="' + image.url + '"';
										            }

										            gallery += ' width="' + imageWidth + '" height="' + imageHeight + '" alt="' + image.alt + '" />';
										            gallery += '<svg viewBox="0 0 ' + imageWidth + ' ' + imageHeight + '"><path d="M0,0H' + imageWidth + 'V' + imageHeight + 'H0V0Z" /></svg>';
										        gallery += '</a>';
										    gallery += '</div>';

										});

										if (gallery.length) {

											let galleryHTML = '';

											galleryHTML += '<div id="icc-'+uniqueID()+'" class="swiper-container items-carousel-container et__product_loop_gallery" data-cl-d="1" data-cl-lp="1" data-cl-tbl="1" data-cl-tb="1" data-cl-mb="1" data-cl-mbs="1" data-gap-d="0" data-gap-lp="0" data-gap-tb="0" data-gap-mb="0" data-gap-mbs="0" data-arrows-pos="side" data-nav-type="pagination" data-autoplay="false" data-autoheight="true" data-overflow="false" data-stagger="false" data-inc="0">';
												
												galleryHTML += '<div class="swiper">';
													galleryHTML += '<div class="swiper-wrapper items-carousel">';
														galleryHTML += gallery;
													galleryHTML += '</div>';
												galleryHTML += '</div>';

											galleryHTML += '</div>';

											template.find('.et__product_loop_gallery').remove();
											template.find('.image-container').remove();
											template.find('.product').prepend(galleryHTML);
										}

										if (product.hasOwnProperty('recommended')) {

											let recommended = '<span title="'+copt.strings.recommended+'" class="label-recommended"></span>';

											template.find('.product').prepend(recommended);
										}

									} else if(product.hasOwnProperty('image')) {

										let image = '';
										let imageWidth  = parseFloat(product.image.width);
										let imageHeight = parseFloat(product.image.height);

	                					image += '<img ';

	                					if (product.image.hasOwnProperty('lazy')) {
	                						image += 'class="lazy" data-src="'+product.image.url+'" src="'+product.image.lazy+'"';
										} else {
	                						image += 'src="'+product.image.url+'"';
										}

	                					image += ' width="'+imageWidth+'" height="'+imageHeight+'" alt="'+product.image.alt+'" />';
	            						image += '<svg viewBox="0 0 '+imageWidth+' '+imageHeight+'"><path d="M0,0H'+imageWidth+'V'+imageHeight+'H0V0Z" /></svg>';

										template.find('.image-container')
										.attr('title',product.title)
										.attr('href',product.link)

										if (image.length) {
											template.find('.image-container').html(image);
										}

										if (product.hasOwnProperty('recommended')) {

											let recommended = '<span title="'+copt.strings.recommended+'" class="label-recommended"></span>';

											template.find('.image-container')
											.prepend(recommended);
										}

									}

								/* Labels
								----------------*/

									if (
										product.hasOwnProperty('labels') && 
										Object.keys(product.labels).length > 0
									) {
										if (product.labels.hasOwnProperty('sale')) {
											template.find('.woo-loop-product__labels')
											.append('<span class="onsale">'+product.labels.sale.label+'</span>');
										}
										if (product.labels.hasOwnProperty('label_1')) {

											let label_1 = '<span class="label"';

											if (product.labels.label_1.hasOwnProperty('color')) {
												label_1 += 'style="background-color:'+product.labels.label_1.color+';"';
											}

											label_1 +='>'+product.labels.label_1.label+'</span>';

											template.find('.woo-loop-product__labels')
											.append(label_1);
										}
										if (product.labels.hasOwnProperty('label_2')) {

											let label_2 = '<span class="label"';

											if (product.labels.label_2.hasOwnProperty('color')) {
												label_2 += 'style="background-color:'+product.labels.label_2.color+';"';
											}

											label_2 +='>'+product.labels.label_2.label+'</span>';

											template.find('.woo-loop-product__labels')
											.append(label_2);
										}
									} else {
										template.find('.woo-loop-product__labels').remove();
									}

								/* WCV
								----------------*/

									if (template.find('.quick-view-toggle').length) {
										template.find('.quick-view-toggle')
										.attr('data-product',product.id);
									}

									if (template.find('.wishlist-toggle').length) {
										template.find('.wishlist-toggle')
										.removeClass('active')
										.attr('data-product',product.id);

										let wishlistTitle = copt.strings.wishlistAdd;

										if (typeof(wishlist) != "undefined" && wishlist.map(String).includes(String(product.id))) {
											wishlistTitle = copt.strings.wishlistIn;
											template.find('.wishlist-toggle').addClass('active');
										}

										template.find('.wishlist-toggle')
										.attr('title',wishlistTitle);

									}

									if (template.find('.compare-toggle').length) {
										template.find('.compare-toggle')
										.attr('data-product',product.id);

										let compareTitle = copt.strings.compareAdd;

										if (typeof(compare) != "undefined" && compare.map(String).includes(String(product.id))) {
											compareTitle = copt.strings.compareIn;
											template.find('.compare-toggle').addClass('active');
										}

										template.find('.compare-toggle')
										.attr('title',compareTitle);

									}

									if (template.find('.whatsapp-chat-button').length) {

										let pTitle = [copt.strings.whatsappTitle];

										if (product.title) {
											pTitle.push('"'+product.title+'"');
										}

										if (product.sku) {
											pTitle.push(copt.strings.SKU+' '+product.sku);
										}

										pTitle = encodeURIComponent(pTitle.join(' '))

										let whatsappLink = 'https://wa.me/' + copt.whatsappNumber + '?text=' + pTitle;

										template.find('.whatsapp-chat-button').attr('href',whatsappLink);

									}

								/* Meta
								----------------*/

									template.find('.woo-product__brand').remove();

									const brandAttribute = product.hasOwnProperty('attributes') && product.attributes.hasOwnProperty('pa_'+copt.brand) 
								    ? product.attributes['pa_'+copt.brand] 
								    : false;


									if (brandAttribute) {


										let brandsOutput = '';

										brandAttribute.forEach(function(term){
											if (term.hasOwnProperty('img')) {
												brandsOutput += '<a class="woo-product__brand" title="'+term.name+'" href="'+term.link+'">';
											      brandsOutput += '<img class="attribute-term-image" width="100" src="'+term.img+'" alt="'+term.name+'">';
											    brandsOutput += '</a>';
										    }
										});

										if (brandsOutput.length) {
											template.find('.woo-loop-product__meta').prepend(brandsOutput);
										}

									}

									if (product.hasOwnProperty('sku') && product.sku) {

										if (template.find('.woo-loop-product__meta > .sku').length) {
											template.find('.woo-loop-product__meta > .sku')
											.html(copt.strings.SKU+' '+product.sku);
										} else {
											template.find('.woo-loop-product__meta')
											.append('<p class="sku">'+copt.strings.SKU+' '+product.sku+'</p>');
										}

									} else {
										template.find('.woo-loop-product__meta > .sku').remove();
									}

									if (product.hasOwnProperty('rating')) {

										let productRating = parseFloat(product.rating).toFixed(1);

										if (template.find('.woo-loop-product__meta > .rating').length) {
											template.find('.woo-loop-product__meta > .rating')
											.html(productRating+' / '+product.review_count);
										} else {
											template.find('.woo-loop-product__meta')
											.append('<p class="rating">'+productRating+' / '+product.review_count+'</p>');
										}

									} else {
										template.find('.woo-loop-product__meta > .rating').remove();
									}

								/* Title
								----------------*/

									if (product.hasOwnProperty('title')) {
										template.find('.woo-loop-product__title > a')
										.attr('title',product.title)
										.attr('href',product.link)
										.html(product.title);
									} else {
										template.find('.woo-loop-product__title').remove();
									}

								/* Attributes
								----------------*/

									if (product.hasOwnProperty('attributes')) {

										template.find('.woo-product__attributes h3').text(copt.strings.productInfo);

										let attrUl = '<ul>';

										let index = 1;

										Object.entries(product.attributes).forEach(([attributeName, AttributeObjList]) => {
											
											if (index < 8) {
												attrUl += '<li>';
											}

											if (attributeName.startsWith('pa_')) {

												product.attributes[attributeName].forEach(termObj => {

													if (index < 8) {
														attrUl += '<span class="attr-label">'+termObj.taxonomy+':</span>&nbsp;';
														attrUl += '<span class="attr-value">'+termObj.name+'</span>';
													}
										            
										        });
											} else {
												if (index < 8) {
													attrUl += '<span class="attr-label">'+AttributeObjList.label+':</span>&nbsp;';
													attrUl += '<span class="attr-value">'+AttributeObjList.values.join(', ')+'</span>';
												}
											}

											if (index < 8) {
												attrUl += '</li>';
											}

											index++;

										});

										attrUl += '</ul>';

										$(attrUl).insertBefore(template.find('.woo-product__attributes .details'));
										template.find('.woo-product__attributes .details')
										.text(copt.strings.details+'...')
										.attr('title',copt.strings.details)
										.attr('href',product.link);
									} else {
										template.find('.woo-product__attributes').remove();
									}

								/* Product footer
								----------------*/

									if (product.hasOwnProperty('price_html')) {

										// Price
									      let priceHtml = product.price_html || '';
									      if (
									        currency &&
									        product.prices_by_currency &&
									        Object.prototype.hasOwnProperty.call(product.prices_by_currency, currency)
									      ) {
									        priceHtml = product.prices_by_currency[currency] || priceHtml;
									      }

										if (template.find('.woo-loop-product__footer .price').length) {
											template.find('.woo-loop-product__footer .price').html(priceHtml);
										} else {
											template.find('.woo-loop-product__footer').prepend('<span class="price">'+priceHtml+'</span>');
										}
									}


									template.find('.woo-loop-product__footer .button')
									.attr('href',product.link)
									.text(product.add_to_cart_text);

									if (product.hasOwnProperty('title')) {
										template.find('.woo-loop-product__footer .button')
										.attr('title',copt.strings.productReadmore+': "'+product.title+'"');
									}

									if (product.hasOwnProperty('type') && product.type == "variable") {
										template.find('.woo-loop-product__footer .button')
										.attr('title',copt.strings.productVariableLinkLabel+': "'+product.title+'"')
										.removeClass('product_type_simple')
										.removeClass('ajax_add_to_cart')
										.removeClass('product_type_external')
										.addClass('product_type_variable')
									}

									if (
										product.hasOwnProperty('add_to_cart_url') && 
										product.hasOwnProperty('type') && 
										product.type == "simple"
									) {

										template.find('.woo-loop-product__footer .button')
										.attr('href',product.add_to_cart_url)
										.attr('data-product_id',product.id)
										.removeClass('product_type_variable')
										.removeClass('product_type_external')
										.text(product.add_to_cart_text);

										if (product.hasOwnProperty('title')) {
											template.find('.woo-loop-product__footer .button')
											.attr('title',product.add_to_cart_text+': "'+product.title+'"');
										}

										if (product.hasOwnProperty('sku')) {
											template.find('.woo-loop-product__footer .button')
											.attr('data-product_sku',product.sku);
										}

									}

									if (template.find('.product').hasClass('sold-individually')) {
										template.find('.input-group .qty').attr('max',1);
									}

								/* Append Template
								----------------*/

									pHTML+=template.html();

							}

							if (index >= endIndex) {
						        break;
						    }

						}

						if (pHTML.length) {
							$return['products'] = pHTML;
						} else {
							$return['not_found'] = noProductsFound;
						}
						

						/* Product terms 
		        		-------*/

							const slugCounts = {};
							const categorySlugCounts = {};

							// Count occurrences of each attribute term slug
							attributesList.forEach(attributes => {
							    Object.values(attributes).forEach(attributeTerms => {
							        attributeTerms.forEach(attributeTerm => {
							            const slug = attributeTerm.slug;
							            slugCounts[slug] = (slugCounts[slug] || 0) + 1;
							        });
							    });
							});

							// Count occurrences of each category slug
							categoriesList.forEach(category => {
							    const slug = category.slug;
							    categorySlugCounts[slug] = (categorySlugCounts[slug] || 0) + 1;
							});

							// Process attributes and ensure unique terms with count
							attributesList.forEach(attributes => {
							    Object.entries(attributes).forEach(([attributeName, attributeTerms]) => {
							        if (!productTerms[attributeName]) {
							            productTerms[attributeName] = [];
							        }

							        attributeTerms.forEach(attributeTerm => {
							            if (!productTerms[attributeName].some(v => v.slug === attributeTerm.slug)) {
							                productTerms[attributeName].push({
							                    ...attributeTerm,
							                    count: slugCounts[attributeTerm.slug]
							                });
							            }
							        });
							    });
							});

							// Process product categories with similar logic
							if (Array.isArray(categoriesList) && categoriesList.length) {

							    if (!productTerms.product_cat) {
							        productTerms.product_cat = [];
							    }

							    categoriesList.forEach(category => {
							        if (!productTerms.product_cat.some(v => v.slug === category.slug)) {
							            productTerms.product_cat.push({
							                term_id: category.id,
							                slug: category.slug,
							                name: category.name,
							                count: categorySlugCounts[category.slug],
							                parent: category.parent_id,
							                link: category.link
							            });
							        }
							    });
							}

							if (Object.keys(productTerms).length > 0) {

							    Object.entries(productTerms).forEach(([attributeKey, attributeTerms]) => {
							        productTerms[attributeKey].sort((a, b) => a.name.localeCompare(b.name));
							    });

							    $return['product_terms'] = productTerms;
							}

						/* Pagination 
		        		-------*/

				            $return['pagination'] = generatePagination(parseFloat(paged), totalPages,baseURL);

				    	/*Found results
	    				-------*/

				            $return['found_total'] = productIndex.length;

				            if (1 === productIndex.length) {
				            	$return['found_results'] = copt.strings.showingSingle;
				            } else if ( productIndex.length <= productPerPage || -1 === productPerPage ) {
	                			$return['found_results'] = copt.strings.showingAll.replace('{total}',productIndex.length);
				            } else {

			                    let $first = ( productPerPage * paged ) - productPerPage + 1;
			                    let $last  = Math.min( productIndex.length, productPerPage * paged );

			                    $return['found_results'] = copt.strings.showingRange
			                    .replace('{total}',productIndex.length)
			                    .replace('{from}',$first)
			                    .replace('{to}',$last);

			                }

			            /* Price filter 
		        		-------*/

			                const prices = productIndex.map(product => parseFloat(product.price));
			                const step   = $('.price_slider_amount').length ? $('.price_slider_amount').attr('data-step') : 10

							priceFilter['min_price'] = Math.round(Math.min(...prices));
							priceFilter['max_price'] = Math.round(Math.max(...prices));

							if ((priceFilter['max_price'] - priceFilter['min_price']) < 10) {
								priceFilter['min_price'] = priceFilter['max_price'] - 10
							}

			                // Round min price to 0 if it's a decimal value
							if (priceFilter['min_price'] % 1 !== 0 || priceFilter['min_price'] < step) {
							    priceFilter['min_price'] = 0;
							}

							// Round max price to the next multiple of 10
							priceFilter['max_price'] = Math.ceil(priceFilter['max_price'] / step) * step;

							// Assign the rounded values back
							priceFilter['min_price'] = Math.round(priceFilter['min_price']);
							priceFilter['max_price'] = Math.round(priceFilter['max_price']);

							if (Object.keys(priceFilter).length) {
							    $return['price_filter'] = priceFilter;
							}

						/* Rating filter
						-------*/

							const ratingCounts = productIndex
							    .map(product => product.hasOwnProperty('rating') ? Math.round(parseFloat(product.rating)) : null) // Round ratings if 'rating' exists
							    .filter(rating => rating !== null) // Remove null values
							    .reduce((counts, rating) => {
							        if (rating >= 1 && rating <= 5) {
							            counts[rating] = (counts[rating] || 0) + 1; // Increment count
							        }
							        return counts;
							    }, { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }); // Initialize in reverse order

							let ratingList = '';
							let ratingFilter = Array.isArray(activeFilters['rating_filter']) ? activeFilters['rating_filter'] : [activeFilters['rating_filter']];

							// Sort ratingCounts by the rating keys in descending order (5 to 1)
							Object.entries(ratingCounts)
							    .sort(([ratingA], [ratingB]) => ratingB - ratingA) // Sort keys in descending order
							    .forEach(([rating, count]) => {
							        if (count) {
							            let ratingClass = ratingFilter.includes(rating) ? 'wc-layered-nav-rating chosen' : 'wc-layered-nav-rating';

							            ratingList += '<li class="'+ratingClass+'">';
							            ratingList += '<a href="'+baseURL+'?rating_filter='+rating+'">';
							            ratingList += '<span class="star-rating"><span style="width:'+(20*rating)+'%">';
							            ratingList += '<strong class="rating">'+rating+'</strong></span>';
							            ratingList += '</span> ('+count+')</a></li>';
							        }
							    });

							if (ratingList.length) {
							    $return['rating_filter'] = ratingList;
							}

				    } else {
				    	$return['not_found'] = noProductsFound;
				    }


		        /* Return
	    		-------*/

		            if (currentResultsTitle.length) {
		            	$return['current_results_title'] = currentResultsTitle;
		            }

		            if (breadcrumbs.length) {
		            	$return['breadcrumbs'] = breadcrumbs;
		            }


		            return $return;

			}
		
		$('.woocommerce-widget-layered-nav-list').each(function(){
			layeredNavListScroll($(this));
		});

		$('body').on('click','.widget .cat-parent > .cat-toggle',function(){

			let parent = $(this).parent();

			parent.toggleClass('current-cat-parent');

			if (parent.hasClass('current-cat-parent')) {
				parent.children('ul').css('height', '0');
				gsap.to(parent.children('ul'), {
			        duration: 0.3,
			        height: 'auto',
			        ease: 'power3.out'
			    });
			} else {
				parent.children('ul').css('height', 'auto');
				gsap.to(parent.children('ul'), {
			        duration: 0.3,
			        height: '0',
			        ease: 'power3.out',
			    });
			}

		});

		$("body").on('keyup input', 'input.term-search', function (e) {

		    let filter = $(this).val();
		    let $list = $(this).next('ul');

		    // Filter the list items based on the search input
		    $list.find('li').each(function () {
		        if ($(this).find('a').attr('title').search(new RegExp(filter, "i")) < 0) {
		            $(this).hide(0);
		        } else {
		            $(this).show();
		        }
		    });

		    // Remove existing 'no-terms-found' message before adding a new one
		    $(this).nextAll('.no-terms-found').remove();

		    if ($list.find('li:visible').length === 0 && filter !== '') {
		        // Show 'no-terms-found' message only if there are no visible items and input is not empty
		        $('<p class="no-terms-found">' + copt.strings.noTermsFound + '</p>').insertAfter($list);
		    }

		    // Handle clear event: If the input is empty, reset the list and remove the 'no-terms-found' message
		    if (filter === '') {
		        $list.find('li').show();  // Show all items
		        $(this).nextAll('.no-terms-found').remove(); // Remove 'no-terms-found' message if input is cleared
		    }

		    // Recalculate scroll behavior
		    layeredNavListScroll($list,false);
		});

		$('select.widget_product_categories, select.woocommerce-widget-layered-nav-dropdown').each(function(){

			let $this = $(this),
				multiple = $this.prop('multiple'),
				defaultText = $this.find('option:first-child').text();

			// Now initialize Select2
			$this.select2({
				multiple: multiple,
				dropdownParent: $this.closest('.widget'),
				placeholder: defaultText,
			});

		});


		if (
			$('body').hasClass('woocommerce-js') && 
			$('body').hasClass('woocommerce-page') &&
			$('body').hasClass('archive') &&  addon
		) {

			var currentUrl = window.location.href;

			if (!history.state) {
		        history.replaceState({ url: window.location.href }, "", window.location.href);
		    }

			activeWidgetClear(currentUrl);

			$('.woocommerce-pagination a').each(function(){
	    		let $this = $(this),
	    			link  = $this.attr('href').endsWith("/") ? $this.attr('href').slice(0, -1).split('/') : $this.attr('href').split('/');

	    		if (link.pop() == 1) {
	    			link.splice(-1);
	    			$this.attr('href',link.join('/')+'/');
	    		}
	    	});

			if (typeof(copt.productAjaxFilter) != "undefined" && copt.productAjaxFilter == 1) {

				var loggedIn           = ($('body').hasClass('logged-in')) ? true : false;
				let activeFilters      = {};
				let baseURL            = {'base' : copt.shopLink};
				let activeParams       = getUrlParams();

				/* Fetch products data
				------------*/

					$.ajax({

						url: copt.ajaxUrl,
			            type: 'POST',
			            data: {
			            	'nonce':copt.fetchProductsDataNonce,
			            	'action':'et__fetch_products_data',
			            	'lang':currentLang
			            },
			            success: function(response) {

			            	if (response.data) {
			            		response = response.data
			            	}

			            },
			            error: function(xhr, status, error) {
			                console.log(error);
			            }

				    });

				/* Static
				------------*/

					$('.woocommerce-widget-layered-nav').each(function(){
					
						let $this  = $(this);

						if ($this.attr('data-display-type') != "dropdown" && $this.find('span.count')) {
							$this.attr('data-count',1);
						}

					});

					$('.widget_product_categories').each(function(){
					
						let $this  = $(this);

						if ($this.attr('data-display-type') == "dropdown") {

							const options = listToSelect($this.find('ul.product-categories'));

							if (options != '') {
								$('<select id="'+$this.attr('id')+'" class="'+$this.attr('class')+'"><option value="">'+copt.strings.any+' '+$this.attr('data-title')+'</option>'+options+'</select>')
								.insertAfter($this.find('ul.product-categories'));
	    						$this.find('ul.product-categories').remove();
	    						$('select#'+$this.attr('id')).select2();
							}

						}

						let active = false;

						if ($this.find('select').length) {
							active = $this.find('select').val();

						} else if($this.find('.current-cat').length) {
							active = $this.find('.current-cat > a').attr('href');
						}

						if (active && active.length) {
							baseURL['base'] = active;

							let catUrl = active.endsWith("/") ? active.slice(0, -1) : active;
							activeFilters['category'] = catUrl.split('/').pop();

						}

					});

					if (activeParams) {

						Object.entries(activeParams).forEach(([key, value]) => {
							if (key != 'category') {
								baseURL[key] = value;
								activeFilters[key] = value;
							}
						});

						ajaxProductFilter(activeFilters,baseURL);
					}

				/* Events
				------------*/

					$('body').on('click','.widget .cat-item > a', function(e){
						e.preventDefault();

						let activeCategory = $(this);

						if (activeCategory.attr('href') != '#') {

							activeCategory
							.parents('.widget')
							.find('.current-cat')
							.removeClass('current-cat');

							activeCategory
							.parent()
							.addClass('current-cat');

							baseURL['base'] = activeCategory.attr('href');

							let catUrl = activeCategory.attr('href').endsWith("/") ? activeCategory.attr('href').slice(0, -1) : activeCategory.attr('href');
							activeFilters['category'] = catUrl.split('/').pop();
						}

						ajaxProductFilter(activeFilters,baseURL);

					});

					$('body').on('click','.categories-carousel .category a', function(e){
						e.preventDefault();

						let activeCategory = $(this);

						if (activeCategory.attr('href') != '#') {

							activeCategory
							.parents('.categories-carousel')
							.find('.current-cat')
							.removeClass('current-cat');

							activeCategory
							.parent()
							.addClass('current-cat');

							if ($('.widget .cat-item > a[href="'+activeCategory.attr('href')+'"]').length) {
								$('.widget .cat-item > a[href="'+activeCategory.attr('href')+'"]').trigger('click');
							} else if($('select.widget_product_categories').length){

								$('select.widget_product_categories')
							    .val(activeCategory.attr('href'))
							    .trigger('change')
							    .trigger({
							        type: 'select2:select',
							        params: { data: { id: activeCategory.attr('href') } }
							    });

							}
						}


					});

					$('body').on('select2:select','select.widget_product_categories',function(){

						let activeCategory = $(this).val();

						if (activeCategory != '') {

						    baseURL['base'] = $(this).val();

						    let catUrl = activeCategory.endsWith("/") ? activeCategory.slice(0, -1) : activeCategory;
							activeFilters['category'] = catUrl.split('/').pop();

						}

						ajaxProductFilter(activeFilters,baseURL);

					});

					$('body').on('click','.wc-layered-nav-term  > a', function(e){
						e.preventDefault();

						let activeTerm  = $(this),
							attribute   = activeTerm.parents('.widget').attr('data-attribute'),
							queryType   = activeTerm.parents('.widget').attr('data-query-type');

						activeTerm
						.parent()
						.toggleClass('chosen');

						if ('and' == queryType) {


							activeTerm
							.parent()
							.siblings()
							.removeClass('chosen');

							if (activeTerm.parent().hasClass('chosen')) {
								activeFilters['filter_'+attribute] = activeTerm.attr('data-term');
								baseURL['filter_'+attribute]   = activeFilters['filter_'+attribute];
							} else {
								delete activeFilters['filter_'+attribute];
								delete baseURL['filter_'+attribute];
							}

						} else {

							let chosenTerms = [];

							activeTerm.parents('.widget').find('.chosen').each(function(){
								chosenTerms.push($(this).find('a').attr('data-term'));
							});

							if (chosenTerms.length) {
								activeFilters['filter_'+attribute] = chosenTerms.join(',');
								baseURL['query_type_'+attribute] = 'or';
								baseURL['filter_'+attribute] = activeFilters['filter_'+attribute];
							} else {
								delete activeFilters['filter_'+attribute];
								delete baseURL['filter_'+attribute];
								delete activeFilters['query_type_'+attribute];
								delete baseURL['query_type_'+attribute];
							}

						}

						ajaxProductFilter(activeFilters,baseURL);

					});

					$('.woocommerce-widget-layered-nav-dropdown').on('submit',function(e){
						
						e.preventDefault();
						let trigger = $(this);
						layeredNavDropdownEvents(trigger,activeFilters,baseURL);

					});

					$('body').on('select2:unselect','select.woocommerce-widget-layered-nav-dropdown',function(){
						let trigger = $(this);
						layeredNavDropdownEvents(trigger,activeFilters,baseURL);
					});

					$('body').on('click','.widget_price_filter button', function(e){
						
						e.preventDefault();

						activeFilters['min_price'] = $(this).parents('.widget_price_filter').find('input[name="min_price"]').val();
						activeFilters['max_price'] = $(this).parents('.widget_price_filter').find('input[name="max_price"]').val();

						baseURL['min_price'] = activeFilters['min_price'];
						baseURL['max_price'] = activeFilters['max_price'];

						ajaxProductFilter(activeFilters,baseURL);

					});

					$('body').on('click','.wc-layered-nav-rating > a', function(e){
						e.preventDefault();

						let activeTerm = $(this),
							attribute  = 'rating_filter';

						activeTerm
						.parent()
						.toggleClass('chosen');

						let termUrl = activeTerm.attr('href');

						if (activeTerm.parent().hasClass('chosen')) {
							activeFilters['rating_filter'] = termUrl.split('=').pop();
							baseURL['rating_filter'] = activeFilters['rating_filter'];
						} else {
							delete activeFilters['rating_filter'];
							delete baseURL['rating_filter'];
						}

						ajaxProductFilter(activeFilters,baseURL);

					});

					$('.woocommerce-ordering').on('submit',function(e){
						e.preventDefault();

						if ($(this).find('select').val()) {
							
							activeFilters['orderby'] = $(this).find('select').val();
							baseURL['orderby'] = activeFilters['orderby'];

							ajaxProductFilter(activeFilters,baseURL);

						}

					});

					$('body').on('click','.woocommerce-pagination a', function(e){
						e.preventDefault();

						let $this = $(this),
							link  = $this.attr('href').split('?').shift(),
							paged = link.replace(/\/$/, '').split('/').pop();

						paged = /^\d+$/.test(paged) ? parseInt(paged, 10) : 1;

						activeFilters['paged'] = paged;
						baseURL['base'] = $this.attr('href').split('?').shift();

						ajaxProductFilter(activeFilters,baseURL);

					});

					$('body').on('click','.widget_title .clear, .active-filters a, .et__product_ajax_search.embed > a', function(e){
						e.preventDefault();

						let $this = $(this);

						activeFilters = getUrlParams($this.attr('href'));

						if (false == activeFilters) {
							activeFilters = {};
						}

						baseURL = {'base' : $this.attr('href').split('?').shift()};

						if ($this.attr('href').includes(copt.categoryBase)) {
							let catUrl = $this.attr('href').split('?').shift();

							if (catUrl.endsWith("/")) {catUrl = catUrl.slice(0, -1)}
							activeFilters['category'] = catUrl.split('/').pop();
						}

						if (Object.keys(activeFilters).length) {
							Object.entries(activeFilters).forEach(([key, value]) => {
								if (key != 'category') {
									baseURL[key] = value;
								}
							});
						}

						if (
							$this.hasClass('clear-all-filters') || 
							$this.hasClass('search') || 
							$this.hasClass('return-to-shop')
						) {
							$('.et__product_ajax_search.embed > .query').val('');
							$('.et__product_ajax_search.embed > a').remove();
						}

						if (
							$this.parent().hasClass('et__product_ajax_search') ||
							$this.hasClass('category') ||
							$this.parents('.widget_product_categories').length
						) {
							$('.et__product_ajax_search.embed > a').remove();
						}

						if ($this.hasClass('clear')) {
							$this.parent().parent().toggleClass('close');
						} else if(!$this.hasClass('return-to-shop')) {
							$this.remove();
						}

						if (
							$this.hasClass('clear-all-filters') ||  
							$this.hasClass('return-to-shop')
						) {
							if ($('.woocommerce-ordering select[name="orderby"] option[value="'+copt.defaultSort+'"]').length) {
			            		$('.woocommerce-ordering select[name="orderby"]').val(copt.defaultSort)
			            	} else {
			            		$('.woocommerce-ordering select[name="orderby"] option[value="relevance"]').attr('value','menu_order').text(copt.strings.defaultSortLabel)
			            		$('.woocommerce-ordering select[name="orderby"]').val('menu_order');
			            	}
						}

						if ($('.shop-widgets .widget_product_categories:last-child').length) {
							window.location.href = baseURL.base;
							return;
						}

						ajaxProductFilter(activeFilters,baseURL);

					});

					$("body").on('click', '.et__product_ajax_search_keyword_suggestions > span', function () {
					    var suggestionText = $(this).text();
					    
					    // Set the query input value to the clicked suggestion and trigger the input event
					    var query = $('.et__product_ajax_search.embed > .query');
					    query.val(suggestionText).trigger('input');

						handleProductSearch(query,activeFilters,baseURL);

					});

					let embedTypingTimer = null;
					let embedLastToken = 0;

					$('body').on('input', '.et__product_ajax_search.embed .query', function () {

					    if (typeof addon !== 'undefined' && addon === false) return;

					    const $input = $(this);
					    const rawVal = $input.val();
					    const val = (rawVal == null ? '' : String(rawVal)).trim();

					    // Minimum length
					    if (val.length < 2) {
					        $input.data('last-search-value', '');
					        return;
					    }

					    // Prevent duplicate triggers for same value
					    const lastVal = $input.data('last-search-value') || '';
					    if (lastVal === val) return;

					    const token = ++embedLastToken;

					    clearTimeout(embedTypingTimer);
					    embedTypingTimer = setTimeout(function () {
					        if (token !== embedLastToken) return;

					        $input.data('last-search-value', val);

					        // Your existing search logic
					        handleProductSearch($input, activeFilters, baseURL);

					    }, 300);
					});


					// Block Enter key (optional UX)
					$('body').on('keydown', '.et__product_ajax_search.embed > .query', function (e) {
					  if (e.key === 'Enter') {
					    e.preventDefault();
					  }
					});


					$("body").on('submit', '.et__product_ajax_search.embed', function (e) {

						e.preventDefault();
					    
				        let form  = $(this);

				        form.addClass('loading');
				        $('#loop-products .products').html('');
				        $('#loop-products .woocommerce-pagination').remove();
				        
				        let inputValue = form.find('.query').val().trim(); // Get the input value

			            if (inputValue.length) {
				            activeFilters['s'] = inputValue;
				            baseURL['s']   = inputValue;
				            ajaxProductFilter(activeFilters, baseURL);
			            } else {

							delete activeFilters['s'];
							delete baseURL['s'];

			            	ajaxProductFilter(activeFilters, baseURL);
			            }

					});

					window.addEventListener('popstate', function (event) {

					  // Use stored state URL if available, otherwise fallback to current location
					  const url = (event.state && event.state.url) ? event.state.url : window.location.href;

					  activeFilters = getUrlParams(url) || {};
					  baseURL = { base: url.split('?').shift() };

					  // Always reset category first
					  delete activeFilters.category;

					  // Detect category only if URL is category URL
					  if (url.includes('/' + copt.categoryBase + '/')) {
					    let catUrl = url.split('?').shift();
					    if (catUrl.endsWith('/')) catUrl = catUrl.slice(0, -1);
					    const parts = catUrl.split('/').filter(Boolean);
					    activeFilters.category = parts.pop();
					  }

					  // Put non-category params into baseURL
					  Object.entries(activeFilters).forEach(([key, value]) => {
					    if (key !== 'category') {
					      baseURL[key] = value;
					    }
					  });

					  	if ('category' in activeFilters) {

						    let currentSlug = activeFilters['category'];

						    $('.widget_product_categories .cat-item.current-cat').removeClass('current-cat');

						    $('.widget_product_categories .cat-item > a').each(function () {

						        let href = $(this).attr('href');

						        if (!href) return;

						        // normalize
						        href = href.replace(/\/+$/, '');

						        let parts = href.split('/').filter(Boolean);
						        let lastSlug = parts[parts.length - 1];

						        if (lastSlug === currentSlug) {
						            $(this).parent().addClass('current-cat');
						            return false; // stop loop
						        }
						    });
						}

					  delete baseURL.category;

					  // ✅ Now it will fire even when going back to /shop/
					  ajaxProductFilter(activeFilters, baseURL, false);
					});



			} else {

				$('body').on('click','.widget_title .clear', function(e){
					e.preventDefault();

					if ($(this).attr('href') != '#') {
						window.location.assign($(this).attr('href'));
					}

					$(this).parent().parent().toggleClass('close');

				});
			}

		}


	})(jQuery);

/* Product filter attributes
----*/

	(function ($) {

	    "use strict";

	    $('.et__attributes_filter_form').each(function () {

		    const $filter  = $(this);
		    const $selects = $filter.find('select');
		    const $reset   = $filter.find('button[type="reset"]');
		    const $submit  = $filter.find('button[type="submit"]');

		    let ajaxRunning = false;

		    /**
		     * Collect attribute names for all selects in this filter.
		     * Optional parameter:
		     *   fromSelect: jQuery object of the select that changed,
		     *               if provided, we collect only *following* selects.
		     */
		    function collectAtts(fromSelect) {
		        const atts = [];

		        if (fromSelect && fromSelect.length) {
		            // All following selects after current one
		            fromSelect.parent().nextAll().find('select').each(function () {
		                const name = $(this).attr('name');
		                if (name) {
		                    atts.push(name);
		                }
		            });
		        } else {
		            // All selects in the filter
		            $filter.find('select').each(function () {
		                const name = $(this).attr('name');
		                if (name) {
		                    atts.push(name);
		                }
		            });
		        }

		        return atts;
		    }

		    /**
		     * NEW: Collect ALL selected values in this filter
		     * Returns object like { pa_color: 'black', pa_size: 'xl', product_cat: 't-shirts' }
		     */
		    function collectSelectedValues() {
		        const selected = {};

		        $filter.find('select').each(function () {
		            const name = $(this).attr('name');
		            const val  = $(this).val();

		            if (name && val) {
		                selected[name] = val;
		            }
		        });

		        return selected;
		    }

		    /**
		     * Apply response from AJAX:
		     * response.return = { taxonomy: { slug: {label, image_url}, ... }, ... }
		     */
		    function applyResponse(response) {
		        if (!response || !response.return) {
		            return;
		        }

		        Object.entries(response.return).forEach(([taxonomy, terms]) => {
		            const $targetSelect = $filter.find('select[name="' + taxonomy + '"]');

		            if (!$targetSelect.length) {
		                return; // no matching select, skip
		            }

		            // Remove all options except the first one (placeholder)
		            $targetSelect.find('option:not(:first-child)').remove();

		            const newOptions = [];

		            Object.entries(terms).forEach(([slug, termData]) => {
		                const label    = termData.label || '';
		                const imageUrl = termData.image_url || '';

		                const $option = $('<option>', {
		                    value: slug,
		                    text:  label
		                });

		                if (imageUrl) {
		                    $option.attr('data-img', imageUrl);
		                }

		                newOptions.push($option);
		            });

		            // Append all new options at once
		            $targetSelect.append(newOptions);

		            // Reset selection & refresh Select2 UI
		            if ($targetSelect.data('select2')) {
		                $targetSelect.val('').trigger('change');
		            }
		        });
		    }

		    /**
		     * Toggle "reset" class depending on whether
		     * any select in this filter has a value.
		     */
		    function updateResetClass() {
		        let hasValue = false;

		        $filter.find('select').each(function () {
		            if ($(this).val()) {
		                hasValue = true;
		                return false; // break loop
		            }
		        });

		        if (hasValue) {
		            $filter.addClass('reset');
		        } else {
		            $filter.removeClass('reset');
		        }
		    }

		    /**
		     * Helper to send AJAX request to et__attributes_filter_ajax
		     */
		    function sendFilterAjax(payload) {
		        if (ajaxRunning) {
		            return;
		        }

		        ajaxRunning = true;
		        $filter.addClass('loading');

		        wpAjax('et__attributes_filter_ajax', payload)
		            .then(response => {

		                console.log(response);

		                applyResponse(response);
		                $filter.removeClass('loading');
		                updateResetClass();
		                ajaxRunning = false;
		            })
		            .catch(error => {
		                console.error('AJAX error:', error);
		                $filter.removeClass('loading');
		                updateResetClass();
		                ajaxRunning = false;
		            });
		    }

		    $submit.on('click',function(e){
		        e.preventDefault();

		        let activeParams = {}

		        $filter.find('select').each(function () {
		            if ($(this).val()) {
		                activeParams[$(this).attr('name').replace(/^pa_/, 'filter_')] = $(this).val();
		            }
		        });

		        let shopLink = copt.shopLink;

		        if (Object.keys(activeParams).length) {

		            if ('product_cat' in activeParams) {
		                shopLink = copt.siteUrl+copt.categoryBase+'/'+activeParams['product_cat'] + '/';
		                delete activeParams['product_cat'];
		            }

		            createUrlParams(shopLink,activeParams,true);
		        }

		    });

		    // RESET BUTTON HANDLER
		    $reset.on('click', function (e) {

		        e.preventDefault()

		        if (ajaxRunning) {
		            return;
		        }

		        const atts = collectAtts(null); // all selects in filter

		        if (!atts.length) {
		            $filter.removeClass('loading');
		            updateResetClass();
		            return;
		        }

		        const payload = {
		            nonce: copt.attributesFilterAjaxNonce,
		            reset: 'reset',
		            atts:  JSON.stringify(atts),
		            lang:  currentLang
		        };

		        sendFilterAjax(payload);
		    });

		    // SELECT CHANGE HANDLER
		    $selects
		        .select2({
		            dropdownParent: $filter,
		            templateResult: etFormatAttributeOption,
		            templateSelection: etFormatAttributeSelection,
		            width: '100%',
		            escapeMarkup: function (markup) {
		                return markup; // allow our HTML when we return strings
		            }
		        })
		        .on('change', function () {

		            if (ajaxRunning) {
		                return;
		            }

		            const $this = $(this);

		            // following selects only (the ones that will be updated)
		            const atts = collectAtts($this);

		            if (!atts.length) {
		                $filter.removeClass('loading');
		                updateResetClass();
		                return;
		            }

		            // NEW: collect ALL selected values (all selects in filter)
		            const selectedValues = collectSelectedValues();

		            const payload = {
		                attr:     $this.attr('name'),           // still send which changed (for reference, if needed)
		                nonce:    copt.attributesFilterAjaxNonce,
		                value:    $this.val(),                  // still send current value (not strictly needed anymore)
		                atts:     JSON.stringify(atts),         // dependent taxonomies to refill
		                selected: JSON.stringify(selectedValues), // NEW: all selected taxonomies
		                lang:     currentLang
		            };

		            sendFilterAjax(payload);
		        });

		});

	    // Helper: get label safely
	    function etGetOptionText(option) {

	        // Prefer option.text
	        if (option.text && option.text.length) {
	            return option.text;
	        }
	        // Fallback to the <option> element text
	        if (option.element) {
	            return $(option.element).text();
	        }
	        return '';
	    }

	    /** DROPDOWN TEMPLATE **/
	    function etFormatAttributeOption(option) {
	        // Placeholder or no data
	        if (!option.id) {
	            return option.text;
	        }

	        // Some Select2 items (tags, AJAX) may not have a backing <option>
	        if (!option.element) {
	            return etGetOptionText(option);
	        }

	        var $el   = $(option.element);
	        var img   = $el.attr('data-img'); // safer than .data()
	        var label = etGetOptionText(option);

	        // If no image → just text
	        if (!img) {
	            return '<span class="select2-option-text-only">' + label + '</span>';
	        }

	        // With image (return HTML string, escapeMarkup will allow it)
	        var markup =
	            '<span class="select2-item-with-img">' +
	                '<img src="' + img + '" class="select2-option-img" />' +
	                '<span class="select2-option-text">' + label + '</span>' +
	            '</span>';

	        return markup;
	    }

	    /** SELECTED ITEM TEMPLATE **/
	    function etFormatAttributeSelection(option) {
	        // Placeholder
	        if (!option.id) {
	            return option.text;
	        }

	        if (!option.element) {
	            return etGetOptionText(option);
	        }

	        var $el   = $(option.element);
	        var img   = $el.attr('data-img');
	        var label = etGetOptionText(option);

	        // No image → text only
	        if (!img) {
	            return '<span class="select2-selected-text-only">' + label + '</span>';
	        }

	        var markup =
	            '<span class="select2-selected-with-img">' +
	                '<img src="' + img + '" class="select2-selected-img" />' +
	                '<span>' + label + '</span>' +
	            '</span>';

	        return markup;
	    }

	})(jQuery);

/* Product search
----*/

	(function ($) {

	  "use strict";

	  const currency = (window.copt && copt.activeCurrency) ? copt.activeCurrency : '';
	  const THRESHOLD = (window.copt && copt.threshold) ? parseFloat(copt.threshold) : 0.35;

	  let masterIndex = null;       // immutable full index
	  let loadError = null;
	  let typingTimer = null;
	  let analyticsTimer = null;
	  let lastQueryToken = 0;
	
	  // Only used for AJAX fallback searches (when masterIndex not loaded)
	  let activeAjaxXhr = null;

	  // Prevent duplicate analytics store for same final value (per session)
	  let lastAnalyticsValue = '';

	  if (addon && copt.productAjaxFilterIndex == 1) {

	    // Initial index fetch (load once, keep immutable masterIndex)
	    $.ajax({
	      url: copt.ajaxUrl,
	      type: 'POST',
	      data: {
	        nonce: copt.fetchProductSearchIndexNonce,
	        action: 'et__fetch_product_search_index',
	        lang: currentLang,
	      },
	      success: function (response) {
	        const data = response.data;
	        if (!data || !Array.isArray(data)) {
	          loadError = 'Invalid index payload';
	          return;
	        }
	        masterIndex = data; // keep immutable
	        loadError = null;
	      },
	      error: function (xhr, status, error) {
	        console.log(error);
	        loadError = error || 'Index request failed';
	      }
	    });

	  }

	  // Small helpers
	  const uid = (() => { let i = 0; return () => (++i).toString(36) + Date.now().toString(36); })();

	  function safeParseJSON(resp) {
	    if (resp && typeof resp === 'object') return resp;
	    try { return JSON.parse(resp); } catch (_) { return null; }
	  }

	  function ensureResultsList($form) {
	    let $ul = $form.find('> .et__search-results');
	    if (!$ul.length) {
	      $ul = $('<ul class="et__search-results"/>').attr('id', 'et__search-results-' + uid());
	      $form.append($ul);
	    }
	    return $ul;
	  }

	  function renderProductSearchResults(products) {
	    const templateStructure =
	      '<li class="product">' +
	        '<a class="product-link">' +
	          '<div class="image-container"></div>' +
	          '<div class="et__product-data">' +
	            '<div class="woo-loop-product__meta"></div>' +
	            '<h3 class="woo-loop-product__title"></h3>' +
	            '<p class="price"></p>' +
	          '</div>' +
	        '</a>' +
	      '</li>';

	    const parts = [];

	    for (const product of products) {
	      const $tplWrap = $('<div>').html(templateStructure);
	      const $tpl = $tplWrap.children().first();

	      // Link & title
	      $tpl.find('.product-link')
	        .attr('href', product.link || '#')
	        .attr('title', product.title_raw || '');

	      if (product.title_raw) {
	        $tpl.find('.woo-loop-product__title').text(product.title_raw);
	      } else {
	        $tpl.find('.woo-loop-product__title').remove();
	      }

	      // Image
	      if (product.image && product.image.url && product.image.width && product.image.height) {
	        const w = parseFloat(product.image.width), h = parseFloat(product.image.height);
	        let img = '<img ';
	        if (product.image.lazy) {
	          img += 'class="lazy" data-src="' + product.image.url + '" src="' + product.image.lazy + '"';
	        } else {
	          img += 'src="' + product.image.url + '"';
	        }
	        img += ' width="' + w + '" height="' + h + '" alt="' + (product.image.alt || '') + '" />';
	        img += '<svg viewBox="0 0 ' + w + ' ' + h + '"><path d="M0,0H' + w + 'V' + h + 'H0V0Z" /></svg>';
	        $tpl.find('.image-container').html(img);
	      } else {
	        $tpl.find('.image-container').empty();
	      }

	      // Price
	      let priceHtml = product.price_html || '';
	      if (
	        currency &&
	        product.prices_by_currency &&
	        Object.prototype.hasOwnProperty.call(product.prices_by_currency, currency)
	      ) {
	        priceHtml = product.prices_by_currency[currency] || priceHtml;
	      }
	      if (priceHtml) {
	        $tpl.find('.price').html(priceHtml);
	      } else {
	        $tpl.find('.price').remove();
	      }

	      // Categories
	      if (Array.isArray(product.categories)) {
	        const names = [...new Set(
	          product.categories
	            .map(c => (c && c.name ? String(c.name).trim() : ''))
	            .filter(Boolean)
	        )];

	        if (names.length) {
	          $tpl.find('.woo-loop-product__meta').text(names.join(', '));
	        } else {
	          $tpl.find('.woo-loop-product__meta').remove();
	        }
	      } else {
	        $tpl.find('.woo-loop-product__meta').remove();
	      }

	      parts.push($tplWrap.html());
	    }

	    return parts.join('');
	  }

	  /**
	   * Store analytics term only when user finished typing (final intent).
	   * Requires PHP ajax action: lumera_store_search_term
	   * and nonce in copt.storeSearchTermNonce (recommended).
	   */
	  function scheduleSearchTermAnalytics($form, token) {
	    if (!addon) return;

	    clearTimeout(analyticsTimer);

	    const $input = $form.find('.query');
	    const raw = ($input.val() || '');
	    const term = raw.trim();

	    if (term.length < 2) return;

	    analyticsTimer = setTimeout(() => {

	      // must still be the latest query token
	      if (token !== lastQueryToken) return;

	      const nowRaw = ($input.val() || '');
	      const nowVal = nowRaw.trim();

	      // must not have changed while waiting
	      if (nowVal !== term) return;

	      // avoid tiny fragments like "po", "pow"
	      if (nowVal.length < 4) return;

	      // avoid mid-phrase "power " (ending with space)
	      if (/\s$/.test(nowRaw)) return;

	      // avoid duplicates
	      if (lastAnalyticsValue === nowVal) return;
	      lastAnalyticsValue = nowVal;

	      // If nonce not provided, silently skip (so JS won't throw)
	      if (!copt || !copt.storeSearchTermNonce) return;

	      $.ajax({
	        url: copt.ajaxUrl,
	        type: 'POST',
	        data: {
	          action: 'lumera_store_search_term',
	          nonce: copt.storeSearchTermNonce,
	          term: nowVal,
	          lang: currentLang
	        }
	      });

	    }, 1100);
	  }

	  function handleProductSearchAjax($form, activeFilters, token) {

	    // Abort previous search ajax to prevent stale response overriding newer results
	    if (activeAjaxXhr && activeAjaxXhr.readyState !== 4) {
	      activeAjaxXhr.abort();
	    }

	    activeAjaxXhr = $.ajax({
	      url: copt.ajaxUrl,
	      type: 'POST',
	      data: {
	        'nonce': copt.productSearchNonce,
	        'action': 'et__product_search',
	        'active_filters': JSON.stringify(activeFilters),
	        'lang': currentLang,
	        'currency': copt.activeCurrency,
	      },
	      success: function (response) {

	        // Ignore stale responses
	        if (token !== lastQueryToken) return;

	        if (response.data) {
	          response = response.data;
	        } else {
	          $form.removeClass('loading');
	          return;
	        }

	        const $ul = ensureResultsList($form);

	        if (response['products']) {

	          $ul.html(response['products']);

	          // optional lazyLoad if present
	          if (typeof window.lazyLoad === 'function') {
	            try { window.lazyLoad(document.getElementById($ul.attr('id'))); } catch (_) {}
	          }

	          if (response['found_results'] > 1) {

	            let link = copt.shopLink;

	            const category = $form.find('.category').length && $form.find('.category')[0].hasAttribute('data-slug')
	              ? $form.find('.category').attr('data-slug').trim()
	              : '';

	            if (category) {
	              link = copt.siteUrl + copt.categoryBase + '/' + category + '/';
	            }

	            $ul.append('<li class="extended-search"><a href="' + link + '?s=' + encodeURIComponent(activeFilters['s']) + '" class="button" title="' + copt.strings.extendedSearch + '">' + copt.strings.extendedSearch + '</a></li>');
	          }

	        } else {
	          $ul.html('<li class="no-products-found">' + copt.strings.noProductsFound + '</li>');
	        }

	        $form.removeClass('loading');

	      },
	      error: function (xhr, status, error) {
	        if (status === 'abort') return;
	        console.log(error);
	      }
	    });
	  }

	  function handleProductSearch($form, token) {

	    const $input = $form.find('.query');
	    const currentQuery = ($input.val() || '').trim();

	    const category = $form.find('.category').length && $form.find('.category')[0].hasAttribute('data-slug')
	      ? $form.find('.category').attr('data-slug').trim()
	      : '';

	    let activeFilters = { 's': currentQuery };

	    if (category) {
	      activeFilters['category'] = category;
	    }

	    if (!currentQuery.length || currentQuery.length < 2) {
	      $form.removeClass('loading');
	      $form.find('> .et__search-results').remove();
	      return;
	    }

	    // If index is not ready, fallback to server search (race-safe)
	    if (!masterIndex) {
	      $form.addClass('loading');
	      handleProductSearchAjax($form, activeFilters, token);
	      return;
	    }

	    if (loadError) {
	      $form.removeClass('loading');
	      return;
	    }

	    // Guard: if a newer token exists, do nothing
	    if (token !== lastQueryToken) return;

	    scheduleSearchTermAnalytics($form, token);

	    // Build a working copy (do not mutate masterIndex)
	    let working = masterIndex;

	    if (category) {
	      working = working.filter(p =>
	        Array.isArray(p.categories) &&
	        p.categories.some(cat => (cat && cat.slug) ? String(cat.slug).trim() === category : false)
	      );
	    }

	    // Build Fuse on the working set for accurate scoring
	    const searchInKeys = ['search_in_global'];
	    const fuseKeys = searchInKeys.map(k => ({ name: k, weight: 0.4 }));

	    const fuse = new Fuse(working, {
	      keys: fuseKeys,
	      threshold: THRESHOLD,
	      includeScore: true,
	      ignoreLocation: true,
	      useExtendedSearch: true,
	      shouldSort: true,
	    });

	    const results = fuse.search(String(currentQuery), { limit: 10 }).map(r => r.item);

	    // Guard again before DOM update
	    if (token !== lastQueryToken) return;

	    const $ul = ensureResultsList($form);
	    const html = renderProductSearchResults(results);

	    if (html) {
	      $ul.html(html);

	      if (typeof window.lazyLoad === 'function') {
	        try { window.lazyLoad(document.getElementById($ul.attr('id'))); } catch (_) {}
	      }

	      if (results && results.length > 1) {

	        let link = copt.shopLink;

	        const category = $form.find('.category').length && $form.find('.category')[0].hasAttribute('data-slug')
	          ? $form.find('.category').attr('data-slug').trim()
	          : '';

	        if (category) {
	          link = copt.siteUrl + copt.categoryBase + '/' + category + '/';
	        }

	        $ul.append('<li class="extended-search"><a href="' + link + '?s=' + encodeURIComponent(currentQuery) + '" class="button" title="' + copt.strings.extendedSearch + '">' + copt.strings.extendedSearch + '</a></li>');
	      }

	    } else {
	      $ul.html('<li class="no-products-found">' + copt.strings.noProductsFound + '</li>');
	    }

	    $form.removeClass('loading');
	  }

	  /**
	   * Debounced input handler (NO focus binding, prevents tab-switch search triggers)
	   */
	  $('body').on('input', '.et__product_ajax_search.header > .query', function () {

	    if (addon == false) return;

	    const $form = $(this).closest('form.et__product_ajax_search');
	    const val = (($(this).val() || '') + '').trim();

	    // Too short -> clear results immediately
	    if (val.length < 2) {
	      $form.removeClass('loading');
	      $form.find('> .et__search-results').remove();
	      return;
	    }

	    $form.addClass('loading');
	    const token = ++lastQueryToken;

	    clearTimeout(typingTimer);
	    typingTimer = setTimeout(() => {
	      if (token === lastQueryToken) {
	        handleProductSearch($form, token);
	      }
	    }, 300);

	    // Analytics stores only final term (after user stops typing)
	    scheduleSearchTermAnalytics($form, token);
	  });

	  // iOS Safari "Done" = blur → re-run search once and keep results
		$('body').on('blur', '.et__product_ajax_search.header > .query', function () {

		    if (addon == false) return;

		    const $input = $(this);
		    const $form  = $input.closest('form.et__product_ajax_search');
		    const val    = (String($input.val() || '')).trim();

		    // If field is basically empty, don't do anything
		    if (val.length < 2) {
		        return;
		    }

		    const token = ++lastQueryToken;
		    clearTimeout(typingTimer);

		    // Small timeout lets any "hide on blur" code run first,
		    // then we bring results back by calling your search again.
		    setTimeout(function () {
		        if (token !== lastQueryToken) return;

		        $form.addClass('loading');
		        handleProductSearch($form, token);
		        // optional: analytics again if you want
		        // scheduleSearchTermAnalytics($form, token);
		    }, 0);
		});


	  // Prevent hard submit in header form (UX)
	  $('body').on('keydown', '.et__product_ajax_search.header > .query, .et__product_ajax_search .query', function (e) {
	    if (e.key === 'Enter') {
	      e.preventDefault();
	    }
	  });

	  $('body').on('submit', '.et__product_ajax_search.header', function (e) {

	    const $form = $(this);
	    const category = $form.find('.category').length && $form.find('.category')[0].hasAttribute('data-slug')
	      ? $form.find('.category').attr('data-slug').trim()
	      : '';

	    if (category) {
	      $form.attr('action', copt.siteUrl + copt.categoryBase + '/' + category + '/');
	    }

	    if (!$form.find('.query').val()) {
	      e.preventDefault();
	    }
	  });

	  // Clear loading + results for a specific HEADER search form
	  function resetHeaderSearchFor($form) {
	    if (!$form || !$form.length) return;
	    $form.removeClass('loading');
	    $form.find('> .et__search-results').remove();
	  }

	  // 1) Click outside the header form -> clear
	  $(document).on('click', function (e) {
	    const $form = $('.et__product_ajax_search.header').first();
	    if (!$form.length) return;
	    if (!$(e.target).closest($form).length) {
	      resetHeaderSearchFor($form);
	    }
	  });

	  // 2) ESC anywhere -> clear
	  $(document).on('keydown', function (e) {
	    if (e.key === 'Escape') {
	      resetHeaderSearchFor($('.et__product_ajax_search.header').first());
	    }
	  });

	  /* -------- KEEP OPEN WHEN INTERACTING WITH RESULTS -------- */

	  // Mark that we're moving focus/clicking into the results list
	  $('body').on('mousedown', '.et__product_ajax_search.header > .et__search-results', function () {
	    $(this).closest('form.et__product_ajax_search.header').data('keepOpen', true);
	  });

	  // Use focusout (better than blur for relatedTarget), but only clear
	  // if focus actually left the form and we didn't just click results.
	  $('body').on('focusout', '.et__product_ajax_search.header .query', function (e) {
	    const $form = $(this).closest('form.et__product_ajax_search.header');

	    // If the next focus is inside results, keep it open
	    if ($form.data('keepOpen')) {
	      $form.removeData('keepOpen');
	      return;
	    }

	    // If focus moved somewhere outside the form, clear
	    const toEl = e.relatedTarget || document.activeElement;
	    if (!$(toEl).closest($form).length) {
	      resetHeaderSearchFor($form);
	    }
	  });

	  function loadProductSearchForm() {

	    if (!$('.search-wrapper.dynamic').length) {
	      $('body').append('<div class="search-wrapper active elementor-widget-et_product_search dynamic loading"><span class="search-toggle active"></span></div>');
	    }

	    $.ajax({
	      url: copt.ajaxUrl,
	      type: 'POST',
	      data: {
	        nonce: copt.productSearchFormNonce,
	        action: 'et__product_search_form',
	      },
	      success: function (response) {
	        if (
	          response &&
	          response.hasOwnProperty('success') &&
	          $('.search-wrapper').length
	        ) {
	          $('.search-wrapper.dynamic').eq(0).removeClass('loading').append(response['data']['html']);
	          $('.search-wrapper.dynamic').eq(0).find('.query').focus();
	          $('.search-wrapper.dynamic').eq(0).find('form').addClass('active');
	        }
	      },
	      error: function (xhr, status, error) {
	        console.log(error);
	        loadError = error || 'Index request failed';
	      }
	    });
	  }

	  $('body').on('click', '.search-toggle', function () {

	    let $this = $(this);
	    let wrapper = $this.next('.search-wrapper').length
	      ? $this.next('.search-wrapper')
	      : $this.parent('.search-wrapper').length
	        ? $this.parent('.search-wrapper')
	        : $('.search-wrapper.dynamic').eq(0);

	    if (wrapper.length) {

	      if ($this.hasClass('active')) {
	        $('.search-wrapper').each(function () {
	          $(this).removeClass('active');
	        });
	        $('.sticky-dashboard').removeClass('off');
	        return;
	      } else {
	        $('.sticky-dashboard').addClass('off');
	      }

	      wrapper.addClass('active');

	      wrapper.find('form').addClass('active');
	      wrapper.find('.query').focus();

	    } else if (!$this.hasClass('active')) {
	      $('.sticky-dashboard').addClass('off');

	      loadProductSearchForm();
	    }

	  });

	  function mobileSearchToggle(form){

		const isMobile = window.innerWidth <= 1023;

		if(isMobile){
			if (form.parents('.search-wrapper.active').length) {
				return;
			} else {
				if($('.sticky-dashboard .search-toggle').length){
					$('.sticky-dashboard .search-toggle').trigger('click');
				} else {

					const wrapper = $('.search-wrapper.dynamic');

					if (wrapper.length) {

					  $('.sticky-dashboard').addClass('off');

					  wrapper.addClass('active');
					  wrapper.find('form').addClass('active');
					  wrapper.find('.query').focus();

					} else {

					  $('.sticky-dashboard').addClass('off');
					  loadProductSearchForm();

					}


				}
			}
		}

	}

	$('.et__product_ajax_search > .query').on('focus',function(){
		$(this).parent().addClass('active');

		if ($(this).parent().hasClass('embed')) {
			return;
		}

		mobileSearchToggle($(this).parent());
	});

	$('.et__product_ajax_search > .query').on('focusout',function(){
		$(this).parent().removeClass('active');
	});

	})(jQuery);


/* Header
----*/

	(function($){

		"use strict";

		/* Sticky dashboard categories
		------------------*/

			const currentLanguage = currentLang;

			// Single source of truth for path (root = [])
			let catPath = [];

			// ---- Animations
			function animateItemsIn() {
			  const items = $('.categories-grid-container').children('li');
			  items.css('will-change', 'transform, opacity');

			  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

			  tl.from(items, {
			    duration: 0.5,
			    y: 24,
			    opacity: 0,
			    stagger: {
			      each: 0.06,
			      from: "start"
			    },
			    autoAlpha: 0,
			    transformPerspective: 600,
			    force3D: true
			  });
			}


			// ---- Back button (shows only if depth > 0)
			function renderBackButton($container) {
			  $container.find('.cat-back').remove();

			  if (catPath.length === 0) return; // root -> no back

			  // previous level target (if depth >= 2 it's the slug before the current)
			  const backSlug = (catPath.length >= 2) ? catPath[catPath.length - 2] : '';
			  const slugAttr = backSlug ? `data-slug="${backSlug}"` : '';
			  $container.prepend(
			    `<a class="cat-back" ${slugAttr} href="#" title="${copt.strings.back}">${copt.strings.back}</a>`
			  );
			}

			// ---- Category grid template
			function productCategoriesGridTemplate(
				categories = false, 
				columns = false, 
				gaps = false, 
				options = {}
			) {
			  
			  columns = columns || {
			    'cl-d':   9,
			    'cl-lp':  7,
			    'cl-tbl': 5,
			    'cl-tb':  4,
			    'cl-mb':  3,
			    'cl-mbs': 2
			  };

			  gaps = gaps || {
			    'gap-d':   12,
			    'gap-lp':  12,
			    'gap-tb':  12,
			    'gap-mb':  8,
			    'gap-mbs': 8
			  };

			  const {
			    lazyPlaceholder = '',
			    imageWidth = null,
			    imageHeight = null,
			  } = options;

			  const escAttr = (v) => String(v ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
			  const escHtml = (v) => String(v ?? '').replace(/</g, '&lt;');

			  const dataColumns = Object.entries(columns)
			    .map(([key, val]) => `data-${key}="${escAttr(val)}"`).join(' ');

			  const dataGaps = Object.entries(gaps)
				.map(([key, val]) => `--${key}:${escAttr(val)}px;`)
				.join(' ');

			  let output = `<ul class="grid-container item-grid-container categories-grid-container" ${dataColumns} style="${dataGaps}">`;

			  if (categories && Array.isArray(categories)) {
			    categories.forEach((category) => {
			      const slug = category.slug || '';
			      const name = category.name || '';
			      const link = category.link || '#';

			      const catClass = ['category', 'item', slug];
			      if (typeof category.children !== 'undefined' && Number(category.children) === 1) {
			        catClass.push('item-has-children');
			      }

			      output += `<li class="${escAttr(catClass.join(' '))}">`;

			      // Keep parent_slug if you still pass it (not required for stack logic)
			      const parentSlugAttr = category.hasOwnProperty('parent_slug')
			        ? `data-parent-slug="${escAttr(category.parent_slug)}"` : '';

			      output += `<a href="${escAttr(link)}" ${parentSlugAttr} data-slug="${escAttr(slug)}" title="${escAttr(name)}">`;

			      if (category.image) {
			        const imgSrc = category.image;
			        const w = imageWidth ? ` width="${escAttr(imageWidth)}"` : '';
			        const h = imageHeight ? ` height="${escAttr(imageHeight)}"` : '';

			        output += `<div class="image-container">`;
			        output += `<img src="${escAttr(imgSrc)}" ${w}${h} alt="${escAttr(name)}" />`;

			        const box = imageWidth || 300;
			        output += `<svg viewBox="0 0 ${escAttr(box)} ${escAttr(box)}"><path d="M0,0H${escAttr(box)}V${escAttr(box)}H0V0Z" /></svg>`;
			        output += `</div>`;
			      }

			      output += `<h3>${escHtml(name)}</h3>`;
			      output += `</a>`;
			      output += `</li>`;
			    });
			  }

			  output += `</ul>`;
			  return output;
			}

			// ---- Fetch + render (works with either preloaded categoryIndex or AJAX)
			function fetchProductCategories(currentSlug = false) {
			  const $popup = $('.product-categories-popup').eq(0);
			  const $content = $popup.children('.content');
			  $content.html('');
			  $popup.addClass('loading');

			  const renderDone = () => {
			    animateItemsIn();
			    renderBackButton($content);
			  };

			  const renderFromList = (allCats) => {
			    let list = (currentLanguage in categoryIndex) ? allCats[currentLanguage] : allCats['default'];

			    if (currentSlug) {
			      const parent = list.find(cat => cat.slug === currentSlug);
			      if (parent) list = list.filter(cat => cat.parent_id === parent.id);
			      else list = []; // no children found -> empty
			    } else {
			      list = list.filter(cat => cat.parent_id === 0); // root
			    }

			    const html = productCategoriesGridTemplate(list);
			    $popup.removeClass('loading').find('.content').html(html);
			    renderDone();
			  };

			  if (typeof categoryIndex !== 'undefined' && categoryIndex) {
			    // Use preloaded index
			    renderFromList(categoryIndex);
			  } else {
			    // Fallback to AJAX
			    $.ajax({
			      url: copt.ajaxUrl,
			      type: 'POST',
			      data: {
			        nonce: copt.dynamicProductCategoriesNonce,
			        category: currentSlug || false,
			        lang: currentLanguage,
			        action: 'et__fetch_product_dynamic_categories',
			      },
			      success: function (response) {
			        if (response && response.success && $('.product-categories-popup').length) {
			          $('.product-categories-popup').eq(0)
			            .removeClass('loading')
			            .find('.content')
			            .html(response.data.html);

			          if (typeof lazyLoad === 'function') {
			            lazyLoad(document.getElementsByClassName('product-categories-popup')[0]);
			          }
			          renderDone();
			        } else {
			          $popup.removeClass('loading');
			        }
			      },
			      error: function (xhr, status, error) {
			        console.log(error);
			        $popup.removeClass('loading');
			      }
			    });
			  }
			}

			/* ---------------- Handlers ---------------- */

			// Open popup at root (no back)
			$('body').on('click', '.categories-toggle', function(e){
			  e.preventDefault();
			  $('.sticky-dashboard').removeClass('off');

			  let $popup = $('.product-categories-popup').eq(0);
			  if ($popup.length) {
			    $popup.addClass('active');
			  } else {
			    $('body').append('<div class="product-categories-popup active loading"><div class="content"></div><span class="product-categories-toggle"></span></div>');
			    $popup = $('.product-categories-popup').eq(0);
			  }

			  catPath = []; // reset to root
			  fetchProductCategories(false);
			});

			// Go deeper (push slug)
			$('body').on('click', '.categories-grid-container .category.item-has-children > a', function(e){
			  e.preventDefault();
			  const slug = $(this).attr('data-slug');
			  if (!slug) return;

			  catPath.push(slug);
			  fetchProductCategories(slug);
			});

			// Back (pop one level)
			$('body').on('click', '.product-categories-popup a.cat-back', function(e){
			  e.preventDefault();

			  if (catPath.length > 0) catPath.pop(); // go up
			  const newCurrent = catPath.length ? catPath[catPath.length - 1] : false;

			  fetchProductCategories(newCurrent);
			});

			// Leaf click (optional: reset path or leave as-is)
			$('body').on('click', '.categories-grid-container .category:not(.item-has-children) > a', function(){
			  // catPath = []; // uncomment if you want to reset after choosing a leaf
			});

			// Close popup
			$('body').on('click', '.product-categories-toggle', function(e){
			  e.preventDefault();
			  $(this).closest('.product-categories-popup.active').removeClass('active');
			  catPath = []; // reset on close
			});

		/* Sticky dashboard account
		------------------*/

			function loadAccountNav(){

				if (!$('.account-nav.dynamic').length) {
					$('body').append('<div class="account-nav active dynamic loading"><span class="account-nav-toggle active"></span></div>')
				}

				$.ajax({
				    url: copt.ajaxUrl,
				    type: 'POST',
				    data: {
				      nonce:  copt.accountNavNonce,
				      action: 'et__account_nav',
				    },
				    success: function (response) {

				    	if (
				    		response && 
				    		response.hasOwnProperty('success') &&
				    		$('.account-nav').length
				    	) {
				    		$('.account-nav.dynamic').eq(0).removeClass('loading').append(response['data']['html']);
				    		$('.account-nav.dynamic').eq(0).find('.is-active').removeClass('is-active');
				    	}
				    },
				    error: function (xhr, status, error) {
				      console.log(error);
				    }
				  });
			}

			$('body').on('click','.account-nav-toggle',function(e){

				e.preventDefault();

				if ($('.wan-toggle').length) {
					$('.woocommerce-MyAccount-navigation').toggleClass('active');
					$('.sticky-dashboard').addClass('off');
					return;
				}

				let $this = $(this);
				let wrapper = $this.parent('.account-nav').length ? $this.parent('.account-nav') : $('.account-nav').eq(0);

				if (wrapper.length) {

					if ($this.hasClass('active')) {
						$('.account-nav').eq(0).each(function(){
							$(this).removeClass('active');
						});
						$('.sticky-dashboard').removeClass('off');
						return;
					} else {
						$('.sticky-dashboard').addClass('off');
					}

					wrapper.addClass('active');

				} else if(!$this.hasClass('active')) {
					$('.sticky-dashboard').addClass('off');
					loadAccountNav();
				}

				
			});

		/* Mobile toggle
		----*/

			$('<div class="mobile-container-overlay"></div>')
			.insertAfter($('.mobile-container').eq(0));

			$('body').on('click','.et__mobile-toggle',function(){
				$('.mobile-container').eq(0).toggleClass('active');
				$('.sticky-dashboard').toggleClass('off');
			});

			$('body').on('click','.mobile-container-overlay',function(){
				$('.mobile-container').eq(0).removeClass('active');
				$('.sticky-dashboard').removeClass('off');
			});

		/* Megamenu
		----*/

		    alignMegamenuToInner();

		    $(window).on('resize', function(){
		        alignMegamenuToInner();
		    });

		    $(window).on('scroll', function(){
		        alignMegamenuToInner();
		    });

		/* Submenu
		----*/

			function submenuPosition(){

				$('.et__header.desktop .header-menu > .menu-item').each(function(){

					var $this = $(this);

					if ($this.children('.sub-menu:not(.megamenu)').length) {

						if( $this.offset().left + $this.width() + $this.children('.sub-menu').width() > $(window).innerWidth()){
							$this.addClass('submenu-left');
						} else {
							$this.removeClass('submenu-left');
						}

					}

				});

			}

			submenuPosition();
			$(window).resize(submenuPosition);

		/* Effect
		----*/

			function currentMenuItemOffset(currentMenuItem, isRTL) {
				// Kept for compatibility if you use it elsewhere,
				// but we won't rely on it in the new code.
				let activeOffset = currentMenuItem.children('a').find('.effect').offset().left || 0;

				if (isRTL) {
					activeOffset += currentMenuItem.children('a').find('.effect').width();
				}

				return activeOffset;
			}

			$('.nav-menu:not(".megamenu-demo")').each(function () {

				const menu   = $(this);
				const $items = menu.children('.depth-0');

				// Mark a single current item
				$items.removeClass('cmi');

				let currentMenuItem = menu.find('.depth-0.current-menu-item').first();

				if (!currentMenuItem.length) {
					currentMenuItem = menu.find(
						'.depth-0.current-menu-parent, ' +
						'.depth-0.current-menu-ancestor, ' +
						'.depth-0.current_page_parent, ' +
						'.depth-0.current_page_item'
					).first();
				}

				if (currentMenuItem.length) {
					currentMenuItem.addClass('cmi');
				} else {
					currentMenuItem = $items.first().addClass('cmi');
				}

				if (!currentMenuItem.length) {
			        return;
			    }

			    const isLineOverUnder =
			        menu.parent().hasClass('overline') ||
			        menu.parent().hasClass('underline');

			    // Helpers ----------------------------------------------------------

			    function getTargetElement($li) {
			        if (isLineOverUnder) {
			            return $li.find('> .mi-link > .txt');
			        }
			        return $li.find('> .mi-link');
			    }

			    // EFFECT ELEMENT
			    const $effect = currentMenuItem.children('a').find('.effect');
			    if (!$effect.length) {
			        return;
			    }

			    // FIXED ORIGIN: the text of the current menu item (.cmi)
			    let $originItem = currentMenuItem;
			    let originRect  = null;

			    function updateOriginRect() {
			        const $originTarget = getTargetElement($originItem);
			        if ($originTarget.length) {
			            originRect = $originTarget[0].getBoundingClientRect();
			        }
			    }

			    updateOriginRect(); // set once on init

			    function getItemMetrics($li) {
			        const $target = getTargetElement($li);
			        if (!$target.length || !originRect) {
			            return { x: 0, w: 0 };
			        }

			        const targetRect = $target[0].getBoundingClientRect();

			        // distance from original active item → this item
			        let x = targetRect.left - originRect.left;
			        let w = targetRect.width;

			        if (isRTL) {
			            // optional RTL tweak; you can adjust if needed
			            x = targetRect.right - originRect.right;
			        }

			        return { x, w };
			    }

			    function positionEffect($li, instant) {
			        const metrics = getItemMetrics($li);

			        if (instant) {
			            gsap.set($effect, {
			                x: metrics.x,
			                width: metrics.w
			            });
			        } else {
			            gsap.to($effect, {
			                duration: 0.35,
			                x: metrics.x,
			                width: metrics.w,
			                ease: 'power3.out',
			                overwrite: 'auto'
			            });
			        }
			    }

			    // Debounced resize: recompute origin because layout may change
			    let resizeTimer = null;
			    function onResize() {
			        clearTimeout(resizeTimer);
			        resizeTimer = setTimeout(function () {
			            updateOriginRect(); // recalc origin from .cmi
			            const $cmi = menu.children('.depth-0.cmi').eq(0);
			            if ($cmi.length) {
			                positionEffect($cmi, true);
			            }
			        }, 150);
			    }

			    // INIT
			    setTimeout(function () {
			        positionEffect(currentMenuItem, true); // x=0 for active item
			    }, 0);

			    $(window).on('resize', onResize);

			    $(window).on('scroll',function(){
			    	if ($('.et__header.desktop.sticky').length) {
			    		onResize();
			    	}
			    });

			    // HOVER HANDLERS
			    const $topItems = menu.children('.depth-0');

			    $topItems.on('mouseenter touchstart', function () {
			        const $this = $(this);

			        $this.removeClass('inactive').siblings().addClass('inactive');
			        positionEffect($this, false);
			    });

			    menu.on('mouseleave', function () {
			        const $cmi = menu.children('.depth-0.cmi').eq(0).removeClass('inactive');
			        if ($cmi.length) {
			            positionEffect($cmi, false);
			        }
			    });

			});


	})(jQuery);

	/* Mobile tabs
	----*/

		(function ($) {

			"use strict";

		  if (!$('.mobile-tab-item').length) return;

		  const $mobileTabsContainer = $('.mobile-container').eq(0);

		  // Wrap all content panes once (only if not already wrapped)
		  if (!$mobileTabsContainer.children('.tabs-container').length) {
		    $mobileTabsContainer
		      .find('.mobile-tab-item')
		      .wrapAll('<div class="mobile-tabs-container tabs-container"></div>');
		  }

		  // Build the tab headers
		  const headers = [];
		  $mobileTabsContainer.find('.mobile-tab-item').each(function () {
		    const $pane = $(this);
		    const title = $pane.attr('data-mob-tab-title') || '';
		    const icon  = $pane.attr('data-mob-tab-icon')  || '';

		    const iconSpan = icon
		      ? `<span class="icon mobile-icon" style="-webkit-mask:url('${icon}') no-repeat 50% 50%;mask:url('${icon}') no-repeat 50% 50%;"></span>`
		      : '';

		    const titleSpan = title ? `<span class="txt">${title}</span>` : '';

		    headers.push(`<div class="tab-item" role="tab" tabindex="0">${iconSpan}${titleSpan}</div>`);
		  });

		  const $tabset = $(
		    `<div class="tabset mobile-tabset" role="tablist" aria-label="Mobile tabs">${headers.join('')}</div>`
		  );

		  // Insert headers before the content wrapper
		  $tabset.insertBefore($mobileTabsContainer.find('.mobile-tabs-container'));

		  const $tabs       = $tabset.children('.tab-item').addClass('mobile-tab-item');
		  const $panesWrap  = $mobileTabsContainer.children('.tabs-container').eq(0);
		  const $panes      = $panesWrap.children('.mobile-tab-item');

		  // Ensure one active tab/pane
		  let activeIndex = $tabs.index($tabs.filter('.active').eq(0));
		  if (activeIndex < 0) activeIndex = 0;

		  function activate(i) {
		    i = Math.max(0, Math.min(i, $tabs.length - 1));
		    $tabs.removeClass('active').attr({'aria-selected': 'false', 'tabindex': '-1'});
		    $tabs.eq(i).addClass('active').attr({'aria-selected': 'true', 'tabindex': '0'});

		    $panes.removeClass('active').attr('hidden', 'hidden');
		    $panes.eq(i).addClass('active').removeAttr('hidden');
		  }

		  activate(activeIndex);

		  // Event delegation: click + keyboard (Enter/Space)
		  $tabset.on('click', '.tab-item', function (e) {
		    const i = $(this).index();
		    if (!$(this).hasClass('active')) activate(i);
		    e.preventDefault();
		  });

		  $tabset.on('keydown', '.tab-item', function (e) {
		    const $t = $(this);
		    let i = $t.index();

		    // Enter/Space to activate
		    if (e.key === 'Enter' || e.key === ' ') {
		      activate(i);
		      e.preventDefault();
		      return;
		    }

		    // Optional: Left/Right arrow navigation
		    if (e.key === 'ArrowRight') {
		      activate(Math.min(i + 1, $tabs.length - 1));
		      $tabs.eq(Math.min(i + 1, $tabs.length - 1)).focus();
		      e.preventDefault();
		    } else if (e.key === 'ArrowLeft') {
		      activate(Math.max(i - 1, 0));
		      $tabs.eq(Math.max(i - 1, 0)).focus();
		      e.preventDefault();
		    }
		  });

		})(jQuery);

	/* Mobile navigation
	----*/

		(function ($) {

			"use strict";

			function isolate($link){
				if ($link.next('ul').length != 0) {
		            if ($link.parent().hasClass('isolate')) {
						$link.parent().removeClass('isolate').removeClass('disable');
						if ($link.closest('.isolate').length) {
		                	$link.closest('.isolate').removeClass('disable').find('.hide').removeClass('hide');
		                } else {
		                	$link.parents('.mobile-menu').find('.hide').removeClass('hide');
		                }
					} else {
		                $link.parent().addClass('isolate');
		                $link.parents('.mobile-menu').find('.isolate').not($link.parent()).addClass('disable');
		                $link.parent().siblings().addClass('hide');
		            }
		        };
			}

			// Animate mobile
			const mobileContainer = $('.mobile-container').eq(0);

			mobileContainer.find('.mobile-menu').each(function(){

				const menu = $(this);
				const $items = menu.find('.menu-item');

				// Mark a single current item
				$items.removeClass('cmi');

				var currentMenuItem = menu.find('.current-menu-item').first();

				if (!currentMenuItem.length) {
					currentMenuItem = menu.find('.current-menu-parent, .current-menu-ancestor, .current_page_parent, .current_page_item').first();
				}

				if (currentMenuItem.length) currentMenuItem.addClass('cmi');

			});

			$('#mobile-menu-default .menu-item-has-children').each(function(){
				$(this).children('a').append('<span class="arrow" />');
			});

			$('.mobile-menu .menu-item-has-children > a').each(function(){

				let $link = $(this);
				let $linkHref = $link.attr('href');

				if (!$link.attr('href').startsWith('#')) {
					$link.attr('href', '#');
					$link.next('ul').append(
					  $('<li class="view-all menu-item"><a class="mi-link" href="'+$linkHref+'"><span class="txt">'+copt.strings.viewAll+'</span><span class="arrow"></span></a></li>')
					);
				}

				if ($link.attr('href') == "#") {
					$link.on('click',function(e){
						e.preventDefault();
						$link.parent().toggleClass('active');
						isolate($link);
					});
				} else {
					$link.find('.arrow').on("click", function(e){
						e.preventDefault();
						var $this = $(this);
						isolate($link);
					});
				}
			});

			if (window.matchMedia('(max-width: 767px)')) {
				$('.et-menu .menu-item-has-children > a').each(function(){
					var $link = $(this);
					if ($link.attr( "href" ) == "#") {
						$link.on('click',function(e){
							e.preventDefault();
							$link.find('.arrow').toggleClass('active');
							$link.next('ul').stop().slideToggle(200);
						});
					} else {
						$link.find('.arrow').on("click", function(e){
							e.preventDefault();
							var $this = $(this);
							$this.toggleClass('active');
							$link.next('ul').stop().slideToggle(200);
						});
					}
				});
			}

		})(jQuery);

/* Main
----*/

	(function($){

		"use strict";

		/* megamenu
		----*/

			function megamenuTab(){

				$('.megamenu').each(function(){

					let megamenu = $(this);

					if (!megamenu.find('.megamenu-tab-item').length || megamenu.find('.megamenu-tabset').length) {
						return;
					}

					megamenu.addClass('container');

					megamenu
					.children('.elementor')
					.addClass('et__tabs')
					.addClass('vertical');

					var $children = megamenu.find('.megamenu-tab-item');

					var tabset = '<div class="tabset megamenu-tabset megamenu-tabs-component">';

		        		$children.wrapAll('<div class="megamenu-tabs-container tabs-container megamenu-tabs-component" />');

						$children.each(function(){

							var tab    = $(this).addClass('megamenu-tab-item').addClass('tab-content'),
								title  = ((typeof(tab.attr('data-megamenu-tab-title')) != 'undefined') ? tab.attr('data-megamenu-tab-title') : 'Tab title #'+(tab.index()+1)),
								icon   = tab.attr('data-megamenu-tab-icon'),
								active = tab.hasClass('active');

							tabset += (active) ? '<div class="tab megamenu-tab-item active">' : '<div class="tab megamenu-tab-item">';
								if (typeof(icon) != "undefined" && icon.length) {
									tabset += '<span class="icon megamenu-tab-icon" style="mask: url('+icon+') no-repeat 50% 50%;-webkit-mask: url('+icon+') no-repeat 50% 50%;"></span>';
								}
								if (typeof(title) != "undefined" && title.length) {
									tabset += '<span class="txt">'+title+'</span>';
								}
							tabset += '</div>';
						});

						tabset += '</div>';

						$(tabset).insertBefore(megamenu.find('.megamenu-tabs-container'));

					var tabs 	          = megamenu.find('.tab'),
						tabsQ    		  = tabs.length,
						tabsDefaultWidth  = 0,
						tabsDefaultHeight = 0,
						tabsContent 	  = megamenu.find('.megamenu-tabs-container').children('.tab-content'),
						action      	  = 'click';

					var tabSet = megamenu.find('.tabset');

					if(!tabs.hasClass('active')){
						tabs.first().addClass('active');
					}

					tabs.each(function(){

						var $thiz = $(this);

						if ($thiz.hasClass('active')) {
							$thiz.siblings().removeClass("active");
							tabsContent.eq($thiz.index()).addClass('active').siblings().removeClass('active');
						}

					});

					if(tabsQ >= 2){

						tabs.on('click', function(e){
							e.preventDefault();

							var $self = jQuery(this);

							if(!$self.hasClass("active")){

								$self.addClass("active");

								$self.siblings()
								.removeClass("active");

								tabsContent.removeClass('active');
								tabsContent.eq($self.index()).addClass('active');
								
							}
						});
						
					}

				});
				
			}

			function megamenuOffset() {
			    jQuery('.mm-true > a[data-offset-x], .mm-true > a[data-offset-y]').each(function () {
			        const $link    = jQuery(this);
			        const offsetX  = parseFloat($link.data('offset-x')) || 0;
			        const offsetY  = parseFloat($link.data('offset-y')) || 0;

			        // Assuming the megamenu panel is the next element or some known target:
			        const $panel = $link.next('.megamenu');

			        if (!$panel.length) {
			            return;
			        }

			        // Use transforms as we discussed earlier
			        $panel.css({
			        	'margin-left':offsetX + 'px',
			        	'margin-top':offsetY + 'px',
			        });
			    });
			}

			megamenuTab();
			megamenuOffset();

			function megamenuAjax(megamenus){
				$.ajax({
	                url:copt.ajaxUrl,
	                type: 'post',
	                data: {
	                	action:'megamenu_load',
	                	nonce:copt.megamenuLoadNonce,
	                	megamenus:megamenus.join('|'),
	                },
	                success: function(data) {

	                	if (!$.isEmptyObject(data)) {

		                	Object.entries(data).forEach(entry => {
								const [key, value] = entry;

								var holder = $('a[data-megamenu="'+key+'"]');

								if(
									typeof(holder) != "undefined" && 
									holder.length &&
									!holder.next('#megamenu-'+key).length
								){
									$(value).insertAfter(holder);
									holder.removeClass('loading-menu');
								}

								megamenuOffset();
								megamenuTab();
								alignMegamenuToInner();
							});

							var id = $('.et__header.desktop').attr('id');
							lazyLoad(document.getElementById(id));

							if ($('.sidebar-menu-container.mm').length) {
								lazyLoad(document.getElementById($('.sidebar-menu-container.mm .sidebar-menu').attr('id')));
							}

						}

					},
					error: function(data){
						console.log('Something went wrong, please contact site administrator');
					}
	            });
			}


			if (!$('body').hasClass('single-header')) {

				var megamenus = [];

				$('.menu-item.mm-ajax').each(function(){
					var $this = $(this),
						megamenu = $this.children('a').attr('data-megamenu');
					if (typeof(megamenu) != 'undefined') {
						megamenus.push(megamenu);						
					}
				});

				$('.et__button.megamenu-ajax').each(function(){
					var $this = $(this),
						megamenu = $this.attr('data-megamenu');
					if (typeof(megamenu) != 'undefined') {
						megamenus.push(megamenu);						
					}
				});

				if (megamenus.length && (window.self === window.top || !window.name.startsWith("customize-preview"))) {
					megamenuAjax(megamenus);
				}

			}

			$('.mm-ajax').each(function(){
				if ($(this).find('.sub-menu').length) {
					$(this).children('.mi-link').removeClass('loading-menu');
				}

				$(this).on('mouseenter',function(){
					if (!$(this).find('.sub-menu').length) {
						$(this).children('.mi-link').addClass('loading-menu');
					} else {
						$(this).children('.mi-link').removeClass('loading-menu');
					}
				});
			});

		/* et__heading
		----*/

			$('.et__heading.animate').each(function(){

				var $this = $(this),
					delay = '+='+(0.2 + parseInt($this.data('delay'))/1000),
					text  = $this.find('.text');

				var tl = new gsap.timeline({paused: true});

				if ($this.hasClass('curtain')) {

					var curtain = $this.find('.curtain');

					tl.to(curtain,0.8, {
					  scaleX:1,
					  transformOrigin:'left top',
					  ease:"power3.out"
				    },delay);

				    tl.to(curtain,0.8, {
					  scaleX:0,
					  transformOrigin:'right top',
					  ease:"power3.out"
				    });

				    tl.to(text,0.2, {
					  opacity:1,
				    },'-=0.8');
				}

				else if ($this.hasClass('letter')) {
					var letterText = new SplitText(text,{type:"chars"});

					gsap.set($this,{perspective:500});

					tl.from(letterText.chars,{
						duration: 0.2,
					},delay);

					tl.from(letterText.chars,{
						duration: 0.6,
						opacity:0,
						scale:3,
						x:100,
						y:50,
						force3D:true,
						stagger: 0.01,
						ease:"expo.out"
					},'-=0.2');

				}

				else if ($this.hasClass('words')) {

					var wordsText = new SplitText(text,{type:"words"});
					
					gsap.set($this,{perspective:500});

					tl.from(wordsText.words,{
						duration: 0.2,
					},delay);

					tl.from(wordsText.words,{
						duration: 0.8,
						opacity:0,
						scaleY:1.5,
						transformOrigin:'left top',
						y:24,
						force3D:true,
						stagger: 0.04,
						ease:"expo.out"
					},'-=0.2');

				}

				else if ($this.hasClass('rows')) {
					
					var rowsText = new SplitText(text,{type:"lines"});
					
					gsap.set($this,{perspective:1000});

					tl.from(rowsText.lines,{
						duration: 0.4,
					},delay);

					tl.from(rowsText.lines,{
						duration: 1.2,
						opacity:0,
						rotationX:8,
						rotationY:-50,
						rotationZ:8,
						y:50,
						x:-50,
						z:50,
						transformOrigin:'left top',
						force3D:true,
						stagger: 0.08,
						ease:"expo.out"
					},'-=0.2');

				}

				inView(this, function (isVisible) {
					$this.addClass('fired');
					tl.progress(0);
					tl.play();
				}, true,0.5);

			});

		/* et__button
		----*/

			$('.et__button.hover').each(function(){

				var $this = $(this);

				if ($this.next('.sub-menu').length) {
					$this.removeClass('loading-menu');
				}

				if ($this.hasClass('mm-true')) {

					$this.unbind('mouseenter').on('mouseenter',function(){
						if (!$this.next('.sub-menu').length) {
							$this.addClass('loading-menu');
						} else {
							$this.removeClass('loading-menu');
						}
					});

				}

				$this.parent().hover(
					function(){
						setTimeout(function(){$this.parent().addClass('hover');},200);
					},
					function(){
						$this.parent().removeClass('hover');
					}
				);

			});

			$('body').on('click', '.et__button.click', function(e){
				if ($(this).next('.sub-menu').length) {
					e.preventDefault();
					$(this).removeClass('loading-menu').toggleClass('active');

					if ($(this).parents('.et__header').length && $(this).hasClass('active')) {
						jQuery('.et__header .hbe-toggle.active').not('.et__mobile-toggle').each(function(){
							jQuery(this).parent().find('.hbe-toggle').trigger('click');
						});
					}
				}
			});

			$('body').on('mouseout','.et__button.scale',function(){
				var $this  = $(this);
				var tl = new gsap.timeline({paused: true});
				var back = $this.find('.button-back');

				gsap.to(back,0.8, {
					scale:1,
					ease:"expo.out"
				});
			});

			$('body').on('mouseover','.et__button.scale',function(){
				var $this  = $(this);
				var tl = new gsap.timeline({paused: true});
				var back = $this.find('.button-back');

				gsap.to(back,0.8, {
					scale:1.05,
					ease:"elastic.out"
				});
			});

			$('body').on('click', '.et__button.smooth:not(.modal)', function(e){
			  e.preventDefault();

			  const sel = $(this).attr('href');
			  const $target = $(sel);
			  if (!$target.length) return false;

			  const ease = t => 1 - Math.pow(1 - t, 3); // easeOutCubic
			  const startY = window.pageYOffset || document.documentElement.scrollTop || 0;
			  const targetY = $target.offset().top;

			  const getHeaderOffset = () => {

			  	let $offset = 0;

			    const $h = $('.et__header.sticky.active').last();
			    const $bar = $('#wpadminbar');

			    if ($h.length) {
			    	$offset += $h.outerHeight();
			    }

			    if ($bar.length && $('.et__header.desktop').length) {
			    	$offset += $bar.outerHeight();
			    }

			    return $offset;
			  };

			  const duration = 800; // ms
			  const start = performance.now();

			  function step(now){
			    const t = Math.min(1, (now - start) / duration);
			    const y = targetY - getHeaderOffset(); // re-evaluate while scrolling
			    const current = startY + (y - startY) * ease(t);
			    window.scrollTo(0, current);
			    if (t < 1) requestAnimationFrame(step);
			  }

			  requestAnimationFrame(step);
			  return false;
			});

			$('body').on('click','.et__button.modal:not(.smooth)',function(e){
				e.preventDefault();
				var $this  = $(this);
				gsapLightbox($this,false);
			});

		/* et__image
		----*/

			function disableParallax(){
				if ($(window).width() <= 1200) {
					$('.et__image.parallax').each(function(){
						$(this).addClass('parallax-off');
					});
				} else {
					$('.et__image.parallax').each(function(){
						$(this).removeClass('parallax-off');
					});
				}
			}

			$('.et__image.parallax').each(function(){

				var $this = $(this);
				var x     = $this.data('coordinatex'),
                    y     = $this.data('coordinatey'),
                    limit = $this.data('limit');

                if (typeof(limit) == 'undefined') {limit = 0}

				$(window).scroll(function(){

					if (!$this.hasClass('parallax-off')) {

						var yPos   = Math.round((0-$(window).scrollTop()) / $this.data('speed'))  +  y;
						var scroll = (Math.sign(y) == -1) ? Math.round((0-$(window).scrollTop()) / $this.data('speed')) : yPos;

						if (Math.abs(scroll) > limit && limit > 0) {
							yPos = (Math.sign(y) == -1) ? Math.sign(yPos)*(limit+Math.abs(y)) : Math.sign(yPos)*limit;
						}

						gsap.to($this.children('img'),0.8,{
							x:x,
							y:yPos,
							force3D:true,
						});

					}

				});
				
			});

			disableParallax();	
			$(window).resize(disableParallax);

		/* et__gallery
		----*/

			$('.et__gallery').each(function(){

				const gallery = $(this);

				if (gallery.hasClass('curtain')) {
				  const items    = gsap.utils.toArray(gallery.find('li'));      // <li> nodes
				  const curtains = items.map(li => $(li).find('.curtain')[0]);  // .curtain nodes
				  const imgs     = items.map(li => $(li).find('img')[0]);       // img nodes

				  // Create a consistent random order once
				  const order = gsap.utils.shuffle([...Array(items.length).keys()]);
				  const each  = 0.08; // spacing between items
				  const staggerFn = (i) => order.indexOf(i) * each;

				  const tl = gsap.timeline({ paused: true });

				  // Curtain open then close (keyframes), staggered in a consistent random order
				  tl.to(curtains, {
				    keyframes: [
				      { scaleX: 1, transformOrigin: 'left top',  duration: 0.8, ease: 'power3.out' },
				      { scaleX: 0, transformOrigin: 'right top', duration: 0.8, ease: 'power3.out' }
				    ],
				    stagger: staggerFn
				  }, 0);

				  // Image fade in slightly before curtain finishes
				  tl.to(imgs, { 
				    opacity: 1, 
				    duration: 0.2, 
				    stagger: staggerFn 
				  }, 0.6);

				  // Image scale from 1.1 → 1 with cubic ease right after curtain closes
				  tl.fromTo(imgs, 
				    { scale: 1.1 },
				    { 
				      scale: 1, 
				      duration: 0.6, 
				      ease: 'cubic-bezier(.19,1,.22,1)', // custom smooth cubic ease
				      stagger: staggerFn 
				    }, '>-0.3' // starts right after the curtain animation ends
				  );

				  inView(gallery[0], function(isVisible){
				    if (isVisible) {
				      gallery.addClass('fired');
				      tl.progress(0).play();
				    }
				  }, true, 0.5);
				}

				// inside your widget init
				const gid = gallery.attr('id') || 'et-gallery-' + Date.now();

				gallery.find('a[href]').each(function () {
				  const href = this.getAttribute('href') || '';
				  if (/\.(jpe?g|png|bmp|gif|svg|webp)(\?.*)?$/i.test(href)) {
				    this.setAttribute('data-elementor-open-lightbox', 'yes');
				    this.setAttribute('data-elementor-lightbox-slideshow', gid);
				  }
				});
				
			});

			$('body').on('click','.et__gallery a[href]',function(){
				waitForElement('.swiper-zoom-container', () => {

					$('.dialog-lightbox-widget').addClass('et-slideshow-ui-show');

					$('.swiper-zoom-container img').each(function(){
						const src = $(this).attr('data-src') || false;
						if (src) {
							$(this).attr('src',src).removeAttr('data-src');
						}
					});
				});
			});

		/* et__counter
		----*/

			$('.et__counter').each(function(){

				var $this    = $(this),
	           		dDelay   = $this.data('delay'),
		            delay    = (dDelay) ? dDelay/1000 : (0.2 + $this.index()*0.01),
		            value    = $this.data('value'),
		            counter  = $this.find('.counter'),
		            counterV = { var: 0 };

	            var tl = new gsap.timeline({paused: true});

	            tl.to($this.find('.in'),{
	                duration: 0.8,
	                delay:delay,
	                opacity:1,
	                stagger: 0.1,
	                x:0,
	                transformOrigin:'left top',
	                force3D:true,
	                ease:"expo.out"
	            });

	            tl.to(counterV,{
	                var:value,
	                duration:1,
	                onUpdate: function () {
	                    counter.html(Math.ceil(counterV.var));
	                },
	            },'-=0.85');

	            tl.to($this.find('.icon'),{
	                duration: 0.2,
	                opacity:1,
	            },'-=0.6');

	            tl.to($this.find('.icon'),{
	                duration: 1.6,
	                scale:1,
	                force3D:true,
	                ease:"elastic.out"
	            },'-=0.6');
	            
	            inView(this, function(isVisible){
				    if (isVisible) {
				      $this.addClass('fired');
				      tl.progress(0).play();
				    }
				}, true, 0.5);
			});

		/* et__progress
		----*/

			$('.et__progress').each(function(){

				var $this    = $(this),
		            type     = ($this.hasClass('circle')) ? 'circle' : 'default',
		            delay    = (0.2 + $this.index()*0.01),
		            value    = $this.data('percentage'),
		            counterV = { var: 0 },
		            counter  = $this.find('.percent');

		            var tl = new gsap.timeline({paused: true});

		            if (type == 'default') {

		                tl.from($this.find('.bar'),{
		                    duration: 1.6,
		                    delay:delay,
		                    scaleX:0,
		                    force3D:true,
		                    transformOrigin:'left top',
		                    ease:"expo.out"
		                });

		                tl.from($this.find('.text'),{
		                    duration: 0.8,
		                    opacity:0,
		                    x:50,
		                    transformOrigin:'left top',
		                    force3D:true,
		                    ease:"expo.out"
		                },'-=1.6');

		                tl.to(counterV,{
		                    var:value,
		                    duration:1,
		                    onUpdate: function () {
		                        $this.find('.bar').html('<span class="percent">'+Math.ceil(counterV.var)+'</span>');
		                    },
		                },'-=1.4');

		            } else {

		                var bar           = $this.get(0).querySelector('.bar-circle'),
		                    circumference = 27 * 2 * Math.PI,
		                    offset        = circumference - value / 100 * circumference;

		                bar.style.strokeDasharray = circumference+' '+circumference;
		                bar.style.strokeDashoffset = circumference;

		                tl.to(bar,{
		                    duration: 0.2,
		                    delay:delay,
		                    opacity:1
		                });

		                tl.to(bar,{
		                    duration: 2,
		                    strokeDashoffset:offset,
		                    ease:"expo.out"
		                },'-=0.2');

		                tl.from($this.find('.text').children(),{
		                    duration: 0.8,
		                    opacity:0,
		                    y:50,
		                    stagger:0.1,
		                    transformOrigin:'left top',
		                    force3D:true,
		                    ease:"expo.out"
		                },'-=2');

		                tl.to(counterV,{
		                    var:value,
		                    duration:1,
		                    onUpdate: function () {
		                        counter.html(Math.ceil(counterV.var));
		                    },
		                },'-=2');

		            }

		            inView(this, function(isVisible){
					    if (isVisible) {
					      $this.addClass('fired');
					      tl.progress(0).play();
					    }
					}, true, 0.5);

			});

		/* et__stagger-box
		----*/

			function buildStaggerBoxTimeline(tl,delay,interval,stagger,content){

				switch(stagger){

					case "left":

						tl.from(content,{
						  	duration: 1.2,
							x:-100,
							stagger: interval,
							opacity:0,
							ease:"expo.out"
						},delay);

					break;

					case "right":

						tl.from(content,{
						  	duration: 1.2,
							x:100,
							stagger: interval,
							opacity:0,
							ease:"expo.out"
						},delay);

					break;

					case "top":

						tl.from(content,{
						  	duration: 1.2,
							y:-100,
							stagger: interval,
							opacity:0,
							ease:"expo.out"
						},delay);

					break;

					case "bottom":

						tl.from(content,{
						  	duration: 1.2,
							y:100,
							stagger: interval,
							opacity:0,
							ease:"expo.out"
						},delay);

					break;
				}

			}

			$('.et__stagger-box').each(function(){

				var element   = this,
					$this     = $(element),
					id        = $this.attr('id'),
					delay     = '+='+(0.2 + parseInt($this.data('delay'))/1000),
					interval  = parseInt($this.data('interval'))/1000,
					stagger   = $this.data('stagger'),
					content   = $this.children('.e-con-inner').length ? 
					$this.children('.e-con-inner').children('.elementor-element').not('.elementor-widget-et_gap') : 
					$this.children('.elementor-element').not('.elementor-widget-et_gap');

				var tl = new gsap.timeline({paused: true});
				buildStaggerBoxTimeline(tl,delay,interval,stagger,content);

				inView(this, function (isVisible) {

					$this.addClass('fired');
					tl.progress(0);
					tl.play();
					
				}, true,0.5);


			});

		/* et__parallax
		----*/

			$('.et__parallax').each(function(){
	            var $this = $(this);
				
	            $this.append('<div class="parallax-container active" style="background-image:url('+$this.attr('data-parallax-image')+');" />');

	            var plx      = $this.find('.parallax-container'),
					duration = parseInt($this.data('parallax-duration')),
	            	ratio    = (typeof(duration) != 'undefined' && duration != null && duration != 0) ? 0.5 : 1;

            	if (duration == null) {duration = 0;}

            	duration = duration/100;

	            $(window).scroll(function() {
	                var yPos = Math.round(($(window).scrollTop()-plx.offset().top));

	                yPos = ratio*yPos;

	                gsap.to(plx,{
	                	duration:duration,
	                	delay:0,
	                	y:yPos,
	            	});
	            });

	        });

	    /* et__tab
		----*/

			$('.et__tabs').each(function(){

				var $this    = $(this),
		            tabs     = $this.find('.tab'),
		            tabsQ    = tabs.length,
		            tabsDefaultWidth  = 0,
		            tabsDefaultHeight = 0,
		            tabsContent = $this.find('.tab-content');

		            var tabSet = $this.find('.tabset');
		            if(!tabSet.find('.active').length){
		                tabs.first().addClass('active');
		            }
		            
		            tabs.each(function(){

		                var $thiz = jQuery(this);

		                if ($thiz.hasClass('active')) {
		                    $thiz.siblings()
		                    .removeClass("active");
		                    tabsContent.removeClass('active');
		                    tabsContent.eq($thiz.index()).addClass('active');
		                }

		                tabsDefaultWidth += jQuery(this).outerWidth();
		                tabsDefaultHeight += jQuery(this).outerHeight();
		            });

		            if(tabsQ >= 2){

		                tabs.unbind('click').on('click', function(){
		                    var $self = jQuery(this);
		                    
		                    if(!$self.hasClass("active")){

		                        $self.addClass("active");

		                        $self.siblings()
		                        .removeClass("active");

		                        tabsContent.removeClass('active');
		                        tabsContent.eq($self.index()).addClass('active');
		                    }
		                    
		                });
		            }

		            if(tabsDefaultWidth >= $this.outerWidth()  && $this.hasClass('horizontal')){
		                $this.addClass('tab-full');
		            } else {
		                $this.removeClass('tab-full');
		            }
			});

	        $('.section-tab').each(function(){

	        	var $scope = $(this);
				var $children  = $scope.children('.e-con-inner').length ? $scope.children('.e-con-inner').children('.e-con') : $scope.children('.e-con');

				if (typeof($children) != "undefined") {

		        	var tabset = '<div class="tabset section-tabset section-tabs-component">';

		        		$children.wrapAll('<div class="section-tabs-container tabs-container section-tabs-component" />');

						$children.each(function(){

							var tab    = $(this).addClass('section-tab-item').addClass('tab-content'),
								title  = ((typeof(tab.attr('data-section-tab-title')) != 'undefined') ? tab.attr('data-section-tab-title') : 'Tab title #'+(tab.index()+1)),
								icon   = tab.attr('data-section-tab-icon'),
								active = tab.hasClass('active');

							tabset += (active) ? '<div class="tab section-tab-item active">' : '<div class="tab section-tab-item">';
								if (typeof(icon) != "undefined" && icon.length) {
									tabset += '<span class="icon section-tab-icon" style="mask: url('+icon+') no-repeat 50% 50%;-webkit-mask: url('+icon+') no-repeat 50% 50%;"></span>';
								}
								if (typeof(title) != "undefined" && title.length) {
									tabset += '<span class="txt">'+title+'</span>';
								}
							tabset += '</div>';
						});

						tabset += '</div>';

						$(tabset).insertBefore($scope.find('.section-tabs-container'));

					var tabs 	          = $scope.find('.tab'),
						tabsQ    		  = tabs.length,
						tabsDefaultWidth  = 0,
						tabsDefaultHeight = 0,
						tabsContent 	  = $scope.find('.section-tabs-container').children('.tab-content'),
						action      	  = 'click';

					var tabSet = $scope.find('.tabset');

					if(!tabs.hasClass('active')){
						tabs.first().addClass('active');
					}

					tabs.each(function(){

						var $thiz = $(this);

						if ($thiz.hasClass('active')) {
							$thiz.siblings().removeClass("active");
							tabsContent.eq($thiz.index()).addClass('active').siblings().removeClass('active');
						}

					});

					if(tabsQ >= 2){

						tabs.on('click', function(e){
							e.preventDefault();

							var $self = jQuery(this);

							if(!$self.hasClass("active")){

								$self.addClass("active");

								$self.siblings()
								.removeClass("active");

								tabsContent.removeClass('active');
								tabsContent.eq($self.index()).addClass('active');
								
							}
						});
						
					}

				}

			});

			function mobileTabsNav() {

			  const isMobile = window.innerWidth <= 1023;

			  $('.et__tabs .tabset, .section-tab .tabset').each(function () {
			    const $tabset = $(this);
			    const $existingWrap = $tabset.children('.mobile-tabset-wrap');

			    if (isMobile) {
			      // Build structure if not already built
			      if (!$existingWrap.length) {
			        const $tabs = $tabset.children('.tab');

			        // Get active tab's text or fallback to the first tab
			        const activeText = ($tabs.filter('.active').first().text() || $tabs.first().text() || '').trim();

			        // Create wrapper and move tabs into it
			        const $wrap = $('<div class="mobile-tabset-wrap" />');
			        $tabs.appendTo($wrap);

			        // Insert toggle button then wrapper
			        const $btn = $('<button type="button" class="mobile-tabset-nav" aria-expanded="false" />')
			          .text(activeText);
			        $tabset.prepend($btn).append($wrap);
			      } else {
			        // Update button text if active tab changed dynamically
			        const $tabs = $existingWrap.find('.tab');
			        const activeText = ($tabs.filter('.active').first().text() || $tabs.first().text() || '').trim();
			        $tabset.children('.mobile-tabset-nav').text(activeText);
			      }
			    } else {
			      // Desktop: remove mobile chrome if present
			      if ($existingWrap.length) {
			        $existingWrap.children('.tab').unwrap(); // unwrap tabs back to .tabset
			        $tabset.children('.mobile-tabset-nav').remove();
			      }
			    }
			  });
			  
			}

			mobileTabsNav();
			$(window).on('resize',mobileTabsNav);

			// Toggle handler (bind once, namespace-safe)
				$('body')
				.off('click.mobileTabsNav', '.mobile-tabset-nav')
				.on('click.mobileTabsNav', '.mobile-tabset-nav', function () {
				  const $btn = $(this);
				  const $wrap = $btn.siblings('.mobile-tabset-wrap');
				  const isOpen = !$wrap.hasClass('active');
				  $wrap.toggleClass('active', isOpen);
				  $btn.attr('aria-expanded', isOpen ? 'true' : 'false');
				});

			// When a tab is clicked on mobile, update button label and close menu
				$('body')
				.off('click.mobileTabsNav.tab', '.mobile-tabset-wrap .tab')
				.on('click.mobileTabsNav.tab', '.mobile-tabset-wrap .tab', function () {
				  const $tab = $(this);
				  const $tabset = $tab.closest('.tabset');
				  const $btn = $tabset.children('.mobile-tabset-nav');
				  $btn.text(($tab.text() || '').trim());
				  $tabset.children('.mobile-tabset-wrap').removeClass('active');
				  $btn.attr('aria-expanded', 'false');
				});

		/* et__accordion
		----*/

	        $('.et__accordion').each(function(){
				var $this  = $(this);

		        gsap.set($this.find('.accordion-title.active').next(),{
		            opacity: 1,
		            height: 'auto'
		        });


		        $this.find('.accordion-title').unbind('click').on('click', function(){

		            var $self = jQuery(this);

		                if(!$self.hasClass('active')){
		                    if($this.hasClass('collapsible-true')){

		                        $self.addClass("active").siblings().removeClass("active");

		                        gsap.to($self.next(),0.6, {
		                            height:'auto',
		                            ease:"expo.out"
		                        });

		                        gsap.to($self.next(),0.2, {
		                            opacity:1,
		                        });

		                        gsap.to($this.find('.accordion-content').not($self.next()),0.1, {
		                            opacity:0,
		                        });

		                        gsap.to($this.find('.accordion-content').not($self.next()),0.6, {
		                            height:0,
		                            ease:"expo.out"
		                        });

		                    } else {
		                        $self.addClass("active");

		                        gsap.to($self.next(),0.6, {
		                            height:'auto',
		                            ease:"expo.out"
		                        });

		                        gsap.to($self.next(),0.2, {
		                            opacity:1,
		                        });

		                    }
		                } else {
		                    if(!$this.hasClass('collapsible-true')){
		                        $self.removeClass("active");
		                        $self.removeClass("active");

		                        gsap.to($self.next(),0.1, {
		                            opacity:0,
		                        });

		                        gsap.to($self.next(),0.6, {
		                            height:0,
		                            ease:"expo.out"
		                        });
		                    }
		                }

		        });
			});

			$('.section-accordion').each(function(){

	        	var $scope    = $(this);
				var $children = $scope.children('.e-con-inner').length ? $scope.children('.e-con-inner').children('.e-con') : $scope.children('.e-con');

	        	if (typeof($children) != "undefined") {

			    		var sectionAccordionHTML = $scope[0].hasAttribute('data-section-accordion-type') ? 
			    		'<div class="section-accordion collapsible-'+$scope.data('section-accordion-type')+'"/>' :
			    		'<div class="section-accordion" />';

			    		$children.wrapAll(sectionAccordionHTML);

			    		$children.each(function(){

							var accordion = jQuery(this).addClass('section-accordion-content').addClass('section-accordion-item'),
								title     = ((typeof(accordion.attr('data-section-accordion-title')) != 'undefined') ? accordion.attr('data-section-accordion-title') : 'Accordion title #'+(accordion.index()+1)),
								icon      = accordion.attr('data-section-accordion-icon'),
								active    = accordion.hasClass('active');

							var acTitle = (active) ? '<div class="accordion-title section-accordion-title active">' : '<div class="accordion-title section-accordion-title">';
								if (typeof(icon) != "undefined" && icon.length) {
									acTitle += '<span class="accordion-icon section-accordion-icon" style="mask: url('+icon+') no-repeat 50% 50%;-webkit-mask: url('+icon+') no-repeat 50% 50%;margin-right: 8px;width: 20px;height: 20px;"></span>';
								}
								if (typeof(title) != "undefined" && title.length) {
									acTitle += '<span class="txt">'+title+'</span>';
								}
							acTitle += '</div>';

							jQuery(acTitle).insertBefore(accordion);
						});
			    	}

	        	gsap.set($scope.find('.section-accordion-title.active').next(),{
					opacity: 1,
    				height: 'auto'
				});

				$scope.find('.section-accordion-title').unbind('click').on('click', function(e){

					e.stopPropagation();

					var $self = $(this);

						if(!$self.hasClass('active')){
							if($scope.hasClass('collapsible-true')){

								$self.addClass("active").siblings().removeClass("active");

								gsap.to($self.next(),0.6, {
									height:'auto',
									ease:"expo.out"
							  	});

							  	gsap.to($self.next(),0.2, {
									opacity:1,
							  	});

							  	gsap.to($scope.find('.section-accordion-content').not($self.next()),0.1, {
									opacity:0,
							  	});

								gsap.to($scope.find('.section-accordion-content').not($self.next()),0.6, {
									height:0,
									ease:"expo.out"
							  	});

							} else {
								$self.addClass("active");

								gsap.to($self.next(),0.6, {
									height:'auto',
									ease:"expo.out"
							  	});

							  	gsap.to($self.next(),0.2, {
									opacity:1,
							  	});

							}
						} else {
							if(!$scope.hasClass('collapsible-true')){
								$self.removeClass("active");
								$self.removeClass("active");

								gsap.to($self.next(),0.1, {
									opacity:0,
							  	});

								gsap.to($self.next(),0.6, {
									height:0,
									ease:"expo.out"
							  	});
							}
						}

				});

			});

	})(jQuery);
