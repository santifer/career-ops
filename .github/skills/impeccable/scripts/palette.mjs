#!/usr/bin/env node
/**
 * Brand-seed picker. Returns one OKLCH seed color + the mood it most
 * naturally evokes, and teaches the model how to compose a full palette
 * around it.
 *
 * The seed is the brand's anchor color. The 5-role palette (bg, surface,
 * ink, accent, muted) is composed by the caller at runtime using their
 * judgment + the brief (PRODUCT.md / DESIGN.md / user prompt), NOT picked
 * from a frozen 4-color preset.
 *
 * Why: 4-color frozen palettes drift toward safe defaults (warm-cream bg,
 * complementary accent on near-white) regardless of brief. A single seed +
 * the model's own composition lets the same seed produce a dark-mode jazz
 * club or a light-mode hospitality brand depending on what the brief calls
 * for. Tested empirically against curated 4-color palettes; seed approach
 * wins on mood-fit in 3 of 5 cases and ties on the rest.
 *
 * Usage:
 *   node scripts/palette.mjs                  # pick at random
 *   node scripts/palette.mjs --id seed-021    # pick a specific seed
 *   node scripts/palette.mjs --from <key>     # hash <key> to a seed (deterministic)
 *
 * Env vars:
 *   IMPECCABLE_PALETTE_SEED — same as --from; useful for the eval harness
 *     to make runs reproducible.
 */

import crypto from 'node:crypto';

// Seeds are inlined (129 entries, hand-curated via a tinder review of
// ~400 candidates from ColorHunt + synthesis + Radix/brand/Pantone anchors).
// Each carries a mood + strategy the judging model produced — surfaced as
// hints, not commands; the brief still drives composition.
const SEEDS = [
  { id: "seed-200", oklch: [0.360, 0.137, 0.0],
    mood: "Aesop apothecary shelf — oxblood bottle glass against linen, considered and unhurried",
    strategy: "Seed is a deep desaturated red-brown that reads as brand ink itself; I push primary darker toward bottle-glass oxblood, pair with a pure white surface so the red does the work, and use a clear pale-blush accent that can carry dark text in pills." },
  { id: "seed-000", oklch: [0.400, 0.130, 0.0],
    mood: "oxblood leather banquette in a 1940s steakhouse — low lamplight on dark wood and burgundy",
    strategy: "Near-black bg with the faintest red undertone lets the oxblood primary glow like lamplit leather; warm cream ink and a brass accent complete the chophouse register." },
  { id: "seed-002", oklch: [0.450, 0.150, 0.0],
    mood: "darkroom red light — analog photography, blood-warm safelight glow on chemical trays",
    strategy: "Near-black surface with a deep oxblood primary lets the seed function like a safelight in a darkroom — the bg disappears so the red becomes the only emotional signal." },
  { id: "seed-003", oklch: [0.500, 0.194, 0.0],
    mood: "darkroom safelight — the deep oxblood glow of analog photography, chemical and contemplative",
    strategy: "Anchored the seed as primary against pure near-black so the red reads like a single illuminated bulb in a developing room, with cool desaturated ink to evoke silver gelatin print tones." },
  { id: "seed-004", oklch: [0.546, 0.204, 3.4],
    mood: "midnight boudoir — velvet rose under low lamplight, perfumed and intimate",
    strategy: "Near-black surface lets the rose seed glow like silk in shadow; a warm champagne accent provides the candle-flame counterpoint without breaking the hush." },
  { id: "seed-005", oklch: [0.550, 0.180, 0.0],
    mood: "smoldering vermillion at dusk — the last red ember in a blacksmith's forge, iron-rich and quietly violent",
    strategy: "Near-black gallery surround lets the seed read as glowing forged metal; ink stays warm-off-white, accent shifts to a hotter ember orange so the primary feels like cooling steel against a fresh strike." },
  { id: "seed-201", oklch: [0.647, 0.262, 0.3],
    mood: "Figma plugin marketplace red — confident product-brand crimson, the kind a modern dev tool uses for a 'live' indicator or a primary CTA on a pristine docs page",
    strategy: "Pure white surface lets a high-chroma crimson primary do all the brand work, paired with a hue-shifted warm coral accent for hierarchy without competing saturation" },
  { id: "seed-006", oklch: [0.650, 0.160, 0.0],
    mood: "1960s Italian cinema — Technicolor lipstick red against a darkened theater",
    strategy: "Pure near-black surface lets a saturated cinematic red and its warm peach accent perform like film light projected in a dark room — the brand colors carry the drama, the bg disappears." },
  { id: "seed-008", oklch: [0.520, 0.200, 10.4],
    mood: "Negroni hour at a Milanese bar — bittersweet crimson, vermouth and amaro under low tungsten",
    strategy: "Seed is a saturated red-crimson with cinematic weight, so I sit it on near-black to let the primary glow like backlit liquor, with a warmer amber accent acting as the citrus twist against the bitter red." },
  { id: "seed-010", oklch: [0.563, 0.223, 11.0],
    mood: "Negroni hour on a Milan rooftop — bittersweet crimson, aperitivo light, polished restraint",
    strategy: "Seed is a vivid carmine-red with strong chroma, so the surface gets out of the way (pure white) and lets the primary do the aperitivo work, with a cooled garnet accent for tension." },
  { id: "seed-202", oklch: [0.643, 0.247, 7.0],
    mood: "Glossier brand pink — modern beauty editorial, confident and current",
    strategy: "Pure white bg lets a saturated rose-red primary do all the brand work, paired with a deeper crimson accent for hierarchy — the Stripe/Glossier move where the color carries the mood." },
  { id: "seed-013", oklch: [0.400, 0.130, 20.0],
    mood: "Tuscan cellar at dusk — aged terracotta, oxidized iron, the deep red of decanted Sangiovese",
    strategy: "Black surface lets the oxblood seed and copper accent glow like firelight on cellar stone; brand colors carry all the warmth while the room recedes." },
  { id: "seed-014", oklch: [0.450, 0.150, 20.0],
    mood: "smoldering tannery — oxblood leather, cured under low workshop light",
    strategy: "Anchor the deep oxblood seed as primary against a near-black architectural ground, then lift with a single warm ember accent so the leather reads burnished rather than bloody." },
  { id: "seed-016", oklch: [0.550, 0.180, 20.0],
    mood: "Negroni hour on a Roman terrace — bitter campari red, vermouth, late golden light spilling on white linen",
    strategy: "Pure white surface lets the campari-red primary do all the emotional work, paired with a deeper oxblood accent for bittersweet depth — Italian aperitivo restraint, not warmth-washed." },
  { id: "seed-205", oklch: [0.634, 0.254, 17.6],
    mood: "Aesop apothecary bottle — considered red-coral on a clinical white surface, the kind of brand restraint where one saturated object does all the work",
    strategy: "Default A pure white surface lets a single coral-red primary carry the entire brand voice; accent shifts to a deeper oxblood for hierarchy without competing chroma." },
  { id: "seed-011", oklch: [0.639, 0.207, 13.5],
    mood: "Aperitivo hour in Milan — Campari glow on a white marble bar, crisp and effervescent",
    strategy: "Pure white gallery backdrop lets the Campari-red primary ring like a single bitter note; ink is near-black with a whisper of warmth, accent shifts to a deeper oxblood for hierarchy without competing hues." },
  { id: "seed-015", oklch: [0.527, 0.202, 22.7],
    mood: "Negroni hour on a Milanese terrace — bittersweet vermillion, aperitivo glassware catching low sun",
    strategy: "Seed becomes a saturated aperitivo-red primary against pure white so the color carries the bittersweet warmth alone, paired with a deep oxblood accent for typographic gravitas." },
  { id: "seed-023", oklch: [0.427, 0.175, 29.2],
    mood: "blacksmith's forge at dusk — iron heated to ember red, the deep glow of oxidized metal and quenching oil",
    strategy: "Pure black bg lets the seed's ember-red glow radiate like hot iron in a dark forge; accent shifts to a copper-amber to suggest scaling metal and sparks, while ink stays near-white for tool-precise legibility." },
  { id: "seed-206", oklch: [0.614, 0.234, 28.2],
    mood: "Aesop apothecary bottle — considered red-orange on lab-white, calm utility with a single confident pigment",
    strategy: "Pure white surface lets a saturated vermilion primary do all the brand work, paired with a deep oxblood accent for hierarchy without introducing a second hue family" },
  { id: "seed-029", oklch: [0.665, 0.222, 25.7],
    mood: "Negroni hour at a Milanese bar — bittersweet orange-red liqueur catching late afternoon light on polished marble",
    strategy: "Pure white surface lets the seed's vermilion read like Campari in a glass; a deeper oxblood accent provides the bitter depth, with neutral graphite ink keeping the editorial restraint of Italian design." },
  { id: "seed-022", oklch: [0.418, 0.155, 27.2],
    mood: "Pompeiian red fresco — oxidized cinnabar on a museum wall, archaeological gravity",
    strategy: "Pure black gallery surface lets the seed's iron-oxide red read as a lit artifact; accent shifts to an aged terracotta amber, so primary and accent form a fired-clay duet against neutral void." },
  { id: "seed-024", oklch: [0.464, 0.169, 26.9],
    mood: "Mid-century darkroom under the safelight — developer trays, oxblood leather, the quiet patience of a print emerging",
    strategy: "Seed becomes a deep oxblood primary; surface stays pure black so the red glows like a safelight, with a warmer ember accent for hierarchy" },
  { id: "seed-026", oklch: [0.489, 0.190, 28.3],
    mood: "smoldering ember in a blacksmith's forge — iron-hot rust, soot, and controlled fire",
    strategy: "Near-black soot background lets the seed's red-orange glow like heated metal; ink is bone-white, accent is a cooler tempered-steel orange that creates internal heat gradient with the primary." },
  { id: "seed-027", oklch: [0.568, 0.208, 27.1],
    mood: "Sicilian blood orange at golden hour — citrus rind, terracotta, sun on stucco",
    strategy: "Seed reads as vivid blood-orange — picked pure white surface so the citrus-red primary and a deep oxblood accent do all the emotional work, like a Loro Piana editorial spread." },
  { id: "seed-028", oklch: [0.591, 0.172, 24.0],
    mood: "Sienna-fired ceramic studio at dusk — terracotta cooling on a wheel, hands still dusted with slip",
    strategy: "Pure black stage lets the fired-clay primary glow like a kiln ember, with a deeper oxblood accent providing tonal weight rather than hue contrast — a monochrome warm-axis play." },
  { id: "seed-033", oklch: [0.544, 0.169, 31.3],
    mood: "1960s Italian terracotta workshop — fired clay, espresso, late-afternoon Mediterranean dust",
    strategy: "Pure black ground lets the seed's burnt-sienna primary glow like a lit kiln, with a deeper oxblood accent for restrained warmth tension — the brand carries the heat, the surface stays out." },
  { id: "seed-207", oklch: [0.564, 0.231, 29.1],
    mood: "Aesop apothecary bottle — considered red oxide, the calm authority of a well-made object on a white shelf",
    strategy: "Seed becomes the singular brand voice against pure white, with a deeper oxblood accent for hierarchy — the surface disappears so the red does all the speaking." },
  { id: "seed-035", oklch: [0.663, 0.153, 32.1],
    mood: "Aesop apothecary bottle — clay-fired warmth, considered retail",
    strategy: "Pure white surface lets the terracotta primary do the brand work, paired with a deep umber ink and a cooler clay accent for editorial tension." },
  { id: "seed-037", oklch: [0.590, 0.188, 35.8],
    mood: "Aesop apothecary bottle — considered terracotta, herbalist restraint, the warmth comes from the glass not the room",
    strategy: "Seed becomes a muted terracotta primary against pure white so the brand's warmth carries entirely through the color itself; accent shifts to a deeper umber for quiet hierarchy." },
  { id: "seed-038", oklch: [0.652, 0.229, 34.8],
    mood: "blown-glass furnace at dusk — molten orange iron pulled from the kiln, a craftsman's signature heat",
    strategy: "Pure black stage so the seed reads as live ember; primary holds the seed's heat, accent shifts to a brass-amber a hue-step away for a 1.7+ contrast pairing without leaving the fire." },
  { id: "seed-039", oklch: [0.653, 0.185, 33.5],
    mood: "Aesop apothecary bottle — considered terracotta, quiet retail craft",
    strategy: "Seed becomes a grounded clay primary against pure white, paired with a deeper umber accent so the warmth lives entirely in the brand marks, not the surface." },
  { id: "seed-167", oklch: [0.495, 0.134, 36.0],
    mood: "Aesop apothecary shelf — burnished terracotta on clinical white, considered craft pharmacy",
    strategy: "Treat the seed as a brand-carrying burnt-sienna against a pure paper-white surface so the warmth lives entirely in the primary, with a deep umber accent pulled along the same warm axis for typographic gravity." },
  { id: "seed-147", oklch: [0.500, 0.151, 40.0],
    mood: "Aesop apothecary shelf — considered terracotta, pharmacy restraint, the brand color does the work against clinical white",
    strategy: "Anchor the seed's burnt-sienna primary against a pure white surface so the rust speaks alone, with a deep umber ink and a cooler clay accent to give the palette product-brand discipline rather than environmental warmth." },
  { id: "seed-040", oklch: [0.660, 0.201, 40.0],
    mood: "Aesop apothecary bottle — amber glass on a clean dispensary shelf, considered and clinical-warm",
    strategy: "Seed becomes a burnt-amber primary against pure white so the bottle-glass color does the emotional work; accent shifts to a deep olive-bronze for the apothecary-label pairing." },
  { id: "seed-041", oklch: [0.673, 0.217, 38.6],
    mood: "Aesop apothecary shelf — considered orange glass, clinical retail restraint",
    strategy: "Pure white surface lets the burnt-orange primary do all the brand work, with a deep ink-brown for editorial gravity and a muted clay accent that reads as a sibling, not a contrast." },
  { id: "seed-042", oklch: [0.688, 0.133, 35.8],
    mood: "Aesop apothecary shelf — terracotta glass, considered retail",
    strategy: "Seed becomes a warm clay primary against pure white so the bottle-on-marble retail feel comes from the brand color alone; a deeper umber accent gives the label-print contrast." },
  { id: "seed-043", oklch: [0.781, 0.119, 38.1],
    mood: "Aesop apothecary catalogue — considered terracotta, dermatological restraint, the warm color doing all the work against clinical white",
    strategy: "Pure white surface lets the seed's warm clay tone read as the entire brand voice, paired with a deeper umber accent for hierarchy without competing with the primary's warmth." },
  { id: "seed-168", oklch: [0.400, 0.103, 50.0],
    mood: "Aesop apothecary bottle — amber glass on a clinical white shelf, considered and pharmaceutical",
    strategy: "Pure white surface lets the deep amber primary act like tinted glass against a clean shelf; accent is a muted clay that complements without competing, keeping the brand quiet and product-led." },
  { id: "seed-044", oklch: [0.568, 0.149, 45.9],
    mood: "1970s desert highway at golden hour — sun-faded terracotta, denim dust, the warmth of a Polaroid pulled from a glovebox",
    strategy: "Seed becomes a burnt-sienna primary against pure white so the terracotta does all the emotional work; a deep indigo accent acts as the denim shadow opposing the sun, creating the era's signature warm/cool tension without tinting the page." },
  { id: "seed-045", oklch: [0.607, 0.163, 47.7],
    mood: "Aesop apothecary shelf — considered amber glass, clinical restraint, craft pharmacy",
    strategy: "Pure white bg lets the burnt-amber primary do the apothecary work alone, paired with a deeper umber accent and graphite ink for editorial calm." },
  { id: "seed-046", oklch: [0.653, 0.175, 45.0],
    mood: "Aesop apothecary shelf — considered amber glass, quiet luxury, restrained craft",
    strategy: "Pure black backdrop lets the warm amber primary glow like backlit apothecary glass, with a deeper rust accent providing tonal depth in the same hue family — monochromatic warm against neutral void." },
  { id: "seed-047", oklch: [0.695, 0.205, 43.2],
    mood: "Aesop apothecary label — sun-warmed amber glass on a clinical countertop, restrained botanical pharmacy",
    strategy: "Pure white surface lets the burnt-amber primary and a deeper sienna accent do all the brand work, like an apothecary bottle photographed under daylight." },
  { id: "seed-051", oklch: [0.704, 0.189, 49.0],
    mood: "blacksmith's forge at dusk — glowing iron, hammered copper, ember light against cooling steel",
    strategy: "Pure near-black surface lets the seed's molten orange burn like heated metal; accent shifts to a deeper amber-red to suggest the cooling end of the same iron, while ink stays a clean off-white so type reads like chalk on slate." },
  { id: "seed-171", oklch: [0.550, 0.124, 60.0],
    mood: "Klim Type Foundry specimen page — considered ochre on paper, design-school-honest",
    strategy: "Seed becomes a muted ochre primary on pure white; accent is a deep ink-navy pulled across the wheel for editorial contrast without warmth-pooling in the bg" },
  { id: "seed-148", oklch: [0.650, 0.146, 60.0],
    mood: "Klim-style editorial gold — late-afternoon paper light on a serif specimen sheet, considered and dry",
    strategy: "Hold the seed's amber as primary on a pure white page so the gold reads as ink rather than atmosphere, and pair with a deep aubergine accent for typographic contrast." },
  { id: "seed-052", oklch: [0.700, 0.130, 60.0],
    mood: "late-afternoon terracotta studio — sun-warmed clay, hands-on craft, the hour before dusk",
    strategy: "Seed is a saturated amber-ochre with strong environmental association (ceramics, adobe, sunlit plaster), so I lean into Exception (a) with a faintly warm bone surface that reads as lime-washed wall, then deepen the seed slightly for primary and pair it with a fired-clay rust accent for hand-thrown warmth." },
  { id: "seed-053", oklch: [0.773, 0.157, 56.6],
    mood: "late-summer apricot orchard at golden hour — sun-warmed fruit, considered Californian craft",
    strategy: "Seed is a juicy mid-warm orange at daylight luminance — leaning optimistic/editorial, so pure white surface lets the apricot primary glow without muddying it; a deep wine accent provides the bite." },
  { id: "seed-149", oklch: [0.600, 0.124, 70.0],
    mood: "1970s desert highway — late-afternoon amber light on chrome and asphalt",
    strategy: "Anchor the amber seed as primary against pure black so the warm hue reads as headlight glow against night; a cooler dusk-mauve accent provides the complementary tension of horizon vs. sun." },
  { id: "seed-054", oklch: [0.740, 0.162, 68.1],
    mood: "late-afternoon honey on terracotta — Mediterranean stucco at golden hour, sun-baked amber",
    strategy: "Seed is a saturated honey-amber at high lightness; pairing it with pure black lets the warmth read as luminous gold against gravity, like lamplight in a dark room." },
  { id: "seed-055", oklch: [0.774, 0.174, 65.1],
    mood: "late-summer honey hour — amber light slanting through a west-facing window, optimistic and golden",
    strategy: "Anchor a saturated honey-amber primary on pure white so the warmth radiates from the brand itself, then pair with a deep teak accent for grounded contrast rather than tinting the canvas." },
  { id: "seed-056", oklch: [0.691, 0.146, 74.6],
    mood: "Klim-style modern publishing house — late-afternoon paper warmth, considered editorial gold",
    strategy: "Pure white surface so the amber seed becomes the brand voice; ink stays near-black neutral and accent shifts to a deep ink-blue to give the gold something structural to lean on." },
  { id: "seed-150", oklch: [0.750, 0.148, 80.0],
    mood: "Klim Type Foundry specimen page — late-summer editorial gold, considered and grown-up",
    strategy: "Pure white surface lets a single restrained ochre primary do all the brand work, paired with a deep ink-blue accent for typographic contrast in the Klim/Commercial Type tradition." },
  { id: "seed-058", oklch: [0.764, 0.120, 77.1],
    mood: "Klim Type Foundry specimen page — late-afternoon ochre, considered editorial typography",
    strategy: "Pure white surface lets the ochre primary do the brand work, paired with a deep ink-blue accent for editorial contrast — the type-foundry move where one warm hue carries the whole feeling against neutral paper." },
  { id: "seed-059", oklch: [0.784, 0.144, 79.8],
    mood: "late afternoon in a Tuscan limonaia — sun-cured amber on whitewashed plaster",
    strategy: "Pure white surface lets the saffron-amber primary and a deep olive accent carry the Mediterranean warmth, with split-complementary tension between gold and a quiet evergreen." },
  { id: "seed-061", oklch: [0.817, 0.161, 75.1],
    mood: "late-afternoon honey on Tuscan limestone — golden hour, slow and luminous",
    strategy: "Pure white surface lets the amber primary glow like sunlight on a wall, paired with a deep terracotta accent for warm tonal contrast within the same hue family." },
  { id: "seed-063", oklch: [0.842, 0.165, 91.3],
    mood: "late-afternoon Tuscan sun on limestone — golden hour, considered, optimistic",
    strategy: "Pure white surface lets the amber-gold primary radiate as the mood-carrier, with a deep aubergine accent providing the long shadow that golden light needs to feel three-dimensional." },
  { id: "seed-174", oklch: [0.350, 0.075, 110.0],
    mood: "olive grove at late afternoon — sun-cured leaves, dust, and quiet Mediterranean weight",
    strategy: "Pure white surface lets a deep, sun-cured olive primary do the emotional work, with a burnt-terracotta accent providing the warm-earth counterpoint olive groves are known for." },
  { id: "seed-117", oklch: [0.650, 0.100, 110.0],
    mood: "Klim-style editorial sage — late-summer foundry catalogue, considered olive-yellow on paper",
    strategy: "Seed sits at olive-chartreuse; treating it as a quiet typographic primary on pure paper, with a deeper bronze-olive accent for hierarchy — the color does the work, the page disappears." },
  { id: "seed-118", oklch: [0.750, 0.090, 110.0],
    mood: "Klim Type Foundry specimen page — late-summer olive light on a working specimen, the honesty of a type designer showing their work",
    strategy: "Pure white bg lets a desaturated olive-yellow primary do the editorial work, with a deeper olive-bronze accent providing typographic emphasis the way a specimen uses one heavy weight against the body roman." },
  { id: "seed-065", oklch: [0.797, 0.166, 113.1],
    mood: "late-summer olive grove at noon — sun-bleached leaves, dry stone, Mediterranean glare",
    strategy: "Hold the seed as a luminous chartreuse-olive primary against pure white so the color reads as sunlit foliage, pairing it with a deep umber accent for the dry-stone contrast." },
  { id: "seed-176", oklch: [0.300, 0.071, 120.0],
    mood: "moss-darkened apothecary jar — herbal, shadowed, mid-19th-century botanical study",
    strategy: "Seed is a deep desaturated olive-green that reads as preserved botanical pigment; I anchor it on pure white so the dim moss-green primary feels like ink on a herbarium page, with a warm ochre accent supplying the aged-paper counterpoint." },
  { id: "seed-155", oklch: [0.550, 0.142, 130.0],
    mood: "moss-bed forest floor at noon — chlorophyll, lichen, sunlit fern",
    strategy: "Seed is a confident mid-olive green with strong chroma; mood is daylight botanical, so I let the brand greens do the work on a pure paper-white bg and pair with a warm umber accent for fern-against-bark contrast." },
  { id: "seed-119", oklch: [0.600, 0.154, 130.0],
    mood: "moss garden at Saihō-ji — damp stone, filtered green light through old cedar",
    strategy: "Pure near-black bg lets the seed's mossy green glow like wet lichen under low light; accent shifts to a pale ochre-gold like sun catching through canopy." },
  { id: "seed-179", oklch: [0.300, 0.096, 140.0],
    mood: "moss on wet stone — forest floor at dusk, deep botanical hush",
    strategy: "Kept the seed's deep moss green as primary against a near-black surface so the green reads as living shadow, with a pale lichen accent providing the single point of light." },
  { id: "seed-180", oklch: [0.350, 0.110, 140.0],
    mood: "moss-darkened apothecary — herbal tinctures in amber glass, pressed botanicals, the deep green of a conservatory at dusk",
    strategy: "Near-black bg with a whisper of green undertone lets the seed's deep moss read as luminous foliage; a warm parchment accent provides the apothecary-label counterpoint without breaking the herbal register." },
  { id: "seed-120", oklch: [0.650, 0.100, 140.0],
    mood: "moss on weathered stone — quiet botanical garden conservatory at midday",
    strategy: "Pure white bg lets the muted sage-green primary read as a considered botanical mark, with a deeper terracotta accent providing earthen counterpoint without breaking the gallery-like restraint." },
  { id: "seed-121", oklch: [0.750, 0.090, 140.0],
    mood: "moss garden at Saihō-ji — diffuse green light filtered through wet stone and lichen",
    strategy: "Pure near-black bg lets the muted sage-green primary glow like lichen under low light; a warm pale-bone accent acts as the single ray of sun cutting through canopy." },
  { id: "seed-182", oklch: [0.400, 0.106, 150.0],
    mood: "moss garden at Saiho-ji — deep cultivated green under wet stone shadow, contemplative and damp",
    strategy: "Near-black bg with the faintest cool-green undertone evokes shaded stone; primary holds the seed's moss tone while accent shifts to a lichen-yellow for organic counterpoint without breaking the hush." },
  { id: "seed-157", oklch: [0.550, 0.145, 150.0],
    mood: "moss garden at Saiho-ji — damp stone, filtered green light through cedar canopy",
    strategy: "Near-black bg with a faint green undertone evokes deep forest shadow; primary holds the seed's verdant register while accent shifts to a pale lichen-cream to mimic light catching moss." },
  { id: "seed-122", oklch: [0.600, 0.158, 150.0],
    mood: "forest floor at first light — moss, lichen, and clean morning air",
    strategy: "Seed reads as a living, daylight green; surface stays pure white so the green carries the freshness, with a cool teal accent pulling it toward dew rather than earth." },
  { id: "seed-195", oklch: [0.650, 0.150, 145.0],
    mood: "Considered horticulture brand — botanical research lab, the green of a healthy stem photographed in clean daylight",
    strategy: "Pure white surface lets the seed's vegetal green carry the entire brand voice, paired with a deep forest ink and a warm clay accent for editorial contrast." },
  { id: "seed-183", oklch: [0.350, 0.077, 160.0],
    mood: "moss-stained apothecary — deep forest glass, herbal tinctures shelved in low candlelight",
    strategy: "Anchored the seed as primary and built a near-black dark surface with whisper-tinted green to evoke aged apothecary glass, letting the green glow rather than shout." },
  { id: "seed-184", oklch: [0.400, 0.087, 160.0],
    mood: "deep forest apothecary — moss, bottle glass, and herbal tincture under afternoon light",
    strategy: "Seed becomes a botanical-bottle-green primary on pure white, paired with a warm clove-amber accent to evoke herbal pharmacy contrast without tinting the surface." },
  { id: "seed-158", oklch: [0.550, 0.119, 160.0],
    mood: "moss on wet stone — forest floor after rain, mineral and quiet",
    strategy: "Pure white surface lets the deep mossy green carry the entire mood; accent shifts to a damp slate-teal to sit beside primary like lichen on stone without competing." },
  { id: "seed-159", oklch: [0.600, 0.130, 160.0],
    mood: "moss-covered forest apothecary — herbal tinctures in amber glass, eucalyptus shadow",
    strategy: "Anchored the green seed in a near-black backdrop so it reads like botanical glassware lit from within, with a warm amber accent pulled across the wheel to evoke tincture bottles against dark wood." },
  { id: "seed-185", oklch: [0.450, 0.086, 170.0],
    mood: "weathered copper patina on a Pacific Northwest greenhouse — oxidized teal, glass light, botanical hush",
    strategy: "Seed sits as a deep oxidized-teal primary against pure white so the patina reads as pigment, not atmosphere; a rust-copper accent completes the verdigris/oxidation story across the warm-cool axis." },
  { id: "seed-124", oklch: [0.750, 0.080, 170.0],
    mood: "sea-glass on a foggy Pacific shoreline — weathered, mineral, quietly oxidized",
    strategy: "Seed is a soft desaturated teal-green; pairing it on pure white lets the mineral primary read as patinated copper-glass, with a deeper kelp-toned primary and a rusted coral accent to spark the muted teal against its complement." },
  { id: "seed-160", oklch: [0.550, 0.095, 180.0],
    mood: "weathered copper patina on a museum bronze — oxidized teal, conservatorial quiet",
    strategy: "Pure near-black gallery surround lets the patina-teal primary glow like a lit artifact, with a warm verdigris-adjacent accent providing the oxidation contrast against the cool seed." },
  { id: "seed-161", oklch: [0.720, 0.100, 188.0],
    mood: "climate-tech dashboard — calm verdigris on plain paper, the quiet confidence of an instrument that just works",
    strategy: "Seed teal carries the entire mood as a single considered brand color on pure white, with a desaturated copper accent providing warm signal against the cool primary without competing for attention." },
  { id: "seed-186", oklch: [0.450, 0.074, 200.0],
    mood: "deep hydrothermal vent — mineral teal under pressure, the cold blue-green of oxidized copper in submerged light",
    strategy: "Near-black surface lets the mineral teal glow as if lit from within; accent shifts toward verdigris-copper to suggest patina on submerged metal, while ink stays cool-neutral to keep the register austere rather than aquatic-cute." },
  { id: "seed-125", oklch: [0.650, 0.100, 200.0],
    mood: "climate-tech dashboard — calm operational teal, the color of clean water data and atmospheric sensors",
    strategy: "Pure white surface lets a single muted-teal primary do all the brand work, with a deeper marine accent providing hierarchy without competing chroma." },
  { id: "seed-126", oklch: [0.750, 0.080, 200.0],
    mood: "climate-tech product brand — quiet competence, dashboards for hard infrastructure problems",
    strategy: "Hold the seed's muted teal as primary, pair with a sharper cyan-leaning accent for interactive lift, and let a pure white surface do the disappearing act so the brand reads as a tool, not an atmosphere." },
  { id: "seed-162", oklch: [0.550, 0.091, 210.0],
    mood: "weathered nautical instrument — patinated brass on oxidized steel, the cool blue-grey of a ship's chronometer at dawn",
    strategy: "Pure white surface lets the muted teal-steel primary read as a precise instrument mark, with a warm brass accent providing the single point of patina against clinical white." },
  { id: "seed-163", oklch: [0.450, 0.086, 230.0],
    mood: "deep harbor at dusk — weathered nautical instruments, brass dials on oxidized steel",
    strategy: "Near-black background with subtle cool tint evokes the marine dusk; primary holds the seed's teal-blue while a warm brass accent creates the instrument-on-steel tension." },
  { id: "seed-164", oklch: [0.550, 0.105, 230.0],
    mood: "deep harbor at dawn — cold steel water, fog-muted light, the quiet before the boats leave",
    strategy: "Pure near-black bg lets the seed's cold marine blue read as a luminous beacon, while a pale frost-cyan accent evokes diffused dawn light cutting through fog." },
  { id: "seed-127", oklch: [0.650, 0.100, 230.0],
    mood: "climate-tech dashboard — atmospheric sensor blue, calm operational clarity",
    strategy: "Anchor the seed as a confident mid-blue primary on pure white so the brand color carries all the atmospheric feeling, with a deep navy accent for hierarchy and a soft slate muted for body text." },
  { id: "seed-128", oklch: [0.750, 0.080, 230.0],
    mood: "climate-tech dashboard — calm atmospheric data, considered sky-blue",
    strategy: "Pure white surface lets the muted sky-blue primary carry the meteorological calm, with a deep-navy accent providing readable weight against the soft primary." },
  { id: "seed-187", oklch: [0.350, 0.078, 240.0],
    mood: "deep harbor at blue hour — wet stone, cold steel, the quiet before night fully lands",
    strategy: "Near-black architectural bg with a hint of marine chroma lets the seed read as ambient atmosphere rather than UI chrome; a cooler steel accent sits opposite the warmer-shifted primary for navigational clarity." },
  { id: "seed-077", oklch: [0.578, 0.130, 241.7],
    mood: "pre-dawn signal tower — cold blue solitude, instruments glowing against the dark",
    strategy: "Pure near-black bg lets the seed's cold tower-light blue glow as the sole emotional source, with a frost-cyan accent acting as a secondary indicator light." },
  { id: "seed-188", oklch: [0.400, 0.110, 250.0],
    mood: "Linear's considered indigo — the calm authority of a well-built developer tool, blueprint ink on a clean page",
    strategy: "Held the seed as a deep indigo primary against pure white so the brand color carries all the gravity; accent shifts to a cooler, brighter cyan-blue to create a crisp hierarchy pair without warming the surface." },
  { id: "seed-165", oklch: [0.450, 0.123, 250.0],
    mood: "blueprint room at dusk — drafting table, graphite, civic-engineering blue",
    strategy: "Seed is a mid-deep architectural blue with real chroma and no environmental cue, so I stay out of the way with a pure white surface and let the primary do all the talking, pairing it with a burnt-ochre accent for drafting-pencil contrast." },
  { id: "seed-079", oklch: [0.478, 0.136, 251.8],
    mood: "twilight cartography — the blue of deep dusk over open water, precise and navigational",
    strategy: "Pure white surface lets the seed's oceanic blue act as a single navigational anchor, with a warm amber accent struck across it like a lighthouse beam at dusk." },
  { id: "seed-080", oklch: [0.541, 0.122, 248.2],
    mood: "Linear-style considered tool blue — the calm, exact register of a modern engineering app where every pixel is intentional",
    strategy: "Pure white surface lets the considered indigo-blue primary carry the entire brand; a deeper navy accent provides hierarchy without warmth, keeping the palette in a single cool family for that focused-software feel" },
  { id: "seed-166", oklch: [0.550, 0.149, 250.0],
    mood: "pre-dawn flight deck — instrument glow against deep cobalt sky, precise and quietly intense",
    strategy: "Near-black bg with the faintest cool tint reads like a darkened cockpit; the seed becomes a luminous instrument-blue primary, paired with a warm amber accent that mimics avionics readouts for unmistakable signal contrast." },
  { id: "seed-081", oklch: [0.650, 0.160, 250.0],
    mood: "deep-sea research vessel at dawn — instrument glow against cold steel light",
    strategy: "Pure near-white bg keeps the palette technical and instrument-like; the seed blue holds as primary while a desaturated steel-cyan accent reads like signal readouts on glass." },
  { id: "seed-082", oklch: [0.742, 0.140, 247.4],
    mood: "high-altitude flight deck at dawn — cold cabin instruments glowing against a sky still holding night",
    strategy: "Near-black cockpit ground with a faint blue cast lets the seed read as an illuminated instrument; primary holds the seed, accent shifts to cyan for signal/indicator contrast." },
  { id: "seed-210", oklch: [0.360, 0.140, 260.0],
    mood: "Linear-style considered tool indigo — late-night focused work, the deep blue of a code editor at 2am where everything else falls away",
    strategy: "Pure black bg lets the indigo primary carry all the cognitive-focus weight, with a slightly brighter periwinkle accent for interactive lift — the surface disappears so the tool feels weightless." },
  { id: "seed-189", oklch: [0.400, 0.130, 260.0],
    mood: "pre-dawn observatory — cold instrument blue, star-chart precision",
    strategy: "Seed becomes the primary on pure black so the deep instrument-blue glows like a calibration light, with a faint cyan accent reading as starlight against the void." },
  { id: "seed-211", oklch: [0.420, 0.161, 260.0],
    mood: "Linear's considered indigo — the tool-for-thought blue of focused product work, calm authority without coldness",
    strategy: "Hold the seed as a deep indigo primary against pure white, then pair with a slightly warmer, lighter periwinkle accent to create gentle hue separation without breaking the disciplined tool-brand register." },
  { id: "seed-129", oklch: [0.450, 0.150, 260.0],
    mood: "pre-dawn observatory — deep cobalt sky just before astronomical twilight, instruments cool to the touch",
    strategy: "Near-black surface lets the cobalt seed read as luminous starlight; a single warm amber accent acts as the calibration lamp against the cold blue field." },
  { id: "seed-084", oklch: [0.476, 0.207, 261.2],
    mood: "pre-dawn flight deck — instrument glow against deep cobalt sky, precise and awake",
    strategy: "Default B black bg lets the cobalt primary read as a luminous instrument signal, with a cyan accent striking the analogous 'cockpit display' relationship." },
  { id: "seed-085", oklch: [0.681, 0.132, 258.4],
    mood: "pre-dawn flight deck — instrument glow against deep cobalt sky",
    strategy: "Anchored the seed as a luminous primary against a near-black architectural ground, with a warm amber accent acting as the single instrument light cutting through cold blue." },
  { id: "seed-086", oklch: [0.767, 0.106, 255.9],
    mood: "Scandinavian winter morning — quiet light through frost, pale sky over snow",
    strategy: "Anchored a pure white editorial stage so the seed's cool sky-blue reads as crisp polar light, with a deeper navy primary providing the only saturated weight — like a single dark pine against snow." },
  { id: "seed-083", oklch: [0.340, 0.159, 262.4],
    mood: "deep cobalt twilight — the moment after sunset when the sky goes electric blue and city windows start to glow",
    strategy: "Pure black stage lets the cobalt seed act as a luminous neon-window glow, with a warm amber accent across the wheel for the lit-window contrast." },
  { id: "seed-212", oklch: [0.360, 0.219, 270.0],
    mood: "Linear-grade tooling indigo — considered software for people who care about craft",
    strategy: "Anchored the deep indigo seed as primary on a pure white surface so the brand color carries all the weight, with a slightly cooler violet-blue accent for hierarchy without competing chroma." },
  { id: "seed-130", oklch: [0.400, 0.150, 270.0],
    mood: "Linear-grade indigo — considered productivity tool, ink on paper, no theatrics",
    strategy: "Pure white surface lets a deep cool indigo carry all the brand weight, paired with a slightly warmer violet-blue accent for hierarchy without acid." },
  { id: "seed-213", oklch: [0.411, 0.241, 267.9],
    mood: "Linear-style indigo — considered tool surface, the kind of blue-violet that sits behind a developer's keyboard at 11pm without shouting",
    strategy: "Pure black canvas lets a saturated indigo primary do all the brand work, with a cooler cyan-violet accent providing UI signal without competing." },
  { id: "seed-131", oklch: [0.450, 0.180, 270.0],
    mood: "monastic indigo dusk — vespers light through stained glass, contemplative and severe",
    strategy: "Seed becomes a deep indigo primary against pure near-black so the violet reads as luminous stained-glass against architectural shadow, with a cooler iris accent for tonal lift." },
  { id: "seed-088", oklch: [0.476, 0.158, 268.5],
    mood: "pre-dawn astronomer's notebook — deep indigo sky just before the stars fade, ink and graphite",
    strategy: "Near-black bg with the faintest cool tint to evoke night sky without theatrics; primary holds the seed's indigo, accent shifts to a paler periwinkle for stellar contrast, keeping the palette monochromatic-cool and observational." },
  { id: "seed-196", oklch: [0.530, 0.130, 268.0],
    mood: "Linear-style considered tool indigo — the deep-focus blue-violet of a thoughtfully built productivity surface, the color of a well-typeset keyboard shortcut",
    strategy: "Pure white bg lets the indigo seed do all the brand work as primary, with a slightly darker, more saturated violet-shifted accent for hierarchy and interactive states — the surface disappears so the brand color reads as the entire identity." },
  { id: "seed-132", oklch: [0.700, 0.120, 270.0],
    mood: "Linear-style considered tool indigo — the quiet violet of a focused product workspace, late-afternoon thinking",
    strategy: "Pure white surface lets a muted indigo-violet primary and a slightly cooler accent do all the brand work, keeping the register calm and software-like rather than theatrical." },
  { id: "seed-090", oklch: [0.445, 0.206, 279.1],
    mood: "Linear-style considered tool indigo — the violet of a focused product surface, not a nightclub",
    strategy: "Anchor the seed as a confident product primary on pure white, with a cooler indigo-shift accent that reads as a sibling tool color, so the brand violet does all the emotional work." },
  { id: "seed-133", oklch: [0.500, 0.160, 280.0],
    mood: "Linear-adjacent indigo — considered productivity tool, the violet of a thinking workspace",
    strategy: "Seed becomes a measured indigo primary on pure white; accent shifts to a cooler blue-violet to create hierarchy without nightclub saturation, letting the brand color do all the emotional work." },
  { id: "seed-094", oklch: [0.533, 0.125, 294.3],
    mood: "Linear-style considered tool indigo — the violet of a focused product surface, calm authority for a creative workspace",
    strategy: "Pure white canvas lets the indigo-violet primary carry the entire brand voice; accent shifts hue slightly toward blue for a cool, tool-like duotone rather than warm decorative pairing." },
  { id: "seed-137", oklch: [0.700, 0.120, 290.0],
    mood: "Linear-adjacent indigo — the considered tool, late-evening focus mode, software made for people who care about craft",
    strategy: "Pure black surface lets a single restrained indigo-violet carry the brand, with a cooler periwinkle accent providing UI hierarchy without competing — Vercel/Linear dark-mode discipline." },
  { id: "seed-100", oklch: [0.450, 0.150, 330.0],
    mood: "velvet boudoir at last call — bruised orchid and lipstick traces under low lamplight",
    strategy: "Pure near-black surface lets a deep magenta-rose primary smolder while a warm peach accent acts like skin-lit lamplight — drama lives in the brand pair, not the room." },
  { id: "seed-103", oklch: [0.650, 0.160, 330.0],
    mood: "1980s Memphis boudoir — powder-pink neon humming against lacquered black, lipstick and lacquer",
    strategy: "Near-black gallery surface lets the magenta-pink seed read as lit neon; accent shifts to warm coral to create cinematic dichromatic tension without competing chroma." },
  { id: "seed-228", oklch: [0.360, 0.147, 340.0],
    mood: "Figma-era creative tool plum — considered productivity software for designers, the inky violet of a serif wordmark on a marketing site",
    strategy: "Held the seed as a deep plum primary against pure white so the brand color does the emotional work; paired with a muted rose accent for warmth without breaking the productivity-tool restraint." },
  { id: "seed-107", oklch: [0.500, 0.200, 340.0],
    mood: "Figma plum — creative-tool confidence, considered magenta for a modern design product",
    strategy: "Pure white surface lets a saturated magenta-plum primary carry all the brand voice, paired with a cooler violet-leaning accent for hierarchy without competing." },
  { id: "seed-198", oklch: [0.600, 0.210, 340.0],
    mood: "Figma-era creative tool plum — confident, considered, made for makers",
    strategy: "Anchor a saturated plum primary against pure white so the brand color does all the emotional work, with a deeper magenta-rose accent for hierarchy." },
  { id: "seed-112", oklch: [0.754, 0.193, 343.4],
    mood: "Figma-era creative tool — confident pink primary doing the brand work on a clean canvas, the way Linear uses indigo or Stripe uses violet",
    strategy: "Anchor the seed pink as a saturated brand primary on pure white so the color carries all the personality; pair with a cooler plum accent to give the pink something to push against without competing." },
  { id: "seed-229", oklch: [0.420, 0.163, 350.0],
    mood: "considered fintech rose — the deep magenta of a modern product brand (think Stripe-adjacent, but rotated toward berry), confident and current",
    strategy: "pure white surface lets a single deep berry-rose primary do all the brand work, paired with a cooler indigo accent for the contrast move you see in modern product marketing" },
  { id: "seed-113", oklch: [0.470, 0.173, 354.8],
    mood: "1960s velvet rope nightclub — crushed magenta, low light, cigarette smoke catching a spotlight",
    strategy: "Pure black stage so the seed's smoky magenta reads as a single hot spotlight, paired with a cooler violet accent for the second light cue." },
  { id: "seed-114", oklch: [0.570, 0.158, 353.3],
    mood: "fin-de-siècle Parisian rose — velvet curtain, theatre program, lipstick blotted on linen",
    strategy: "Drop bg to true black so the dusty-rose primary reads as stage-lit silk; accent shifts to a warmer coral-mauve at higher lightness to create gentle hue rotation without breaking the romance." },
  { id: "seed-199", oklch: [0.650, 0.180, 350.0],
    mood: "modern fintech rose — the considered pink of a Series B brand mark, confident and current without nostalgia",
    strategy: "Pure white surface lets a saturated rose primary do the brand work, paired with a deep plum accent for hierarchy — the Stripe move applied to a pink hue." },
  { id: "seed-115", oklch: [0.636, 0.218, 355.3],
    mood: "backstage at a cabaret — velvet rope, lipstick mark on a champagne glass",
    strategy: "Seed reads as a saturated stage-light magenta-red; I push it into pure black so the primary glows like a neon sign and the accent (a cold pearl-pink) acts as the spotlight rim — the room is dark, the color does the singing." },
  { id: "seed-230", oklch: [0.650, 0.249, 354.5],
    mood: "Modern fintech rose — the considered pink of a contemporary payments brand: confident, alive, and clear-headed",
    strategy: "Pure white bg lets a saturated rose-magenta primary carry all the brand energy, paired with a cooler indigo accent for trustworthy contrast — the Stripe move applied to a pink hue." },
  { id: "seed-231", oklch: [0.682, 0.241, 353.2],
    mood: "Figma-era creative tool — a confident pink-magenta product brand, the kind a modern design platform uses to feel alive without shouting",
    strategy: "Default A pure white bg lets the saturated pink-magenta primary do all the brand work, with a near-complementary cool teal accent for tool-like clarity and a neutral ink for editorial calm" },
  { id: "seed-116", oklch: [0.734, 0.183, 356.8],
    mood: "modern beauty brand DTC — Glossier-adjacent pink, confident and current without being saccharine",
    strategy: "Pure white surface so the rose-pink primary carries all the brand warmth, paired with a near-black ink and a desaturated mauve accent for editorial restraint." },
];

function parseArgs(argv) {
  const args = { id: null, from: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--id' && argv[i + 1]) { args.id = argv[++i]; }
    else if (a === '--from' && argv[i + 1]) { args.from = argv[++i]; }
  }
  return args;
}

// Hash a key into a stable float in [0, 1) for deterministic weighted picks.
function hashUnit(key) {
  const h = crypto.createHash('sha256').update(key).digest();
  return h.readUInt32BE(0) / 0x100000000;
}

// The curated library is hue-skewed (more reds/oranges than teals/magentas)
// because that's where the source material + taste landed. Left uniform, a
// random pick would land on red ~1/3 of the time. Inverse-frequency weighting
// gives each seed a weight of 1/(count in its 30° hue bucket), so each hue
// ZONE is roughly equally likely to be chosen regardless of how many seeds it
// holds — fair rainbow exposure across runs without pruning the library.
function buildWeights(seeds) {
  const bucketCount = {};
  const bucketOf = (s) => Math.floor(((s.oklch[2] % 360) + 360) % 360 / 30);
  for (const s of seeds) { const b = bucketOf(s); bucketCount[b] = (bucketCount[b] || 0) + 1; }
  const weights = seeds.map((s) => 1 / bucketCount[bucketOf(s)]);
  const total = weights.reduce((a, b) => a + b, 0);
  return { weights, total };
}

function weightedPick(seeds, unit) {
  const { weights, total } = buildWeights(seeds);
  let target = unit * total;
  for (let i = 0; i < seeds.length; i++) {
    target -= weights[i];
    if (target < 0) return seeds[i];
  }
  return seeds[seeds.length - 1];
}

function pickSeed(seeds, { id, from }) {
  if (id) {
    const found = seeds.find(s => s.id === id);
    if (!found) { console.error(`no seed with id "${id}"`); process.exit(2); }
    return found;
  }
  const envFrom = process.env.IMPECCABLE_PALETTE_SEED;
  const key = from || envFrom;
  const unit = key ? hashUnit(key) : Math.random();
  return weightedPick(seeds, unit);
}

function fmtOklch([L, C, H]) {
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
}

function hueWord(H) {
  if (H < 15 || H >= 345) return 'pure red';
  if (H < 35)  return 'warm red / crimson';
  if (H < 55)  return 'warm coral / burnt orange';
  if (H < 80)  return 'orange / honey';
  if (H < 105) return 'warm amber / honey-gold';
  if (H < 135) return 'yellow-green / olive';
  if (H < 170) return 'green';
  if (H < 200) return 'teal';
  if (H < 230) return 'sky blue';
  if (H < 265) return 'cobalt / indigo';
  if (H < 295) return 'violet / purple';
  if (H < 330) return 'magenta / pink';
  return 'deep pink / rose';
}

// ---------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const seed = pickSeed(SEEDS, args);
const [L, C, H] = seed.oklch;

// The mood + strategy on each seed were derived by the model that
// originally judged it. We surface them as *hints*, not commands —
// the brief should still drive what the seed becomes.
const moodHint = seed.mood ? ` (one read: "${seed.mood}")` : '';
const strategyHint = seed.strategy ? `\n  - one example strategy: ${seed.strategy}` : '';

// ---------------------------------------------------------------
// Fat tool-exit response — what the model sees on stdout.
// ---------------------------------------------------------------

process.stdout.write(`BRAND SEED · ${seed.id}

Seed color (anchor for your primary brand color):
  ${fmtOklch(seed.oklch)} — ${hueWord(H)}${moodHint}

This is the brand's anchor — a single beautiful color. Compose the rest of
the palette around it using YOUR judgment, the brief (PRODUCT.md /
DESIGN.md / the user's prompt), and the color-strategy guidance already in
SKILL.md.

How to use:

1. Read the brief. Write one specific phrase describing the mood this
   product calls for. Be granular. Good: "1970s travel poster — sun-baked
   warmth, considered", "midnight jazz club — smoky brass, saxophone
   light", "Scandinavian winter morning — quiet light through frost". Bad:
   "modern and clean", "warm and inviting". The first lets you compose; the
   second is generic and will produce generic palettes.

2. The seed's hue (${H.toFixed(0)}°) anchors your primary brand color. You
   choose L and C to match the mood. The same hue can be deep-and-velvet,
   bright-and-confident, or pale-and-faded — pick the one the mood demands.
   Primary's hue should stay within ±10° of the seed.${strategyHint}

3. Now compose the full palette in OKLCH (5 more roles):
     • bg       — the most important architectural choice.
                  CORE PRINCIPLE: the mood lives in the BRAND COLORS
                  (primary + accent) and typography, NOT in the surface.
                  Stripe is warm — its purple does that, bg is pure
                  white. Linear is cool — its blue does that, bg is
                  pure. Notion is warm — its accents do that, bg is
                  near-pure-white. Putting warmth in BOTH primary AND
                  bg is the AI cliché.

                  DEFAULT A — PURE white: exactly oklch(1.000 0.000 0).
                    Not 0.99, not chroma 0.002. Stripe / Notion / Apple
                    use literal #ffffff. Don't add hidden warmth.
                    Refs: Stripe, Notion, Linear (light), Apple.com,
                    Vercel docs, Figma marketing, Loom, Substack.

                  DEFAULT B — PURE black/near-black: L 0.04-0.12,
                    chroma exactly 0.000. No hue tint. Vercel is
                    roughly oklch(0.08 0 0). Pick L for mood; C is 0.
                    Refs: Vercel, A24, Acne, Apple dark, MUBI.

                  ALT 2 — TINTED: chroma 0.015-0.05.
                    Use ONLY when:
                    (a) the mood is EXPLICITLY environmental — the surface
                        IS part of the brand (1920s lacquered interior,
                        leather library, ceramic studio, hotel lobby), or
                    (b) the seed itself is desaturated (chroma < 0.10) and
                        needs a tinted surface to read as a brand.
                    NOT for "feels warm" / "modern + warm" / "moody". If
                    your mood says "warm" but doesn't name a specific
                    environment, use PURE white and let primary carry
                    the warmth.

                  HEURISTIC: if seed chroma > 0.10 AND mood is product-
                  focused (not environment-focused), it's almost always
                  PURE white. Target distribution across many palettes:
                  ~50% pure white, ~25% pure black, ~25% tinted.
     • surface  — bg pulled slightly toward ink (10-15% mix). Same hue
                  family as bg. Used for cards, panels, sections.
     • ink      — body text color. Must reach ≥7:1 contrast vs bg.
                  Can carry the brand hue at low chroma in light mode
                  (slight warmth or coolness toward the brand).
     • accent   — a SECOND brand color, distinct from primary in BOTH
                  hue AND lightness. Picked to complement the mood (not
                  default-complementary across the wheel). Used for
                  badges, status pills, links, accent rules.
     • muted    — secondary text. Ink pulled 40% toward bg, keeping ink's
                  hue. Must reach ≥3.5:1 contrast vs bg.

4. Pick a color STRATEGY (the four steps from SKILL.md):
     • Restrained: tinted neutrals + accent ≤10% — product default
     • Committed: one saturated color carries 30-60% — identity-driven
     • Full palette: 3-4 named roles each used deliberately — brand work
     • Drenched: the surface IS the color — campaign, hero, statement
   The brief picks the strategy. A startup dashboard ≠ a perfume brand.

Hard rules (already in SKILL.md, recapped because the seed step is where
they actually bite):

  - OKLCH only — never hex. Never #RRGGBB.
  - ink-vs-bg WCAG contrast ≥ 7 (body text must be readable)
  - primary chroma ≤ 0.23 (above this, primary glows perceptually and
    no text on it is readable — acid-bright is a UI failure)
  - if primary L > 0.78, primary chroma ≤ 0.18 (the fluorescent zone)
  - primary-vs-accent contrast ≥ 1.7 (they must be visually distinct,
    not two variants of the same hue at similar lightness)
  - accent must carry readable text on a filled badge/pill: EITHER
    saturated (chroma ≥ 0.10) OR clearly light (L ≥ 0.85) OR clearly
    dark (L ≤ 0.30). Never a muddy mid-tone (L 0.45-0.72 + chroma < 0.10)
    — taupe/mushroom/dusty-grey accents read as weak and can't hold text
    either way. Saturate it or push its lightness to a clear light/dark.
  - avoid the saturated AI attractor zones: claude-beige (warm-cream bg
    + dusty brown primary), forest-green-on-cream, AI-purple-on-white,
    navy-cream-with-orange-accent

TEXT-ON-COLOR FILLS — pick by perceptual contrast, not just WCAG. The
rule applies to ANY element where text sits on a saturated color fill:
primary buttons, accent buttons, badges, status pills, tag highlights,
filled callouts. Don't only think "primary button" — apply consistently.

For any saturated mid-luminance color (L between 0.42 and 0.78, chroma ≥
0.08), use WHITE text (or near-white from your bg), not dark text — even
if WCAG says dark technically passes. The Helmholtz-Kohlrausch effect
makes saturated colors appear brighter than their luminance suggests,
and dark text on a warm-or-cool-saturated fill reads as muddy.

Convention: Stripe orange CTAs, McDonald's red, every fintech orange
button, Vercel's filled badges, Linear's status pills — all use white
text on saturated bg fills.

Dark text is correct only on PALE fills (L > 0.85) or PURE-NEUTRAL fills
(chroma near 0). Everything else: white text.

Return your composed palette in CSS custom properties using OKLCH, then
build with it. The seed is the start, not the recipe.
`);
