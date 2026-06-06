function sanitizeScreenshotClip(clip, viewport) {
  if (!clip) return null;
  const x = Math.max(0, Math.floor(clip.x || 0));
  const y = Math.max(0, Math.floor(clip.y || 0));
  const width = Math.min(
    Math.max(1, Math.ceil(clip.width || 0)),
    Math.max(1, viewport?.width || 1600),
  );
  const height = Math.min(
    Math.max(1, Math.ceil(clip.height || 0)),
    320,
  );
  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
}

async function compareScreenshotContrast(page, beforeBase64, afterBase64, candidate) {
  return page.evaluate(async ({ beforeBase64, afterBase64, candidate }) => {
    const loadImage = (base64) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode contrast screenshot'));
      img.src = `data:image/png;base64,${base64}`;
    });
    const [before, after] = await Promise.all([loadImage(beforeBase64), loadImage(afterBase64)]);
    const width = Math.min(before.width, after.width);
    const height = Math.min(before.height, after.height);
    if (width < 1 || height < 1) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(before, 0, 0, width, height);
    const beforePixels = ctx.getImageData(0, 0, width, height).data;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(after, 0, 0, width, height);
    const afterPixels = ctx.getImageData(0, 0, width, height).data;

    const luminance = ({ r, g, b }) => {
      const convert = c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
    };
    const ratio = (a, b) => {
      const l1 = luminance(a);
      const l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };

    const cssTextColor = candidate.textColor && !candidate.preferRenderedForeground
      ? {
          r: candidate.textColor.r,
          g: candidate.textColor.g,
          b: candidate.textColor.b,
        }
      : null;
    const ratios = [];
    let glyphPixels = 0;
    let strongestDelta = 0;
    for (let i = 0; i < beforePixels.length; i += 4) {
      const delta = Math.abs(beforePixels[i] - afterPixels[i])
        + Math.abs(beforePixels[i + 1] - afterPixels[i + 1])
        + Math.abs(beforePixels[i + 2] - afterPixels[i + 2])
        + Math.abs(beforePixels[i + 3] - afterPixels[i + 3]);
      strongestDelta = Math.max(strongestDelta, delta);
      if (delta < 10) continue;
      glyphPixels++;
      const fg = cssTextColor || {
        r: beforePixels[i],
        g: beforePixels[i + 1],
        b: beforePixels[i + 2],
      };
      const bg = {
        r: afterPixels[i],
        g: afterPixels[i + 1],
        b: afterPixels[i + 2],
      };
      ratios.push(ratio(fg, bg));
    }

    if (ratios.length < 8) {
      return {
        glyphPixels,
        strongestDelta,
        worstRatio: null,
        p10Ratio: null,
        medianRatio: null,
      };
    }

    ratios.sort((a, b) => a - b);
    const pick = pct => ratios[Math.min(ratios.length - 1, Math.max(0, Math.floor((pct / 100) * ratios.length)))];
    return {
      glyphPixels,
      strongestDelta,
      worstRatio: ratios[0],
      p10Ratio: pick(10),
      medianRatio: pick(50),
    };
  }, { beforeBase64, afterBase64, candidate });
}

async function captureVisualContrastCandidate(page, candidate, viewport) {
  const clip = sanitizeScreenshotClip(candidate.clip, viewport);
  if (!clip) return null;

  const beforeBase64 = await page.screenshot({
    encoding: 'base64',
    clip,
    captureBeyondViewport: true,
  });
  const token = `impeccable-contrast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const applied = await page.evaluate(({ selector, token, backgroundClipText }) => {
    let el;
    try {
      el = document.querySelector(selector);
    } catch {
      return false;
    }
    if (!el) return false;
    let style = document.getElementById('impeccable-visual-contrast-hide-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'impeccable-visual-contrast-hide-style';
      style.textContent = [
        '[data-impeccable-visual-contrast-target] {',
        '  color: transparent !important;',
        '  -webkit-text-fill-color: transparent !important;',
        '  text-shadow: none !important;',
        '}',
        '[data-impeccable-visual-contrast-target][data-impeccable-bgclip-text="true"] {',
        '  background-image: none !important;',
        '}',
      ].join('\n');
      document.head.appendChild(style);
    }
    el.setAttribute('data-impeccable-visual-contrast-target', token);
    if (backgroundClipText) el.setAttribute('data-impeccable-bgclip-text', 'true');
    return true;
  }, {
    selector: candidate.selector,
    token,
    backgroundClipText: candidate.backgroundClipText,
  });
  if (!applied) return null;

  let afterBase64;
  try {
    afterBase64 = await page.screenshot({
      encoding: 'base64',
      clip,
      captureBeyondViewport: true,
    });
  } finally {
    await page.evaluate(({ selector }) => {
      try {
        const el = document.querySelector(selector);
        if (el) {
          el.removeAttribute('data-impeccable-visual-contrast-target');
          el.removeAttribute('data-impeccable-bgclip-text');
        }
      } catch {
        // Ignore invalid or stale selectors during cleanup.
      }
    }, { selector: candidate.selector }).catch(() => {});
  }

  const metrics = await compareScreenshotContrast(page, beforeBase64, afterBase64, candidate);
  if (!metrics || !Number.isFinite(metrics.p10Ratio) || metrics.glyphPixels < 8) return null;
  const measuredRatio = metrics.p10Ratio;
  if (measuredRatio >= candidate.threshold) return null;
  const textLabel = candidate.text ? ` "${candidate.text}"` : '';
  const reasonLabel = (candidate.reasons || []).slice(0, 3).join(', ') || 'visual background';
  return {
    id: 'low-contrast',
    snippet: `pixel contrast ${measuredRatio.toFixed(1)}:1 median ${metrics.medianRatio.toFixed(1)}:1 (need ${candidate.threshold}:1) on ${reasonLabel}${textLabel}`,
  };
}

export {
  sanitizeScreenshotClip,
  compareScreenshotContrast,
  captureVisualContrastCandidate,
};
