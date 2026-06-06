const IS_BROWSER = typeof window !== 'undefined';

// ─── Section 7: Browser UI (IS_BROWSER only) ────────────────────────────────

if (IS_BROWSER) {
  // Detect extension mode via the script tag's data attribute or the document element fallback.
  // currentScript is reliable for synchronously-executing scripts (which our IIFE is).
  const _myScript = document.currentScript;
  const EXTENSION_MODE = (_myScript && _myScript.dataset.impeccableExtension === 'true')
    || document.documentElement.dataset.impeccableExtension === 'true';

  // Kinpaku gold — pinned to the site's brand token (see
  // site/styles/kinpaku-tokens.css --ks-kinpaku). Keep this in sync with
  // the picker's C.brand in skill/scripts/live-browser.js and the kit's
  // picker section in site/styles/kinpaku-kit.css.
  //
  // One color across both light and dark host pages. The outline is a
  // 2px gesture pointing at an element + a labeled tag — it's a marker,
  // not body text, so it doesn't need WCAG AA against the page. The
  // label text inside the gold tag is dark (LABEL_INK) which has ~16:1
  // against the leaf gold, so reading the rule name is solid in both
  // modes. Hover deepens the gold (preserves chroma — never drops it,
  // dropping chroma washes the gold into a sand/olive tone).
  const BRAND_COLOR = 'oklch(84% 0.19 80.46)';
  const BRAND_COLOR_HOVER = 'oklch(74% 0.18 80)';
  const LABEL_INK = 'oklch(4% 0.004 95)';
  const LABEL_BG = BRAND_COLOR;
  const OUTLINE_COLOR = BRAND_COLOR;

  // Inject hover styles via CSS (more reliable than JS event listeners)
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes impeccable-reveal {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .impeccable-overlay:not(.impeccable-banner) {
      pointer-events: none;
      outline: 2px solid ${OUTLINE_COLOR};
      border-radius: 4px;
      transition: outline-color 0.15s ease;
      animation: impeccable-reveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
      animation-play-state: paused;
      border-top-left-radius: 0;
    }
    .impeccable-overlay.impeccable-visible {
      animation-play-state: running;
    }
    .impeccable-overlay.impeccable-hover {
      outline-color: ${BRAND_COLOR_HOVER};
      z-index: 100001 !important;
    }
    .impeccable-overlay.impeccable-hover .impeccable-label {
      background: ${BRAND_COLOR_HOVER};
    }
    .impeccable-overlay.impeccable-spotlight {
      z-index: 100002 !important;
    }
    .impeccable-overlay.impeccable-spotlight-dimmed {
      opacity: 0.15 !important;
      animation: none !important;
      filter: blur(3px);
    }
    .impeccable-spotlight-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      backdrop-filter: blur(3px) brightness(0.6);
      -webkit-backdrop-filter: blur(3px) brightness(0.6);
      pointer-events: none;
      z-index: 99998;
      opacity: 0;
      outline: none !important;
      animation: none !important;
    }
    .impeccable-spotlight-backdrop.impeccable-visible {
      opacity: 1;
    }
    .impeccable-hidden .impeccable-overlay${EXTENSION_MODE ? '' : ':not(.impeccable-banner)'} {
      display: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(styleEl);

  // Spotlight backdrop element (created lazily on first use)
  let spotlightBackdrop = null;
  let spotlightTarget = null;

  function getSpotlightBackdrop() {
    if (!spotlightBackdrop) {
      spotlightBackdrop = document.createElement('div');
      spotlightBackdrop.className = 'impeccable-spotlight-backdrop';
      document.body.appendChild(spotlightBackdrop);
    }
    return spotlightBackdrop;
  }

  function updateSpotlightClipPath() {
    if (!spotlightBackdrop || !spotlightTarget) return;
    const r = spotlightTarget.getBoundingClientRect();
    // Match the overlay's outer edge: element rect + 4px (2px overlay offset + 2px outline width)
    const inset = 4;
    const radius = 6; // outline border-radius (4) + outline width (2)
    const x1 = r.left - inset;
    const y1 = r.top - inset;
    const x2 = r.right + inset;
    const y2 = r.bottom + inset;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Outer rect + rounded inner rect (evenodd creates a hole)
    const path = `M0 0H${vw}V${vh}H0Z M${x1 + radius} ${y1}H${x2 - radius}A${radius} ${radius} 0 0 1 ${x2} ${y1 + radius}V${y2 - radius}A${radius} ${radius} 0 0 1 ${x2 - radius} ${y2}H${x1 + radius}A${radius} ${radius} 0 0 1 ${x1} ${y2 - radius}V${y1 + radius}A${radius} ${radius} 0 0 1 ${x1 + radius} ${y1}Z`;
    spotlightBackdrop.style.clipPath = `path(evenodd, "${path}")`;
  }

  function showSpotlight(target) {
    if (!target || !target.getBoundingClientRect) return;
    // Respect the spotlightBlur setting: if disabled, don't show the backdrop
    if (window.__IMPECCABLE_CONFIG__?.spotlightBlur === false) {
      spotlightTarget = target;
      return;
    }
    spotlightTarget = target;
    const bd = getSpotlightBackdrop();
    updateSpotlightClipPath();
    bd.classList.add('impeccable-visible');
  }

  function hideSpotlight() {
    spotlightTarget = null;
    if (spotlightBackdrop) spotlightBackdrop.classList.remove('impeccable-visible');
  }

  function isInViewport(el) {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
  }

  // Reposition spotlight on scroll/resize
  window.addEventListener('scroll', () => {
    if (spotlightTarget) updateSpotlightClipPath();
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (spotlightTarget) updateSpotlightClipPath();
  });

  const overlays = [];
  const TYPE_LABELS = {};
  const RULE_CATEGORY = {};
  for (const ap of ANTIPATTERNS) {
    TYPE_LABELS[ap.id] = ap.name.toLowerCase();
    RULE_CATEGORY[ap.id] = ap.category || 'quality';
  }

  function isInFixedContext(el) {
    let p = el;
    while (p && p !== document.body) {
      if (getComputedStyle(p).position === 'fixed') return true;
      p = p.parentElement;
    }
    return false;
  }

  function positionOverlay(overlay) {
    const el = overlay._targetEl;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (overlay._isFixed) {
      // Viewport-relative coords for fixed targets
      overlay.style.top = `${rect.top - 2}px`;
      overlay.style.left = `${rect.left - 2}px`;
    } else {
      // Document-relative coords for normal targets
      overlay.style.top = `${rect.top + scrollY - 2}px`;
      overlay.style.left = `${rect.left + scrollX - 2}px`;
    }
    overlay.style.width = `${rect.width + 4}px`;
    overlay.style.height = `${rect.height + 4}px`;
  }

  function repositionOverlays() {
    for (const o of overlays) {
      if (!o._targetEl || o.classList.contains('impeccable-banner')) continue;
      // Skip overlays whose target is currently hidden (display: none on the overlay)
      if (o.style.display === 'none') continue;
      positionOverlay(o);
    }
  }

  let resizeRAF;
  const onResize = () => {
    cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(repositionOverlays);
  };
  window.addEventListener('resize', onResize);
  // Reposition on scroll too -- catches sticky/parallax shifts
  window.addEventListener('scroll', onResize, { passive: true });
  // Reposition when body resizes (lazy-loaded images, dynamic content, fonts loading)
  if (typeof ResizeObserver !== 'undefined') {
    const bodyResizeObserver = new ResizeObserver(onResize);
    bodyResizeObserver.observe(document.body);
  }

  // Track target element visibility via IntersectionObserver.
  // Uses a huge rootMargin so all *rendered* elements count as intersecting,
  // while display:none / closed <details> / hidden modals etc. do not.
  // This is event-driven -- no polling needed.
  let overlayIndex = 0;
  const visibilityObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const overlay = entry.target._impeccableOverlay;
      if (!overlay) continue;
      if (entry.isIntersecting) {
        overlay.style.display = '';
        positionOverlay(overlay);
        if (!overlay._revealed) {
          overlay._revealed = true;
          if (firstScanDone) {
            // Subsequent reveals (re-scans, scroll-into-view): instant, no animation
            overlay.style.animation = 'none';
          } else {
            // Initial scan: staggered cascade reveal
            overlay.style.animationDelay = `${Math.min((overlay._staggerIndex || 0) * 60, 600)}ms`;
          }
          requestAnimationFrame(() => {
            overlay.classList.add('impeccable-visible');
            if (overlay._checkLabel) overlay._checkLabel();
          });
        }
      } else {
        overlay.style.display = 'none';
      }
    }
  }, { rootMargin: '99999px' });

  function detachOverlay(overlay) {
    if (!overlay) return;
    if (typeof overlay._cleanup === 'function') {
      try { overlay._cleanup(); } catch { /* best effort overlay teardown */ }
    }
    if (overlay._targetEl && overlay._targetEl._impeccableOverlay === overlay) {
      visibilityObserver.unobserve(overlay._targetEl);
      delete overlay._targetEl._impeccableOverlay;
    }
    const idx = overlays.indexOf(overlay);
    if (idx >= 0) overlays.splice(idx, 1);
    overlay.remove();
  }

  // Reposition overlays after CSS transitions end (e.g. reveal animations).
  // Listens at document level so it catches transitions on ancestor elements
  // (the transform may be on a parent, not the flagged element itself).
  document.addEventListener('transitionend', (e) => {
    if (e.propertyName !== 'transform') return;
    for (const o of overlays) {
      if (!o._targetEl || o.classList.contains('impeccable-banner') || o.style.display === 'none') continue;
      if (e.target === o._targetEl || e.target.contains(o._targetEl)) {
        positionOverlay(o);
      }
    }
  });

  const highlight = function(el, findings) {
    if (el._impeccableOverlay) detachOverlay(el._impeccableOverlay);
    const hasSlop = findings.some(f => RULE_CATEGORY[f.type || f.id] === 'slop');

    const fixed = isInFixedContext(el);
    const rect = el.getBoundingClientRect();
    const outline = document.createElement('div');
    outline.className = 'impeccable-overlay';
    outline._targetEl = el;
    outline._isFixed = fixed;
    Object.assign(outline.style, {
      position: fixed ? 'fixed' : 'absolute',
      top: fixed ? `${rect.top - 2}px` : `${rect.top + scrollY - 2}px`,
      left: fixed ? `${rect.left - 2}px` : `${rect.left + scrollX - 2}px`,
      width: `${rect.width + 4}px`, height: `${rect.height + 4}px`,
      zIndex: '99999', boxSizing: 'border-box',
    });

    // Build per-finding label entries: ✦ prefix for slop
    const entries = findings.map(f => {
      const name = TYPE_LABELS[f.type || f.id] || f.type || f.id;
      const prefix = RULE_CATEGORY[f.type || f.id] === 'slop' ? '\u2726 ' : '';
      return { name: prefix + name, detail: f.detail || f.snippet };
    });
    const allText = entries.map(e => e.name).join(', ');

    const label = document.createElement('div');
    label.className = 'impeccable-label';
    Object.assign(label.style, {
      position: 'absolute', bottom: '100%', left: '-2px',
      display: 'flex', alignItems: 'center',
      whiteSpace: 'nowrap',
      fontSize: '11px', fontWeight: '600', letterSpacing: '0.02em',
      color: LABEL_INK, lineHeight: '14px',
      background: LABEL_BG,
      fontFamily: 'system-ui, sans-serif',
      borderRadius: '4px 4px 0 0',
    });

    const textSpan = document.createElement('span');
    textSpan.style.padding = '3px 8px';
    textSpan.textContent = allText;
    label.appendChild(textSpan);

    // State for cycling mode
    let cycleMode = false;
    let cycleIndex = 0;
    let isHovered = false;
    let prevBtn, nextBtn;

    function updateCycleText() {
      const e = entries[cycleIndex];
      textSpan.textContent = isHovered ? e.detail : e.name;
    }

    function enableCycleMode() {
      if (cycleMode || entries.length < 2) return;
      cycleMode = true;

      const btnStyle = {
        background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
        fontSize: '11px', cursor: 'pointer', padding: '3px 4px',
        fontFamily: 'system-ui, sans-serif', lineHeight: '14px',
        pointerEvents: 'auto',
      };

      const navGroup = document.createElement('span');
      Object.assign(navGroup.style, {
        display: 'inline-flex', alignItems: 'center', flexShrink: '0',
      });

      prevBtn = document.createElement('button');
      prevBtn.textContent = '\u2039';
      Object.assign(prevBtn.style, btnStyle);
      prevBtn.style.paddingLeft = '6px';
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cycleIndex = (cycleIndex - 1 + entries.length) % entries.length;
        updateCycleText();
      });

      nextBtn = document.createElement('button');
      nextBtn.textContent = '\u203A';
      Object.assign(nextBtn.style, btnStyle);
      nextBtn.style.paddingRight = '2px';
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cycleIndex = (cycleIndex + 1) % entries.length;
        updateCycleText();
      });

      navGroup.appendChild(prevBtn);
      navGroup.appendChild(nextBtn);
      label.insertBefore(navGroup, textSpan);
      textSpan.style.padding = '3px 8px 3px 4px';
      updateCycleText();
    }

    outline.appendChild(label);

    // Start hidden; the IntersectionObserver will show it once the target is rendered
    outline.style.display = 'none';
    outline._staggerIndex = overlayIndex++;
    el._impeccableOverlay = outline;
    visibilityObserver.observe(el);

    // After first paint, check label width vs outline
    outline._checkLabel = () => {
      if (entries.length > 1 && label.offsetWidth > outline.offsetWidth) {
        enableCycleMode();
      }
    };

    // Hover: show detail text, darken
    const onMouseEnter = () => {
      isHovered = true;
      outline.classList.add('impeccable-hover');
      outline.style.outlineColor = BRAND_COLOR_HOVER;
      label.style.background = BRAND_COLOR_HOVER;
      if (cycleMode) {
        updateCycleText();
      } else {
        textSpan.textContent = entries.map(e => e.detail).join(' | ');
      }
    };
    const onMouseLeave = () => {
      isHovered = false;
      outline.classList.remove('impeccable-hover');
      outline.style.outlineColor = '';
      label.style.background = LABEL_BG;
      if (cycleMode) {
        updateCycleText();
      } else {
        textSpan.textContent = allText;
      }
    };
    el.addEventListener('mouseenter', onMouseEnter);
    el.addEventListener('mouseleave', onMouseLeave);
    outline._cleanup = () => {
      el.removeEventListener('mouseenter', onMouseEnter);
      el.removeEventListener('mouseleave', onMouseLeave);
    };

    document.body.appendChild(outline);
    overlays.push(outline);
  };

  const showPageBanner = function(findings) {
    if (!findings.length) return;
    const banner = document.createElement('div');
    banner.className = 'impeccable-overlay impeccable-banner';
    Object.assign(banner.style, {
      position: 'fixed', top: '0', left: '0', right: '0', zIndex: '100000',
      background: LABEL_BG, color: LABEL_INK,
      fontFamily: 'system-ui, sans-serif', fontSize: '13px',
      display: 'flex', alignItems: 'center', pointerEvents: 'auto',
      height: '36px', overflow: 'hidden', maxWidth: '100vw',
      transform: 'translateY(-100%)',
      transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      banner.style.transform = 'translateY(0)';
    }));

    // Scrollable findings area
    const scrollArea = document.createElement('div');
    Object.assign(scrollArea.style, {
      flex: '1', minWidth: '0', overflowX: 'auto', overflowY: 'hidden',
      display: 'flex', gap: '8px', alignItems: 'center',
      padding: '0 12px', scrollSnapType: 'x mandatory',
      scrollbarWidth: 'none',
    });
    for (const f of findings) {
      const prefix = RULE_CATEGORY[f.type] === 'slop' ? '\u2726 ' : '';
      const tag = document.createElement('span');
      tag.textContent = `${prefix}${TYPE_LABELS[f.type] || f.type}: ${f.detail}`;
      Object.assign(tag.style, {
        background: 'rgba(255,255,255,0.15)', padding: '2px 8px',
        borderRadius: '3px', fontSize: '12px', fontFamily: 'ui-monospace, monospace',
        whiteSpace: 'nowrap', flexShrink: '0', scrollSnapAlign: 'start',
      });
      scrollArea.appendChild(tag);
    }
    banner.appendChild(scrollArea);

    // Controls area (only in standalone mode, not extension)
    if (!EXTENSION_MODE) {
      const controls = document.createElement('div');
      Object.assign(controls.style, {
        display: 'flex', alignItems: 'center', gap: '2px',
        padding: '0 8px', flexShrink: '0',
      });

      // Toggle visibility button
      const toggle = document.createElement('button');
      toggle.textContent = '\u25C9'; // circle with dot (visible state)
      toggle.title = 'Toggle overlay visibility';
      Object.assign(toggle.style, {
        background: 'none', border: 'none',
        color: 'white', fontSize: '16px', cursor: 'pointer', padding: '0 4px',
        opacity: '0.85', transition: 'opacity 0.15s',
      });
      let overlaysVisible = true;
      toggle.addEventListener('click', () => {
        overlaysVisible = !overlaysVisible;
        document.body.classList.toggle('impeccable-hidden', !overlaysVisible);
        toggle.textContent = overlaysVisible ? '\u25C9' : '\u25CB'; // filled vs empty circle
        toggle.style.opacity = overlaysVisible ? '0.85' : '0.5';
      });
      controls.appendChild(toggle);

      // Close button
      const close = document.createElement('button');
      close.textContent = '\u00d7';
      close.title = 'Dismiss banner';
      Object.assign(close.style, {
        background: 'none', border: 'none',
        color: 'white', fontSize: '18px', cursor: 'pointer', padding: '0 4px',
      });
      close.addEventListener('click', () => banner.remove());
      controls.appendChild(close);

      banner.appendChild(controls);
    }
    document.body.appendChild(banner);
    overlays.push(banner);
  };

  // Heuristic for skipping CSS-in-JS hashed class names like "css-1a2b3c" or "_2x4hG_".
  // These change between builds and produce brittle, ugly selectors.
  function isLikelyHashedClass(c) {
    if (!c) return true;
    if (/^(css|sc|emotion|jsx|module)-[\w-]{4,}$/i.test(c)) return true;
    if (/^_[\w-]{5,}$/.test(c)) return true;
    if (/^[a-z0-9]{6,}$/i.test(c) && /\d/.test(c)) return true;
    return false;
  }

  function buildSelectorSegment(el) {
    const tag = el.tagName.toLowerCase();
    let sel = tag;

    if (el.classList && el.classList.length > 0) {
      const classes = [...el.classList]
        .filter(c => !c.startsWith('impeccable-') && !isLikelyHashedClass(c))
        .slice(0, 2);
      if (classes.length > 0) {
        sel += '.' + classes.map(c => CSS.escape(c)).join('.');
      }
    }

    // Disambiguate among siblings only if the parent has multiple matches
    const parent = el.parentElement;
    if (parent) {
      try {
        const matching = parent.querySelectorAll(':scope > ' + sel);
        if (matching.length > 1) {
          const sameType = [...parent.children].filter(c => c.tagName === el.tagName);
          const idx = sameType.indexOf(el) + 1;
          sel += `:nth-of-type(${idx})`;
        }
      } catch {
        const idx = [...parent.children].indexOf(el) + 1;
        sel = `${tag}:nth-child(${idx})`;
      }
    }
    return sel;
  }

  function generateSelector(el) {
    if (el === document.body) return 'body';
    if (el === document.documentElement) return 'html';
    if (el.id) return '#' + CSS.escape(el.id);

    const parts = [];
    let current = el;
    let depth = 0;
    const MAX_DEPTH = 10;

    while (current && current !== document.body && current !== document.documentElement && depth < MAX_DEPTH) {
      parts.unshift(buildSelectorSegment(current));

      // Anchor on an ancestor's ID and stop walking up
      if (current.id) {
        parts[0] = '#' + CSS.escape(current.id);
        break;
      }

      // Stop as soon as the partial selector uniquely identifies the target
      const trySelector = parts.join(' > ');
      try {
        const matches = document.querySelectorAll(trySelector);
        if (matches.length === 1 && matches[0] === el) {
          return trySelector;
        }
      } catch { /* invalid selector — keep walking */ }

      current = current.parentElement;
      depth++;
    }

    return parts.join(' > ');
  }

  function getDirectText(el) {
    return [...el.childNodes]
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent || '')
      .join('');
  }

  function getDirectTextRect(el) {
    const rects = [];
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !(node.textContent || '').trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width >= 1 && rect.height >= 1) rects.push(rect);
      }
      range.detach?.();
    }
    if (rects.length === 0) return null;
    const left = Math.min(...rects.map(r => r.left));
    const top = Math.min(...rects.map(r => r.top));
    const right = Math.max(...rects.map(r => r.right));
    const bottom = Math.max(...rects.map(r => r.bottom));
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
    };
  }

  function collectVisualContrastReasons(el, style) {
    const reasons = new Set();
    const bgClip = style.webkitBackgroundClip || style.backgroundClip || '';
    const ownBgImage = style.backgroundImage || '';
    if (bgClip === 'text' && ownBgImage && ownBgImage !== 'none') {
      reasons.add('background-clip text');
    }
    if (style.textShadow && style.textShadow !== 'none') reasons.add('text shadow');

    let current = el;
    while (current && current.nodeType === 1) {
      const tag = current.tagName?.toLowerCase();
      const currentStyle = getComputedStyle(current);
      const bgImage = currentStyle.backgroundImage || '';
      const isDocumentSurface = tag === 'body' || tag === 'html';

      if (!isDocumentSurface && bgImage && bgImage !== 'none') {
        if (/url\s*\(/i.test(bgImage)) reasons.add('image background');
        if (/gradient/i.test(bgImage)) reasons.add('gradient background');
      }
      if (parseFloat(currentStyle.opacity) < 0.99) reasons.add('opacity stack');
      if (currentStyle.mixBlendMode && currentStyle.mixBlendMode !== 'normal') reasons.add('blend mode');
      if (currentStyle.filter && currentStyle.filter !== 'none') reasons.add('filter');
      if (currentStyle.backdropFilter && currentStyle.backdropFilter !== 'none') reasons.add('backdrop filter');

      const solidBg = parseRgb(currentStyle.backgroundColor);
      if (solidBg && solidBg.a >= 0.95 && (!bgImage || bgImage === 'none')) break;
      current = current.parentElement;
    }

    const sampleRect = getDirectTextRect(el) || el.getBoundingClientRect();
    if (sampleRect && document.elementsFromPoint) {
      const points = [
        [sampleRect.left + sampleRect.width / 2, sampleRect.top + sampleRect.height / 2],
        [sampleRect.left + Math.min(sampleRect.width - 1, Math.max(1, sampleRect.width * 0.25)), sampleRect.top + sampleRect.height / 2],
        [sampleRect.left + Math.min(sampleRect.width - 1, Math.max(1, sampleRect.width * 0.75)), sampleRect.top + sampleRect.height / 2],
      ];
      for (const [x, y] of points) {
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        const stack = document.elementsFromPoint(x, y);
        const selfIndex = stack.findIndex(node => node === el || el.contains(node) || node.contains?.(el));
        if (selfIndex < 0) continue;
        for (const node of stack.slice(selfIndex + 1)) {
          const nodeTag = node.tagName?.toLowerCase();
          if (nodeTag === 'img' || nodeTag === 'picture' || nodeTag === 'video' || nodeTag === 'canvas' || nodeTag === 'svg') {
            reasons.add(`${nodeTag} underlay`);
            break;
          }
        }
      }
    }

    return [...reasons];
  }

  function collectVisualContrastCandidates(options = {}) {
    const maxCandidates = Number.isFinite(options.maxCandidates) ? options.maxCandidates : 12;
    const candidates = [];
    for (const el of document.querySelectorAll('*')) {
      if (candidates.length >= maxCandidates) break;
      if (el.closest('.impeccable-overlay, .impeccable-label, .impeccable-banner, .impeccable-tooltip')) continue;
      if (el.closest('[id^="impeccable-live-"]')) continue;
      if (el === document.body || el === document.documentElement) continue;

      const tag = el.tagName.toLowerCase();
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const directText = getDirectText(el);
      const hasDirectText = directText.trim().length > 0;
      if (!hasDirectText || isEmojiOnlyText(directText)) continue;

      const bgColor = readOwnBackgroundColor(el, style);
      const isStyledButton = (tag === 'a' || tag === 'button')
        && bgColor && bgColor.a > 0.5;
      if (SAFE_TAGS.has(tag) && !isStyledButton) continue;

      const rect = getDirectTextRect(el) || el.getBoundingClientRect();
      if (!rect || rect.width < 4 || rect.height < 4) continue;

      const reasons = collectVisualContrastReasons(el, style);
      if (reasons.length === 0) continue;

      const textColor = parseRgb(style.color);
      const fontSize = parseFloat(style.fontSize) || 16;
      const fontWeight = parseInt(style.fontWeight) || 400;
      const isLargeText = fontSize >= WCAG_LARGE_TEXT_PX || (fontSize >= WCAG_LARGE_BOLD_TEXT_PX && fontWeight >= 700);
      const threshold = isLargeText ? 3.0 : 4.5;
      const clip = {
        x: Math.max(0, Math.floor(rect.left + window.scrollX - 2)),
        y: Math.max(0, Math.floor(rect.top + window.scrollY - 2)),
        width: Math.max(1, Math.ceil(rect.width + 4)),
        height: Math.max(1, Math.ceil(rect.height + 4)),
      };

      candidates.push({
        selector: generateSelector(el),
        tagName: tag,
        text: directText.trim().replace(/\s+/g, ' ').slice(0, 80),
        threshold,
        reasons,
        clip,
        textColor,
        preferRenderedForeground: !textColor || textColor.a < 0.99 || reasons.some(reason =>
          reason === 'opacity stack' ||
          reason === 'blend mode' ||
          reason === 'filter' ||
          reason === 'backdrop filter' ||
          reason === 'background-clip text'
        ),
        backgroundClipText: reasons.includes('background-clip text'),
      });
    }
    return candidates;
  }

  const visualContrastImageCache = new Map();
  const visualContrastRasterCache = new WeakMap();

  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function blendRgba(fg, bg) {
    if (!fg) return bg || null;
    if (!bg || fg.a == null || fg.a >= 0.999) {
      return { r: clampByte(fg.r), g: clampByte(fg.g), b: clampByte(fg.b), a: fg.a == null ? 1 : fg.a };
    }
    const alpha = Math.max(0, Math.min(1, fg.a));
    return {
      r: clampByte(fg.r * alpha + bg.r * (1 - alpha)),
      g: clampByte(fg.g * alpha + bg.g * (1 - alpha)),
      b: clampByte(fg.b * alpha + bg.b * (1 - alpha)),
      a: 1,
    };
  }

  function pickWorstContrastColor(textColor, colors) {
    const usable = (colors || []).filter(Boolean);
    if (!usable.length) return null;
    let worst = usable[0];
    let worstRatio = contrastRatio(textColor, worst);
    for (const color of usable.slice(1)) {
      const ratio = contrastRatio(textColor, color);
      if (ratio < worstRatio) {
        worst = color;
        worstRatio = ratio;
      }
    }
    return worst;
  }

  function firstCssUrl(value) {
    const match = String(value || '').match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/i);
    if (!match) return '';
    return (match[1] || match[2] || match[3] || '').trim();
  }

  function getLayerValue(value, index = 0) {
    return String(value || '').split(',')[index]?.trim() || '';
  }

  function parsePositionToken(token, container, painted) {
    if (!token || token === 'center') return (container - painted) / 2;
    if (token === 'left' || token === 'top') return 0;
    if (token === 'right' || token === 'bottom') return container - painted;
    if (/%$/.test(token)) {
      const pct = parseFloat(token) / 100;
      return (container - painted) * pct;
    }
    if (/px$/.test(token)) return parseFloat(token) || 0;
    return (container - painted) / 2;
  }

  function parsePositionPair(positionValue) {
    const tokens = String(positionValue || '50% 50%').trim().split(/\s+/).filter(Boolean);
    const first = tokens[0] || '50%';
    if (tokens.length < 2) {
      if (first === 'top' || first === 'bottom') return ['50%', first];
      return [first, '50%'];
    }
    return [first, tokens[1] || '50%'];
  }

  function resolvePaintedImageRect(containerRect, image, sizeValue, positionValue) {
    const intrinsicWidth = image.naturalWidth || image.videoWidth || image.width || 1;
    const intrinsicHeight = image.naturalHeight || image.videoHeight || image.height || 1;
    let paintedWidth = intrinsicWidth;
    let paintedHeight = intrinsicHeight;
    const size = String(sizeValue || 'auto').trim();

    if (size === 'cover' || size === 'contain') {
      const scale = size === 'cover'
        ? Math.max(containerRect.width / intrinsicWidth, containerRect.height / intrinsicHeight)
        : Math.min(containerRect.width / intrinsicWidth, containerRect.height / intrinsicHeight);
      paintedWidth = intrinsicWidth * scale;
      paintedHeight = intrinsicHeight * scale;
    } else if (size && size !== 'auto') {
      const parts = size.split(/\s+/);
      const widthToken = parts[0];
      const heightToken = parts[1] || 'auto';
      if (/%$/.test(widthToken)) paintedWidth = containerRect.width * (parseFloat(widthToken) / 100);
      else if (/px$/.test(widthToken)) paintedWidth = parseFloat(widthToken) || paintedWidth;
      if (heightToken === 'auto') paintedHeight = paintedWidth * (intrinsicHeight / intrinsicWidth);
      else if (/%$/.test(heightToken)) paintedHeight = containerRect.height * (parseFloat(heightToken) / 100);
      else if (/px$/.test(heightToken)) paintedHeight = parseFloat(heightToken) || paintedHeight;
    }

    const [xToken, yToken] = parsePositionPair(positionValue);
    const positionX = parsePositionToken(xToken, containerRect.width, paintedWidth);
    const positionY = parsePositionToken(yToken, containerRect.height, paintedHeight);
    return {
      left: containerRect.left + positionX,
      top: containerRect.top + positionY,
      width: paintedWidth,
      height: paintedHeight,
      intrinsicWidth,
      intrinsicHeight,
    };
  }

  function parseObjectPosition(positionValue) {
    return parsePositionPair(positionValue);
  }

  function resolveObjectImageRect(containerRect, image, style) {
    const intrinsicWidth = image.naturalWidth || image.videoWidth || image.width || 1;
    const intrinsicHeight = image.naturalHeight || image.videoHeight || image.height || 1;
    const fit = style.objectFit || 'fill';
    let paintedWidth = containerRect.width;
    let paintedHeight = containerRect.height;
    if (fit === 'contain' || fit === 'cover') {
      const scale = fit === 'cover'
        ? Math.max(containerRect.width / intrinsicWidth, containerRect.height / intrinsicHeight)
        : Math.min(containerRect.width / intrinsicWidth, containerRect.height / intrinsicHeight);
      paintedWidth = intrinsicWidth * scale;
      paintedHeight = intrinsicHeight * scale;
    } else if (fit === 'none') {
      paintedWidth = intrinsicWidth;
      paintedHeight = intrinsicHeight;
    } else if (fit === 'scale-down') {
      const containScale = Math.min(containerRect.width / intrinsicWidth, containerRect.height / intrinsicHeight, 1);
      paintedWidth = intrinsicWidth * containScale;
      paintedHeight = intrinsicHeight * containScale;
    }
    const [xToken, yToken] = parseObjectPosition(style.objectPosition);
    return {
      left: containerRect.left + parsePositionToken(xToken, containerRect.width, paintedWidth),
      top: containerRect.top + parsePositionToken(yToken, containerRect.height, paintedHeight),
      width: paintedWidth,
      height: paintedHeight,
      intrinsicWidth,
      intrinsicHeight,
    };
  }

  function pointToImageSource(point, paintedRect) {
    if (
      point.x < paintedRect.left ||
      point.y < paintedRect.top ||
      point.x > paintedRect.left + paintedRect.width ||
      point.y > paintedRect.top + paintedRect.height
    ) {
      return null;
    }
    return {
      x: Math.max(0, Math.min(paintedRect.intrinsicWidth - 1, ((point.x - paintedRect.left) / paintedRect.width) * paintedRect.intrinsicWidth)),
      y: Math.max(0, Math.min(paintedRect.intrinsicHeight - 1, ((point.y - paintedRect.top) / paintedRect.height) * paintedRect.intrinsicHeight)),
    };
  }

  async function loadVisualContrastImage(src) {
    if (!src) return null;
    if (visualContrastImageCache.has(src)) return visualContrastImageCache.get(src);
    const promise = new Promise(resolve => {
      const img = new Image();
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), 800);
      try {
        const absolute = new URL(src, location.href);
        if (absolute.origin !== location.origin && absolute.protocol !== 'data:' && absolute.protocol !== 'blob:') {
          img.crossOrigin = 'anonymous';
        }
      } catch {
        // Let the browser resolve unusual URLs itself.
      }
      img.onload = () => finish(img);
      img.onerror = () => finish(null);
      img.src = src;
    });
    visualContrastImageCache.set(src, promise);
    return promise;
  }

  function sampleDrawablePixel(drawable, sourcePoint) {
    if (visualContrastRasterCache.has(drawable)) {
      const cached = visualContrastRasterCache.get(drawable);
      if (!cached || !cached.ctx) return { status: 'unresolved', reason: cached?.reason || 'image sample failed' };
      try {
        const x = Math.max(0, Math.min(cached.width - 1, Math.floor(sourcePoint.x * cached.scaleX)));
        const y = Math.max(0, Math.min(cached.height - 1, Math.floor(sourcePoint.y * cached.scaleY)));
        const data = cached.ctx.getImageData(x, y, 1, 1).data;
        return {
          status: 'sampled',
          color: { r: data[0], g: data[1], b: data[2], a: data[3] / 255 },
        };
      } catch (err) {
        return {
          status: 'unresolved',
          reason: /taint|cross-origin|Security/i.test(err?.message || '') ? 'tainted image' : 'image sample failed',
        };
      }
    }

    const canvas = document.createElement('canvas');
    const intrinsicWidth = drawable.naturalWidth || drawable.videoWidth || drawable.width || 1;
    const intrinsicHeight = drawable.naturalHeight || drawable.videoHeight || drawable.height || 1;
    const maxRasterSide = 640;
    const scale = Math.min(1, maxRasterSide / Math.max(intrinsicWidth, intrinsicHeight));
    canvas.width = Math.max(1, Math.round(intrinsicWidth * scale));
    canvas.height = Math.max(1, Math.round(intrinsicHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { status: 'unresolved', reason: 'canvas unavailable' };
    try {
      ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);
      const cached = {
        ctx,
        width: canvas.width,
        height: canvas.height,
        scaleX: canvas.width / intrinsicWidth,
        scaleY: canvas.height / intrinsicHeight,
      };
      visualContrastRasterCache.set(drawable, cached);
      const x = Math.max(0, Math.min(cached.width - 1, Math.floor(sourcePoint.x * cached.scaleX)));
      const y = Math.max(0, Math.min(cached.height - 1, Math.floor(sourcePoint.y * cached.scaleY)));
      const data = ctx.getImageData(x, y, 1, 1).data;
      return {
        status: 'sampled',
        color: { r: data[0], g: data[1], b: data[2], a: data[3] / 255 },
      };
    } catch (err) {
      const reason = /taint|cross-origin|Security/i.test(err?.message || '') ? 'tainted image' : 'image sample failed';
      visualContrastRasterCache.set(drawable, { ctx: null, reason });
      return {
        status: 'unresolved',
        reason,
      };
    }
  }

  async function sampleCssBackground(el, style, point, textColor) {
    const rect = el.getBoundingClientRect();
    const bgImage = style.backgroundImage || '';
    if (bgImage && bgImage !== 'none') {
      if (/gradient/i.test(bgImage)) {
        const color = pickWorstContrastColor(textColor, parseGradientColors(bgImage));
        if (color) return { status: 'sampled', color, method: 'analytic-gradient' };
      }
      if (/url\s*\(/i.test(bgImage)) {
        const img = await loadVisualContrastImage(firstCssUrl(bgImage));
        if (!img) return { status: 'unresolved', reason: 'image unavailable' };
        const paintedRect = resolvePaintedImageRect(
          rect,
          img,
          getLayerValue(style.backgroundSize) || 'auto',
          getLayerValue(style.backgroundPosition) || '50% 50%',
        );
        const sourcePoint = pointToImageSource(point, paintedRect);
        if (!sourcePoint) return { status: 'unresolved', reason: 'point outside background image' };
        const sample = sampleDrawablePixel(img, sourcePoint);
        if (sample.status === 'sampled') return { ...sample, method: 'canvas-background-image' };
        return sample;
      }
    }
    const bg = parseRgb(style.backgroundColor);
    if (bg && bg.a > 0.05) return { status: 'sampled', color: bg, method: 'solid-background' };
    return { status: 'unresolved', reason: 'no readable background' };
  }

  async function sampleImageElement(img, point) {
    const rect = img.getBoundingClientRect();
    const style = getComputedStyle(img);
    const paintedRect = resolveObjectImageRect(rect, img, style);
    const sourcePoint = pointToImageSource(point, paintedRect);
    if (!sourcePoint) return { status: 'unresolved', reason: 'point outside image' };
    const sample = sampleDrawablePixel(img, sourcePoint);
    if (sample.status === 'sampled') return { ...sample, method: 'canvas-img-underlay' };

    if (img.currentSrc || img.src) {
      const loaded = await loadVisualContrastImage(img.currentSrc || img.src);
      if (loaded) {
        const loadedRect = { ...paintedRect, intrinsicWidth: loaded.naturalWidth || loaded.width || paintedRect.intrinsicWidth, intrinsicHeight: loaded.naturalHeight || loaded.height || paintedRect.intrinsicHeight };
        const loadedPoint = pointToImageSource(point, loadedRect);
        if (loadedPoint) {
          const loadedSample = sampleDrawablePixel(loaded, loadedPoint);
          if (loadedSample.status === 'sampled') return { ...loadedSample, method: 'canvas-img-underlay' };
        }
      }
    }
    return sample;
  }

  function textSamplePoints(rect) {
    const insetX = Math.min(12, Math.max(1, rect.width * 0.12));
    const insetY = Math.min(8, Math.max(1, rect.height * 0.22));
    const xs = rect.width < 28
      ? [rect.left + rect.width / 2]
      : [rect.left + insetX, rect.left + rect.width / 2, rect.right - insetX];
    const ys = rect.height < 22
      ? [rect.top + rect.height / 2]
      : [rect.top + insetY, rect.top + rect.height / 2, rect.bottom - insetY];
    const points = [];
    for (const y of ys) {
      for (const x of xs) {
        if (x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight) points.push({ x, y });
      }
    }
    return points;
  }

  async function sampleVisualBackgroundAtPoint(el, point, textColor, depth = 0) {
    if (depth > 8) {
      return { status: 'unresolved', reason: 'background stack too deep' };
    }
    const stack = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(point.x, point.y)
      : [];
    const selfIndex = stack.findIndex(node => node === el || el.contains(node));
    const nodes = selfIndex >= 0 ? stack.slice(selfIndex) : [el, ...stack];
    const unresolved = [];

    for (const node of nodes) {
      if (!node || node.nodeType !== 1) continue;
      if (node.closest?.('.impeccable-overlay, .impeccable-label, .impeccable-banner, .impeccable-tooltip')) continue;
      const tag = node.tagName?.toLowerCase();
      if (tag === 'img') {
        const sample = await sampleImageElement(node, point);
        if (sample.status === 'sampled') return sample;
        unresolved.push(sample.reason);
        continue;
      }
      if (tag === 'canvas' || tag === 'video') {
        const rect = node.getBoundingClientRect();
        const sourcePoint = pointToImageSource(point, {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          intrinsicWidth: node.width || node.videoWidth || rect.width,
          intrinsicHeight: node.height || node.videoHeight || rect.height,
        });
        if (sourcePoint) {
          const sample = sampleDrawablePixel(node, sourcePoint);
          if (sample.status === 'sampled') return { ...sample, method: `canvas-${tag}-underlay` };
          unresolved.push(sample.reason);
        }
        continue;
      }
      const style = getComputedStyle(node);
      const sample = await sampleCssBackground(node, style, point, textColor);
      if (sample.status === 'sampled') {
        if (!sample.color || sample.color.a == null || sample.color.a >= 0.95) return sample;
        const under = await sampleVisualBackgroundAtPoint(node.parentElement || document.body, point, textColor, depth + 1);
        if (under.status === 'sampled') {
          return {
            status: 'sampled',
            color: blendRgba(sample.color, under.color),
            method: `${sample.method}+alpha`,
          };
        }
        return sample;
      }
      unresolved.push(sample.reason);
    }

    return {
      status: 'unresolved',
      reason: [...new Set(unresolved.filter(Boolean))].slice(0, 3).join(', ') || 'no readable visual background',
    };
  }

  async function analyzeVisualContrastCandidate(candidate) {
    let el;
    try {
      el = document.querySelector(candidate.selector);
    } catch {
      return { ...candidate, status: 'unresolved', confidence: 'none', reason: 'stale selector' };
    }
    if (!el) return { ...candidate, status: 'unresolved', confidence: 'none', reason: 'missing element' };

    const blockingReason = (candidate.reasons || []).find(reason =>
      reason === 'background-clip text' ||
      reason === 'blend mode' ||
      reason === 'filter' ||
      reason === 'backdrop filter' ||
      reason === 'opacity stack' ||
      reason === 'text shadow'
    );
    if (blockingReason) {
      return { ...candidate, status: 'unresolved', confidence: 'none', reason: `${blockingReason} needs screenshot pixels` };
    }

    const style = getComputedStyle(el);
    const textColor = parseRgb(style.color) || candidate.textColor;
    if (!textColor) return { ...candidate, status: 'unresolved', confidence: 'none', reason: 'unreadable text color' };

    const rect = getDirectTextRect(el) || el.getBoundingClientRect();
    if (!rect || rect.width < 4 || rect.height < 4) {
      return { ...candidate, status: 'unresolved', confidence: 'none', reason: 'missing text rect' };
    }

    const points = textSamplePoints(rect);
    if (points.length === 0) {
      return { ...candidate, status: 'unresolved', confidence: 'none', reason: 'text outside viewport' };
    }

    const ratios = [];
    const methods = new Set();
    const unresolved = [];
    for (const point of points) {
      const sample = await sampleVisualBackgroundAtPoint(el, point, textColor);
      if (sample.status !== 'sampled' || !sample.color) {
        unresolved.push(sample.reason);
        continue;
      }
      const fg = blendRgba(textColor, sample.color);
      ratios.push(contrastRatio(fg, sample.color));
      if (sample.method) methods.add(sample.method);
    }

    if (ratios.length < Math.min(3, points.length)) {
      return {
        ...candidate,
        status: 'unresolved',
        confidence: 'none',
        samples: ratios.length,
        reason: [...new Set(unresolved.filter(Boolean))].slice(0, 3).join(', ') || 'not enough readable samples',
      };
    }

    ratios.sort((a, b) => a - b);
    const pick = pct => ratios[Math.min(ratios.length - 1, Math.max(0, Math.floor((pct / 100) * ratios.length)))];
    const measuredRatio = pick(10);
    const medianRatio = pick(50);
    const status = measuredRatio < candidate.threshold ? 'fail' : 'pass';
    const method = [...methods].sort().join(', ') || 'browser-visual';
    const textLabel = candidate.text ? ` "${candidate.text}"` : '';
    const detail = `browser contrast ${measuredRatio.toFixed(1)}:1 median ${medianRatio.toFixed(1)}:1 (need ${candidate.threshold}:1) via ${method}${textLabel}`;
    return {
      ...candidate,
      status,
      confidence: method.includes('canvas-') ? 'high' : 'medium',
      method,
      ratio: measuredRatio,
      medianRatio,
      samples: ratios.length,
      finding: status === 'fail' ? { id: 'low-contrast', snippet: detail } : null,
    };
  }

  function waitForVisualPaint() {
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  async function analyzeVisualContrast(options = {}) {
    const candidates = collectVisualContrastCandidates(options);
    const results = [];
    const shouldScrollOffscreen = options.scrollOffscreen === true;
    const restoreScroll = { x: window.scrollX, y: window.scrollY };
    for (const candidate of candidates) {
      if (shouldScrollOffscreen && (window.scrollX !== restoreScroll.x || window.scrollY !== restoreScroll.y)) {
        window.scrollTo(restoreScroll.x, restoreScroll.y);
        await waitForVisualPaint();
      }
      let result = await analyzeVisualContrastCandidate(candidate);
      if (shouldScrollOffscreen && result.status === 'unresolved' && result.reason === 'text outside viewport') {
        let el = null;
        try {
          el = document.querySelector(candidate.selector);
        } catch {
          el = null;
        }
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          await waitForVisualPaint();
          result = await analyzeVisualContrastCandidate(candidate);
        }
      }
      results.push(result);
    }
    if (shouldScrollOffscreen && (window.scrollX !== restoreScroll.x || window.scrollY !== restoreScroll.y)) {
      window.scrollTo(restoreScroll.x, restoreScroll.y);
    }
    return results;
  }

  function isElementHidden(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (typeof el.checkVisibility === 'function') return !el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
    // Fallback: zero size or no offsetParent (covers display:none and detached subtrees)
    return el.offsetWidth === 0 && el.offsetHeight === 0;
  }

  function serializeFindings(allFindings) {
    return allFindings.map(({ el, findings }) => ({
      selector: generateSelector(el),
      tagName: el.tagName?.toLowerCase() || 'unknown',
      rect: (el !== document.body && el !== document.documentElement && el.getBoundingClientRect)
        ? el.getBoundingClientRect().toJSON() : null,
      isPageLevel: el === document.body || el === document.documentElement,
      isHidden: isElementHidden(el),
      findings: findings.map(f => {
        const ap = ANTIPATTERNS.find(a => a.id === (f.type || f.id));
        return {
          type: f.type || f.id,
          category: ap ? ap.category : 'quality',
          severity: ap?.severity || 'warning',
          detail: f.detail || f.snippet,
          name: ap ? ap.name : (f.type || f.id),
          description: ap ? ap.description : '',
        };
      }),
    }));
  }

  const printSummary = function(allFindings) {
    if (allFindings.length === 0) {
      console.log('%c[impeccable] No anti-patterns found.', 'color: #22c55e; font-weight: bold');
      return;
    }
    console.group(
      `%c[impeccable] ${allFindings.length} anti-pattern${allFindings.length === 1 ? '' : 's'} found`,
      'color: oklch(84% 0.19 80.46); font-weight: bold'
    );
    for (const { el, findings } of allFindings) {
      for (const f of findings) {
        console.log(`%c${f.type || f.id}%c ${f.detail || f.snippet}`,
          'color: oklch(84% 0.19 80.46); font-weight: bold', 'color: inherit', el);
      }
    }
    console.groupEnd();
  };

  function addBrowserFindings(groupMap, el, findings) {
    if (!findings || findings.length === 0) return;
    const existing = groupMap.get(el);
    if (existing) existing.push(...findings);
    else groupMap.set(el, [...findings]);
  }

  function browserFindingsFromMap(groupMap) {
    return [...groupMap.entries()].map(([el, findings]) => ({ el, findings }));
  }

  function collectBrowserFindings() {
    const groupMap = new Map();
    const _disabled = EXTENSION_MODE ? (window.__IMPECCABLE_CONFIG__?.disabledRules || []) : [];
    const _ruleOk = (id) => !_disabled.length || !_disabled.includes(id);
    // Note: provider-gated rules (--gpt / --gemini) are NOT filtered here. In a
    // real browser env (detector page, live overlay, extension) running every
    // check is free, so we always surface them; the gating is purely a CLI
    // output concern, applied in the Node engines' detect* return paths.

    for (const el of document.querySelectorAll('*')) {
      // Skip impeccable's own elements and any descendants (overlays, labels, banner, nav buttons)
      if (el.closest('.impeccable-overlay, .impeccable-label, .impeccable-banner, .impeccable-tooltip')) continue;
      // Skip browser extension elements (Claude, etc.)
      const elId = el.id || '';
      if (elId.startsWith('claude-') || elId.startsWith('cic-')) continue;
      // Skip the impeccable live-mode overlay (highlight, tooltip, bar, picker, toast).
      // These are inspector chrome, not part of the user's design.
      if (el.closest('[id^="impeccable-live-"]')) continue;
      // Skip html/body -- page-level findings go in the banner, not a full-page overlay
      if (el === document.body || el === document.documentElement) continue;

      const findings = [
        ...checkElementBordersDOM(el).map(f => ({ type: f.id, detail: f.snippet })),
        ...checkElementColorsDOM(el).map(f => ({ type: f.id, detail: f.snippet })),
        ...checkElementMotionDOM(el).map(f => ({ type: f.id, detail: f.snippet })),
        ...checkElementGlowDOM(el).map(f => ({ type: f.id, detail: f.snippet })),
        ...checkElementAIPaletteDOM(el).map(f => ({ type: f.id, detail: f.snippet })),
        ...checkElementIconTileDOM(el).map(f => ({ type: f.id, detail: f.snippet })),
        ...checkElementItalicSerifDOM(el).map(f => ({ type: f.id, detail: f.snippet })),
        ...checkElementQualityDOM(el).map(f => ({ type: f.id, detail: f.snippet })),
        ...checkElementOversizedH1DOM(el).map(f => ({ type: f.id, detail: f.snippet })),
        ...checkElementClippedOverflowDOM(el).map(f => ({ type: f.id, detail: f.snippet })),
        ...checkElementGptBorderShadowDOM(el).map(f => ({ type: f.id, detail: f.snippet })),
        ...checkElementTextOverflowDOM(el).map(f => ({ type: f.id, detail: f.snippet })),
      ].filter(f => _ruleOk(f.type));

      addBrowserFindings(groupMap, el, findings);

      // Hero eyebrow: the offending element is the eyebrow above the heading,
      // not the heading itself — highlight the previous sibling instead.
      const eyebrowFindings = checkElementHeroEyebrowDOM(el)
        .map(f => ({ type: f.id, detail: f.snippet }))
        .filter(f => _ruleOk(f.type));
      if (eyebrowFindings.length > 0 && el.previousElementSibling) {
        addBrowserFindings(groupMap, el.previousElementSibling, eyebrowFindings);
      }
    }

    const pageLevelFindings = [];

    const typoFindings = checkTypography().filter(f => _ruleOk(f.type));
    if (typoFindings.length > 0) {
      pageLevelFindings.push(...typoFindings);
      addBrowserFindings(groupMap, document.body, typoFindings);
    }

    const sectionKickerFindings = checkRepeatedSectionKickersDOM()
      .map(f => ({ type: f.id, detail: f.snippet }))
      .filter(f => _ruleOk(f.type));
    if (sectionKickerFindings.length > 0) {
      pageLevelFindings.push(...sectionKickerFindings);
      addBrowserFindings(groupMap, document.body, sectionKickerFindings);
    }

    const layoutFindings = checkLayout().filter(f => _ruleOk(f.type));
    for (const f of layoutFindings) {
      const el = f.el || document.body;
      addBrowserFindings(groupMap, el, [{ type: f.type, detail: f.detail || f.snippet }]);
    }

    // Page-level quality checks (headings, etc.)
    const qualityFindings = checkPageQualityDOM().filter(f => _ruleOk(f.type));
    if (qualityFindings.length > 0) {
      pageLevelFindings.push(...qualityFindings);
      addBrowserFindings(groupMap, document.body, qualityFindings);
    }

    const creamFindings = checkCreamPalette(document)
      .map(f => ({ type: f.id, detail: f.snippet }))
      .filter(f => _ruleOk(f.type));
    if (creamFindings.length > 0) {
      pageLevelFindings.push(...creamFindings);
      addBrowserFindings(groupMap, document.body, creamFindings);
    }

    // Regex-on-HTML checks (shared with Node)
    // Clone the document and strip impeccable-live overlay nodes before the
    // regex scan, so the inspector's own inline styles (transitions on top/
    // left/width/height, etc.) don't register as page anti-patterns.
    const docClone = document.documentElement.cloneNode(true);
    for (const node of docClone.querySelectorAll('[id^="impeccable-live-"]')) {
      node.remove();
    }
    const htmlPatternFindings = checkHtmlPatterns(docClone.outerHTML);
    if (htmlPatternFindings.length > 0) {
      const mapped = htmlPatternFindings.map(f => ({ type: f.id, detail: f.snippet })).filter(f => _ruleOk(f.type));
      pageLevelFindings.push(...mapped);
      addBrowserFindings(groupMap, document.body, mapped);
    }

    return {
      groupMap,
      allFindings: browserFindingsFromMap(groupMap),
      pageLevelFindings,
    };
  }

  function shouldRunVisualContrast(options = {}) {
    return options.visualContrast === true || window.__IMPECCABLE_CONFIG__?.visualContrast === true;
  }

  function visualContrastOptions(options = {}) {
    const config = window.__IMPECCABLE_CONFIG__ || {};
    const scrollOffscreen = typeof options.scrollOffscreen === 'boolean'
      ? options.scrollOffscreen
      : typeof options.visualContrastScrollOffscreen === 'boolean'
        ? options.visualContrastScrollOffscreen
        : typeof config.visualContrastScrollOffscreen === 'boolean'
          ? config.visualContrastScrollOffscreen
          : false;
    return {
      ...options,
      maxCandidates: Number.isFinite(options.visualContrastMaxCandidates)
        ? options.visualContrastMaxCandidates
        : Number.isFinite(options.maxCandidates)
          ? options.maxCandidates
          : Number.isFinite(config.visualContrastMaxCandidates)
            ? config.visualContrastMaxCandidates
            : undefined,
      scrollOffscreen,
    };
  }

  let lastVisualContrastAnalyses = [];
  let lazyVisualContrastObserver = null;
  let lazyVisualContrastPending = new WeakMap();
  const lazyVisualContrastResolving = new WeakSet();
  let scanGeneration = 0;

  function rememberVisualContrastAnalysis(result) {
    if (!result?.selector) {
      lastVisualContrastAnalyses.push(result);
      return;
    }
    const idx = lastVisualContrastAnalyses.findIndex(item => item.selector === result.selector);
    if (idx >= 0) lastVisualContrastAnalyses[idx] = result;
    else lastVisualContrastAnalyses.push(result);
  }

  function disconnectLazyVisualContrastObserver() {
    if (lazyVisualContrastObserver) {
      lazyVisualContrastObserver.disconnect();
      lazyVisualContrastObserver = null;
    }
    lazyVisualContrastPending = new WeakMap();
  }

  function addVisualContrastResult(groupMap, result, options = {}) {
    if (result.status !== 'fail' || !result.finding || !result.selector) return false;
    let el = null;
    try {
      el = document.querySelector(result.selector);
    } catch {
      el = null;
    }
    if (!el) return false;
    const findingType = result.finding.type || result.finding.id || 'low-contrast';
    const existing = groupMap.get(el) || [];
    if (existing.some(f => (f.type || f.id) === findingType)) return false;
    addBrowserFindings(groupMap, el, [{
      type: findingType,
      detail: result.finding.detail || result.finding.snippet,
    }]);
    if (options.decorate && el !== document.body && el !== document.documentElement) {
      highlight(el, groupMap.get(el) || []);
    }
    return true;
  }

  function scanResultMeta(options = {}) {
    const scanId = options.scanId;
    if (typeof scanId !== 'string' && typeof scanId !== 'number') return {};
    return { scanId: String(scanId) };
  }

  function postSerializedFindings(groupMap, options = {}) {
    if (!EXTENSION_MODE) return;
    const allFindings = browserFindingsFromMap(groupMap);
    window.postMessage({
      source: 'impeccable-results',
      findings: serializeFindings(allFindings),
      count: allFindings.length,
      ...scanResultMeta(options),
    }, '*');
  }

  function postExtensionError(err) {
    if (!EXTENSION_MODE) return;
    window.postMessage({
      source: 'impeccable-error',
      message: err?.message || String(err),
    }, '*');
  }

  function reportVisualContrastError(err, detail = {}) {
    window.dispatchEvent(new CustomEvent('impeccable-visual-contrast-error', {
      detail: {
        ...detail,
        message: err?.message || String(err),
      },
    }));
    if (EXTENSION_MODE) {
      postExtensionError(err);
    } else {
      console.warn('[impeccable] visual contrast scan failed', err);
    }
  }

  function scheduleLazyVisualContrast(groupMap, analyses, options = {}, runtime = {}) {
    disconnectLazyVisualContrastObserver();
    if (options.visualContrastLazy === false || options.scrollOffscreen !== false) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const unresolved = (analyses || []).filter(result =>
      result?.status === 'unresolved' &&
      result.reason === 'text outside viewport' &&
      result.selector
    );
    if (unresolved.length === 0) return;
    const generation = runtime.generation || scanGeneration;

    lazyVisualContrastObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        const candidate = lazyVisualContrastPending.get(el);
        if (!candidate || lazyVisualContrastResolving.has(el)) continue;
        lazyVisualContrastObserver?.unobserve(el);
        lazyVisualContrastPending.delete(el);
        lazyVisualContrastResolving.add(el);
        waitForVisualPaint()
          .then(() => analyzeVisualContrastCandidate(candidate))
          .then(result => {
            if (generation !== scanGeneration) return;
            rememberVisualContrastAnalysis(result);
            const added = addVisualContrastResult(groupMap, result, { decorate: true });
            if (added) {
              postSerializedFindings(groupMap, options);
              window.dispatchEvent(new CustomEvent('impeccable-visual-contrast-resolved', {
                detail: {
                  selector: result.selector,
                  status: result.status,
                  finding: result.finding || null,
                },
              }));
            }
          })
          .catch(err => {
            reportVisualContrastError(err, { selector: candidate.selector });
          })
          .finally(() => {
            lazyVisualContrastResolving.delete(el);
          });
      }
    }, { threshold: 0.5 });

    for (const candidate of unresolved) {
      let el = null;
      try {
        el = document.querySelector(candidate.selector);
      } catch {
        el = null;
      }
      if (!el) continue;
      lazyVisualContrastPending.set(el, candidate);
      lazyVisualContrastObserver.observe(el);
    }
  }

  async function addVisualContrastFindings(groupMap, options = {}, runtime = {}) {
    if (!shouldRunVisualContrast(options)) {
      lastVisualContrastAnalyses = [];
      disconnectLazyVisualContrastObserver();
      return [];
    }
    const resolvedOptions = visualContrastOptions(options);
    const analyses = await analyzeVisualContrast(resolvedOptions);
    if (runtime.generation && runtime.generation !== scanGeneration) return analyses;
    lastVisualContrastAnalyses = analyses;
    for (const result of analyses) {
      addVisualContrastResult(groupMap, result, { decorate: runtime.decorate });
    }
    if (runtime.decorate || runtime.scheduleLazy) scheduleLazyVisualContrast(groupMap, analyses, resolvedOptions, runtime);
    return analyses;
  }

  async function collectBrowserFindingsAsync(options = {}, runtime = {}) {
    const collected = collectBrowserFindings();
    await addVisualContrastFindings(collected.groupMap, options, runtime);
    return {
      ...collected,
      allFindings: browserFindingsFromMap(collected.groupMap),
      visualContrastAnalyses: lastVisualContrastAnalyses,
    };
  }

  function clearOverlays() {
    scanGeneration += 1;
    disconnectLazyVisualContrastObserver();
    for (const o of [...overlays]) detachOverlay(o);
    overlays.length = 0;
    visibilityObserver.disconnect();
    overlayIndex = 0;
  }

  function renderBrowserFindings(collected, options = {}) {
    const { allFindings, pageLevelFindings } = collected;

    for (const { el, findings } of allFindings) {
      if (el === document.body || el === document.documentElement) continue;
      highlight(el, findings);
    }

    if (pageLevelFindings.length > 0) {
      showPageBanner(pageLevelFindings);
    }

    if (!EXTENSION_MODE) printSummary(allFindings);

    // In extension mode, post serialized results for the DevTools panel
    if (EXTENSION_MODE) {
      window.postMessage({
        source: 'impeccable-results',
        findings: serializeFindings(allFindings),
        count: allFindings.length,
        ...scanResultMeta(options),
      }, '*');
    }

    // After this scan completes, all subsequent reveals are instant (no stagger, no animation)
    setTimeout(() => { firstScanDone = true; }, 1000);

    return allFindings;
  }

  let firstScanDone = false;
  const scan = function(options = {}) {
    clearOverlays();
    const generation = scanGeneration;
    const collected = collectBrowserFindings();
    const allFindings = renderBrowserFindings(collected, options);
    if (shouldRunVisualContrast(options)) {
      addVisualContrastFindings(collected.groupMap, options, { decorate: true, generation })
        .then(() => {
          if (generation === scanGeneration) postSerializedFindings(collected.groupMap, options);
        })
        .catch(err => {
          reportVisualContrastError(err);
        });
    }
    return allFindings;
  };

  const scanAsync = async function(options = {}) {
    clearOverlays();
    const generation = scanGeneration;
    if (shouldRunVisualContrast(options)) {
      const collected = await collectBrowserFindingsAsync(options, { generation, scheduleLazy: true });
      if (generation !== scanGeneration) return [];
      return renderBrowserFindings(collected, options);
    }
    lastVisualContrastAnalyses = [];
    return renderBrowserFindings(collectBrowserFindings(), options);
  };

  const detect = function(options = {}) {
    lastVisualContrastAnalyses = [];
    const { allFindings } = collectBrowserFindings();
    return options.serialize === false ? allFindings : serializeFindings(allFindings);
  };

  const detectAsync = async function(options = {}) {
    if (shouldRunVisualContrast(options)) {
      const { allFindings } = await collectBrowserFindingsAsync(options);
      return options.serialize === false ? allFindings : serializeFindings(allFindings);
    }
    lastVisualContrastAnalyses = [];
    const { allFindings } = collectBrowserFindings();
    return options.serialize === false ? allFindings : serializeFindings(allFindings);
  };

  if (EXTENSION_MODE) {
    // Extension mode: listen for commands, don't auto-scan
    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data || e.data.source !== 'impeccable-command') return;
      if (e.data.action === 'scan') {
        if (e.data.config) window.__IMPECCABLE_CONFIG__ = e.data.config;
        try {
          scan(e.data.config || {});
        } catch (err) {
          postExtensionError(err);
        }
      }
      if (e.data.action === 'toggle-overlays') {
        const visible = !document.body.classList.contains('impeccable-hidden');
        document.body.classList.toggle('impeccable-hidden', visible);
        window.postMessage({ source: 'impeccable-overlays-toggled', visible: !visible }, '*');
      }
      if (e.data.action === 'remove') {
        clearOverlays();
        styleEl.remove();
        if (spotlightBackdrop) { spotlightBackdrop.remove(); spotlightBackdrop = null; }
        document.body.classList.remove('impeccable-hidden');
      }
      if (e.data.action === 'highlight') {
        try {
          const target = e.data.selector ? document.querySelector(e.data.selector) : null;
          if (target) {
            // Scroll first so positionOverlay reads the post-scroll rect
            if (!isInViewport(target) && target.scrollIntoView) {
              target.scrollIntoView({ behavior: 'instant', block: 'center' });
            }
            for (const o of overlays) {
              if (o.classList.contains('impeccable-banner')) continue;
              const isMatch = o._targetEl === target;
              o.classList.toggle('impeccable-spotlight', isMatch);
              o.classList.toggle('impeccable-spotlight-dimmed', !isMatch);
              if (isMatch) {
                // Force the matching overlay visible immediately, don't wait for IntersectionObserver
                o.style.display = '';
                o.style.animation = 'none';
                o.classList.add('impeccable-visible');
                o._revealed = true;
                positionOverlay(o);
              }
            }
            showSpotlight(target);
          }
        } catch { /* invalid selector */ }
      }
      if (e.data.action === 'unhighlight') {
        hideSpotlight();
        for (const o of overlays) {
          o.classList.remove('impeccable-spotlight');
          o.classList.remove('impeccable-spotlight-dimmed');
        }
      }
    });
    window.postMessage({ source: 'impeccable-ready' }, '*');
  } else {
    if (window.__IMPECCABLE_CONFIG__?.autoScan !== false) {
      const runAutoScan = () => {
        try {
          scan();
        } catch (err) {
          console.warn('[impeccable] scan failed', err);
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(runAutoScan, 100));
      } else {
        setTimeout(runAutoScan, 100);
      }
    }
  }

  window.impeccableDetect = detect;
  window.impeccableDetectAsync = detectAsync;
  window.impeccableScan = scan;
  window.impeccableScanAsync = scanAsync;
  window.impeccableCollectVisualContrastCandidates = collectVisualContrastCandidates;
  window.impeccableAnalyzeVisualContrast = analyzeVisualContrast;
  window.impeccableGetLastVisualContrastAnalyses = () => lastVisualContrastAnalyses.slice();
}
