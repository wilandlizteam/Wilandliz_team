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
  headline: 'Sell Your Home for Top Dollar',
  subtitle:
    "With 75+ years of combined experience, we'll help you sell faster and for top dollar. ⭐",
  addressLabel: "What's the address of the home you're thinking about selling?",
  addressPlaceholder: 'Enter your property address',
  step1Cta: 'GET STARTED',
  step2Headline: "Let's Get Your Home Sold.",
  step2Sub: 'Where should we send your home value?',
  timelineLabel: 'How soon are you looking to sell your home?',
  step2Cta: 'GET MY HOME VALUE',
  successHeadline: "You're All Set! 🏡",
  successBody:
    'Thanks for reaching out. Wil & Liz Team will be in touch shortly to discuss your home and your selling goals.',
} as const;

export const TIMELINE_OPTIONS = [
  { value: '0-3 months', label: '0–3 months' },
  { value: '3-6 months', label: '3–6 months' },
  { value: '6-12 months', label: '6–12 months' },
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
 * The dining-room photograph. Swap the same way as HERO_BACKGROUND: export at
 * 1760px and 900px wide as .webp into /public and update the paths here.
 *
 * Step 2 shows the room at its natural 3:2 proportions on phones, so choose a
 * landscape photograph — a portrait crop will letterbox.
 * ---------------------------------------------------------------------------
 */
export const PAGE2_BACKGROUND = {
  large: '/dining-room.webp',
  small: '/dining-room-sm.webp',
} as const;

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
