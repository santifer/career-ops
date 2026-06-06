const ANTIPATTERNS = [
  // ── AI slop: tells that something was AI-generated ──
  {
    id: 'side-tab',
    category: 'slop',
    name: 'Side-tab accent border',
    description:
      'Thick colored border on one side of a card — the most recognizable tell of AI-generated UIs. Use a subtler accent or remove it entirely.',
    skillSection: 'Visual Details',
    skillGuideline: 'colored accent stripe',
  },
  {
    id: 'border-accent-on-rounded',
    category: 'slop',
    name: 'Border accent on rounded element',
    description:
      'Thick accent border on a rounded card — the border clashes with the rounded corners. Remove the border or the border-radius.',
    skillSection: 'Visual Details',
    skillGuideline: 'colored accent stripe',
  },
  {
    id: 'overused-font',
    category: 'slop',
    name: 'Overused font',
    description:
      'Inter, Roboto, Fraunces, Geist, Plus Jakarta Sans, and Space Grotesk are used on so many sites they no longer feel distinctive. Each new wave of AI-generated UIs converges on the same handful of faces. Choose a face that gives your interface personality.',
    skillSection: 'Typography',
    skillGuideline: 'overused fonts like Inter',
  },
  {
    id: 'single-font',
    category: 'slop',
    name: 'Single font for everything',
    description:
      'Only one font family is used for the entire page. Pair a distinctive display font with a refined body font to create typographic hierarchy.',
    skillSection: 'Typography',
    skillGuideline: 'only one font family for the entire page',
  },
  {
    id: 'flat-type-hierarchy',
    category: 'slop',
    name: 'Flat type hierarchy',
    description:
      'Font sizes are too close together — no clear visual hierarchy. Use fewer sizes with more contrast (aim for at least a 1.25 ratio between steps).',
    skillSection: 'Typography',
    skillGuideline: 'flat type hierarchy',
  },
  {
    id: 'gradient-text',
    category: 'slop',
    name: 'Gradient text',
    description:
      'Gradient text is decorative rather than meaningful — a common AI tell, especially on headings and metrics. Use solid colors for text.',
    skillSection: 'Color & Contrast',
    skillGuideline: 'gradient text for',
  },
  {
    id: 'ai-color-palette',
    category: 'slop',
    name: 'AI color palette',
    description:
      'Purple/violet gradients and cyan-on-dark are the most recognizable tells of AI-generated UIs. Choose a distinctive, intentional palette.',
    skillSection: 'Color & Contrast',
    skillGuideline: 'AI color palette',
  },
  {
    id: 'cream-palette',
    category: 'slop',
    name: 'Cream / beige palette',
    description:
      'A warm cream or beige page background has become the default "tasteful" AI surface, reached for by reflex. Choose a background that comes from a deliberate palette, not the safe warm off-white.',
    skillSection: 'Color & Contrast',
    skillGuideline: 'cream and beige as the default surface',
  },
  {
    id: 'nested-cards',
    category: 'slop',
    name: 'Nested cards',
    description:
      'Cards inside cards create visual noise and excessive depth. Flatten the hierarchy — use spacing, typography, and dividers instead of nesting containers.',
    skillSection: 'Layout & Space',
    skillGuideline: 'Nest cards inside cards',
  },
  {
    id: 'monotonous-spacing',
    category: 'slop',
    name: 'Monotonous spacing',
    description:
      'The same spacing value used everywhere — no rhythm, no variation. Use tight groupings for related items and generous separations between sections.',
    skillSection: 'Layout & Space',
    skillGuideline: 'same spacing everywhere',
  },
  {
    id: 'bounce-easing',
    category: 'slop',
    name: 'Bounce or elastic easing',
    description:
      'Bounce and elastic easing feel dated and tacky. Real objects decelerate smoothly — use exponential easing (ease-out-quart/quint/expo) instead.',
    skillSection: 'Motion',
    skillGuideline: 'bounce or elastic easing',
  },
  {
    id: 'dark-glow',
    category: 'slop',
    name: 'Dark mode with glowing accents',
    description:
      'Dark backgrounds with colored box-shadow glows are the default "cool" look of AI-generated UIs. Use subtle, purposeful lighting instead — or skip the dark theme entirely.',
    skillSection: 'Color & Contrast',
    skillGuideline: 'dark mode with glowing accents',
  },
  {
    id: 'icon-tile-stack',
    category: 'slop',
    name: 'Icon tile stacked above heading',
    description:
      'A small rounded-square icon container above a heading is the universal AI feature-card template — every generator outputs this exact shape. Try a side-by-side icon and heading, or let the icon sit in flow without its own container.',
    skillSection: 'Typography',
    skillGuideline: 'large icons with rounded corners above every heading',
  },
  {
    id: 'italic-serif-display',
    category: 'slop',
    name: 'Italic serif display headline',
    description:
      'Oversized italic serif (Fraunces, Recoleta, Playfair, Newsreader-italic) as the primary hero headline reads as taste in isolation but has become the universal AI-startup landing page hero. Set roman, or move to a non-serif display face. Editorial / magazine register may legitimately want this — judge by context.',
    skillSection: 'Typography',
    skillGuideline: 'oversized italic serif as the hero headline',
  },
  {
    id: 'hero-eyebrow-chip',
    category: 'slop',
    name: 'Hero eyebrow / pill chip',
    description:
      'A tiny uppercase letter-spaced label sitting immediately above an oversized hero headline — or the same shape rendered as a pill chip — is now the default AI SaaS hero. Drop the eyebrow, integrate the kicker into the headline, or run it as a navigation breadcrumb instead.',
    skillSection: 'Typography',
    skillGuideline: 'tiny uppercase tracked label above the hero headline',
  },
  {
    id: 'repeated-section-kickers',
    category: 'slop',
    severity: 'advisory',
    name: 'Repeated section kicker labels',
    description:
      'Repeating tiny uppercase tracked labels above section headings turns a brand page into AI editorial scaffolding. Replace them with stronger structure, artifacts, imagery, or a deliberate brand system.',
    skillSection: 'Typography',
    skillGuideline: 'repeated eyebrow or kicker labels as section scaffolding',
  },
  {
    id: 'numbered-section-markers',
    category: 'slop',
    severity: 'advisory',
    name: 'Numbered section markers (01 / 02 / 03)',
    description:
      'Numbered display markers as section labels (01, 02, 03) are the AI editorial scaffold one tier deeper than tracked eyebrow chips. If you find yourself reaching for them, choose a different section cadence.',
    skillSection: 'Layout & Space',
    skillGuideline: 'numbered section markers',
  },
  {
    id: 'em-dash-overuse',
    category: 'slop',
    name: 'Em-dash overuse',
    description:
      'More than two em-dashes (— or --) in body copy is an AI cadence tell. Use commas, colons, periods, or parentheses instead.',
    skillSection: 'Copy',
    skillGuideline: 'no em dashes',
  },
  {
    id: 'marketing-buzzword',
    category: 'slop',
    name: 'Marketing buzzword',
    description:
      'Generic SaaS phrases (streamline / empower / supercharge / world-class / enterprise-grade / next-generation / cutting-edge / etc) are instant AI tells. Pick a specific verb and noun that says what the product literally does.',
    skillSection: 'Copy',
    skillGuideline: 'marketing buzzwords',
  },
  {
    id: 'aphoristic-cadence',
    category: 'slop',
    name: 'Aphoristic-cadence copy',
    description:
      'Three or more sections landing on a short rebuttal sentence ("X. No Y." / "X. Just Y.") or a manufactured-contrast aphorism ("Not a feature. A platform.") reads as AI cadence, not voice. Once is fine; the pattern is the tell.',
    skillSection: 'Copy',
    skillGuideline: 'aphoristic cadence',
  },
  {
    id: 'oversized-h1',
    category: 'slop',
    name: 'Oversized hero headline',
    description:
      'A full-sentence headline set at display size ends up dominating the viewport, leaving no room for anything else above the fold. A punchy one- or two-word headline at that size is fine — the problem is a long headline blown up too large. Set long headlines smaller, or tighten the copy.',
    skillSection: 'Typography',
    skillGuideline: 'long headline set at display size',
  },
  {
    id: 'extreme-negative-tracking',
    category: 'slop',
    name: 'Crushed letter spacing',
    description:
      'Letter-spacing pulled tighter than the point where characters keep their own shapes costs legibility. Tighten display type optically, not destructively.',
    skillSection: 'Typography',
    skillGuideline: 'letter spacing crushed past legibility',
  },
  {
    id: 'broken-image',
    category: 'quality',
    name: 'Broken or placeholder image',
    description:
      '<img> tags with empty src, missing src, or placeholder values ship as broken-image boxes. Use real images, generated assets, or remove the tag.',
    skillSection: 'Imagery',
    skillGuideline: 'broken image references',
  },

  // ── Quality: general design and accessibility issues ──
  {
    id: 'gray-on-color',
    category: 'quality',
    name: 'Gray text on colored background',
    description:
      'Gray text looks washed out on colored backgrounds. Use a darker shade of the background color instead, or white/near-white for contrast.',
    skillSection: 'Color & Contrast',
    skillGuideline: 'gray text on colored backgrounds',
  },
  {
    id: 'low-contrast',
    category: 'quality',
    name: 'Low contrast text',
    description:
      'Text does not meet WCAG AA contrast requirements (4.5:1 for body, 3:1 for large text). Increase the contrast between text and background.',
  },
  {
    id: 'layout-transition',
    category: 'quality',
    name: 'Layout property animation',
    description:
      'Animating width, height, padding, or margin causes layout thrash and janky performance. Use transform and opacity instead, or grid-template-rows for height animations.',
    skillSection: 'Motion',
    skillGuideline: 'Animate layout properties',
  },
  {
    id: 'line-length',
    category: 'quality',
    name: 'Line length too long',
    description:
      'Text lines wider than ~80 characters are hard to read. The eye loses its place tracking back to the start of the next line. Add a max-width (65ch to 75ch) to text containers.',
    skillSection: 'Layout & Space',
    skillGuideline: 'wrap beyond ~80 characters',
  },
  {
    id: 'cramped-padding',
    category: 'quality',
    name: 'Cramped padding',
    description:
      'Text is too close to the edge of its container. Two shapes: (1) an element with its own text where the padding is too low for the font size, and (2) a wrapper with text-bearing children and near-zero padding against a visible boundary (border, outline, or non-transparent background) — children land flush against the boundary line. Add at least 8px (ideally 12–16px) of padding inside bordered, outlined, or colored containers.',
    skillSection: 'Layout & Space',
    skillGuideline: 'inside bordered or colored containers',
  },
  {
    id: 'body-text-viewport-edge',
    category: 'quality',
    name: 'Body text touching viewport edge',
    description:
      'Body paragraphs render flush against the left or right viewport edge with no container providing horizontal padding. Wrap content in a container with at least 16px (ideally 24-32px) of horizontal padding, or apply max-width with mx-auto.',
  },
  {
    id: 'tight-leading',
    category: 'quality',
    name: 'Tight line height',
    description:
      'Line height below 1.3x the font size makes multi-line text hard to read. Use 1.5 to 1.7 for body text so lines have room to breathe.',
  },
  {
    id: 'skipped-heading',
    category: 'quality',
    name: 'Skipped heading level',
    description:
      'Heading levels should not skip (e.g. h1 then h3 with no h2). Screen readers use heading hierarchy for navigation. Skipping levels breaks the document outline.',
  },
  {
    id: 'justified-text',
    category: 'quality',
    name: 'Justified text',
    description:
      'Justified text without hyphenation creates uneven word spacing ("rivers of white"). Use text-align: left for body text, or enable hyphens: auto if you must justify.',
  },
  {
    id: 'tiny-text',
    category: 'quality',
    name: 'Tiny body text',
    description:
      'Body text below 12px is hard to read, especially on high-DPI screens. Use at least 14px for body content, 16px is ideal.',
  },
  {
    id: 'all-caps-body',
    category: 'quality',
    name: 'All-caps body text',
    description:
      'Long passages in uppercase are hard to read. We recognize words by shape (ascenders and descenders), which all-caps removes. Reserve uppercase for short labels and headings.',
    skillSection: 'Typography',
    skillGuideline: 'long body passages in uppercase',
  },
  {
    id: 'wide-tracking',
    category: 'quality',
    name: 'Wide letter spacing on body text',
    description:
      'Letter spacing above 0.05em on body text disrupts natural character groupings and slows reading. Reserve wide tracking for short uppercase labels only.',
  },
  {
    id: 'text-overflow',
    category: 'quality',
    name: 'Content overflowing its container',
    description:
      'Content renders wider than its container, spilling out or forcing a horizontal scrollbar. Let text wrap, constrain widths, or give the region a deliberate scroll affordance.',
    skillSection: 'Layout & Space',
    skillGuideline: 'content wider than its container',
  },
  {
    id: 'clipped-overflow-container',
    category: 'quality',
    name: 'Positioned child clipped by overflow container',
    description:
      'A clipping container (overflow hidden or clip) wrapping an absolutely-positioned child cuts off tooltips, menus, and popovers that need to escape. Let the overflow be visible, or move the positioned layer out of the clip.',
    skillSection: 'Layout & Space',
    skillGuideline: 'overflow container clipping positioned children',
  },

  // ── Provider tells: opt-in via --gpt / --gemini (gated off by default) ──
  {
    id: 'gpt-thin-border-wide-shadow',
    category: 'slop',
    severity: 'advisory',
    gated: 'gpt',
    name: 'Hairline border with wide shadow',
    description:
      'A hairline border paired with a wide, diffuse shadow is a recurring generated-UI signature. Commit to one — a defined edge or a soft elevation — rather than both at once.',
    skillSection: 'Visual Details',
    skillGuideline: 'hairline border plus wide diffuse shadow',
  },
  {
    id: 'repeating-stripes-gradient',
    category: 'slop',
    severity: 'advisory',
    gated: 'gpt',
    name: 'Repeating-gradient stripes',
    description:
      'Repeating-gradient stripes used as surface decoration are a recurring generated-UI signature. Reach for a deliberate texture or leave the surface plain.',
    skillSection: 'Visual Details',
    skillGuideline: 'repeating-gradient decorative stripes',
  },
  {
    id: 'theater-slop-phrase',
    category: 'slop',
    severity: 'advisory',
    gated: 'gpt',
    name: 'Theater framing copy',
    description:
      'Dismissing something as "theater" is a recurring generated-copy tic. Say plainly what the thing does or does not do.',
    skillSection: 'Copy',
    skillGuideline: 'theater framing copy',
  },
  {
    id: 'image-hover-transform',
    category: 'slop',
    severity: 'advisory',
    gated: 'gemini',
    name: 'Image hover transform',
    description:
      'Scaling or rotating an image on hover is a recurring generated-UI signature. Let imagery sit still, or use a subtler, purposeful interaction.',
    skillSection: 'Motion',
    skillGuideline: 'image scale or rotate on hover',
  },
];

const RULE_ENGINE_SUPPORT = {
  regex: new Set(['source', 'page-analyzer']),
  'static-html': new Set(['element', 'page']),
  browser: new Set(['element', 'page', 'layout']),
  visual: new Set(['visual-contrast']),
};

function getAntipattern(id) {
  return ANTIPATTERNS.find(rule => rule.id === id);
}

function getRulesForCategory(category) {
  return ANTIPATTERNS.filter(rule => rule.category === category);
}

function getRuleEngineSupport(engine) {
  return RULE_ENGINE_SUPPORT[engine] || new Set();
}

// Set of provider tags that gate rules off by default (e.g. 'gpt', 'gemini').
const GATED_PROVIDERS = new Set(
  ANTIPATTERNS.map(rule => rule.gated).filter(Boolean),
);

// Drop findings for rules gated behind a provider tag unless that provider
// was explicitly enabled (CLI --gpt / --gemini). Non-gated findings always
// pass through. `findings` carry the rule id on `.antipattern`.
function filterByProviders(findings, providers = []) {
  const enabled = new Set(providers || []);
  if (!GATED_PROVIDERS.size) return findings;
  return findings.filter(f => {
    const rule = getAntipattern(f.antipattern);
    if (!rule || !rule.gated) return true;
    return enabled.has(rule.gated);
  });
}

export {
  ANTIPATTERNS,
  RULE_ENGINE_SUPPORT,
  GATED_PROVIDERS,
  getAntipattern,
  getRulesForCategory,
  getRuleEngineSupport,
  filterByProviders,
};
