/**
 * ---------------------------------------------------------------------------
 * SITE CONFIGURATION
 * ---------------------------------------------------------------------------
 * Everything an editor is likely to change lives in this one file.
 * No secrets here — this file ships to the browser.
 * The Follow Up Boss API key lives only on the server (see /api/lead.ts).
 * ---------------------------------------------------------------------------
 */

/** Meta (Facebook) Pixel ID. Referenced in exactly one place: src/lib/pixel.ts */
export const META_PIXEL_ID = '1711242080023828';

/**
 * Which Meta event represents a completed lead.
 * 'Lead' is the standard event for a submitted contact form and is what the
 * Meta Ads "Leads" objective optimizes against. Change only with intent.
 */
export const META_LEAD_EVENT = 'Lead' as const;

/**
 * Server endpoint that receives the lead and forwards it to Follow Up Boss.
 * Implemented at /api/lead.ts as a serverless function.
 */
export const LEAD_ENDPOINT = '/api/lead';

/** Brand */
export const BRAND = {
  name: 'Wil & Liz Team',
  wordmark: 'WIL & LIZ',
  tagline: 'Zillow & Opendoor Premier Partners  |  ehomes',
} as const;

/** Hero copy — approved wording. Do not reword without sign-off. */
export const COPY = {
  headline: 'What Is Your Home Actually Worth Right Now?',
  subtitle: 'Not a Zestimate. A real number from a real local agent.',
  addressLabel: "What's the address of the home you're thinking about selling?",
  addressPlaceholder: 'Enter your property address',
  step1Cta: 'GET STARTED',
  step2Headline: 'Where should we send your personalized market analysis?',
  step2Sub:
    "We'll use this information to send your personalized home value and market analysis.",
  timelineLabel: 'How soon are you looking to sell your home?',
  /* Optional question — the visitor can submit without answering. */
  timelineOptionalNote: 'Optional',
  step2Cta: 'GET MY HOME VALUE',
  /* Broad, low-pressure consent line. Deliberately not about selling. */
  consent:
    'By submitting this form, you agree that Wil & Liz may contact you regarding your real estate goals.',
  successHeadline: "You're All Set! 🏡",
  successBody:
    'Thanks for reaching out. Wil & Liz Team will be in touch shortly to discuss your home and your selling goals.',
} as const;

/**
 * The timeline question is OPTIONAL — see validateContact() in
 * src/lib/validation.ts and the matching server rule in api/_lib/lead-core.ts.
 * A visitor can submit without choosing one.
 *
 * `wide: true` puts an option on its own full-width row, for labels too long to
 * sit in the three-across grid.
 */
export const TIMELINE_OPTIONS = [
  { value: '0-3 months', label: '0–3 months' },
  { value: '3-6 months', label: '3–6 months' },
  { value: '6-12 months', label: '6–12 months' },
  {
    value: 'Just curious about my home value',
    label: "I'm not interested in selling. I'm just curious about my home value.",
    wide: true,
  },
] as const;

/**
 * ---------------------------------------------------------------------------
 * HERO BACKGROUND PHOTOGRAPH
 * ---------------------------------------------------------------------------
 * Two sizes so phones don't download the desktop file. The layout lays a white
 * scrim over the photograph behind the text only — no blue tint, no filter, so
 * the photo keeps its natural colour.
 *
 * To swap the photo:
 *   1. Export a landscape image at 1536px and 860px wide, as .webp
 *   2. Drop both into /public and update the two paths below
 *   3. Update the preload links near the top of index.html to match
 *
 * Set to null for the clean white hero instead (fastest possible load).
 * ---------------------------------------------------------------------------
 */
export const HERO_BACKGROUND: { large: string; small: string } | null = {
  large: '/hero-home.webp',
  small: '/hero-home-sm.webp',
};

/**
 * ---------------------------------------------------------------------------
 * STEP 2 BACKGROUND — THE INTERIOR
 * ---------------------------------------------------------------------------
 * The dining-room photograph. Swap the same way as HERO_BACKGROUND: export a
 * large and a small .webp into /public and update the paths here. The current
 * pair is 1500px and 900px square.
 *
 * The layout crops with `cover`, so any reasonably square or landscape photo
 * works: phones show a 4:3 band of it, desktop fills the section. Keep the
 * subject near the centre — a tall portrait crop will lose most of the room.
 * ---------------------------------------------------------------------------
 */
export const PAGE2_BACKGROUND = {
  large: '/dining-room.webp',
  small: '/dining-room-sm.webp',
} as const;

/**
 * ---------------------------------------------------------------------------
 * eHOMES
 * ---------------------------------------------------------------------------
 * The Wil & Liz Team is powered by ehomes. The official logo is used exactly as
 * supplied — its own colours, its own proportions, sized by height in CSS so it
 * can never be stretched. It carries the brand's orange, which is the one
 * deliberate exception to the navy-and-white palette: it is a real partner mark,
 * not a decorative colour choice, so it is kept small and used once.
 *
 * The company name is always lowercase in text. The `.ehomes` class forces that
 * even inside uppercased styles.
 *
 * Set to null to fall back to the name set in type, with no mark.
 * ---------------------------------------------------------------------------
 */
export { default as EHOMES_LOGO } from '@/assets/logo-ehomes.png';

/**
 * ---------------------------------------------------------------------------
 * BROKERAGE / LICENSING DISCLAIMER
 * ---------------------------------------------------------------------------
 * Edit the strings below. Nothing here is auto-generated.
 * VERIFY the DRE numbers against the DRE public licence lookup before launch.
 * ---------------------------------------------------------------------------
 */
export const DISCLAIMER = {
  teamName: 'Wil & Liz Real Estate Team',
  affiliation: 'Zillow & Opendoor Premier Partners | ehomes',
  licensees: [
    { name: 'Liz Lee', dre: 'DRE 01176959' },
    { name: 'Wil Olguin', dre: 'DRE 0115760' },
  ],
  /** Add brokerage legal name + brokerage DRE number here when confirmed. */
  brokerageLine: '',
  /** Optional extra legal copy (equal housing, privacy link, etc.). */
  additional: '',
} as const;
