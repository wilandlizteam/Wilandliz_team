# Wil & Liz Team — Seller Lead Funnel

A two-step seller lead-generation site for Southern California homeowners, built
for paid traffic from Facebook and Instagram.

```
Ad click → address → contact + timeline → secure backend → Follow Up Boss → Meta Lead event → confirmation
```

---

## ⚠️ Do this first

**Rotate your Follow Up Boss API key.** The key was shared in a chat message, so
treat it as exposed: generate a new one in Follow Up Boss (Admin → API), delete
the old one, and use the new key in the environment variable below. Nothing in
this repository contains a key, and nothing should.

**Verify Wil's DRE number.** The footer currently reads `DRE 0115760` — seven
digits. California DRE licence numbers are eight (Liz's, `01176959`, is eight).
Confirm the correct number and update `DISCLAIMER` in `src/config.ts`.

---

## Running it locally

```bash
npm install
cp .env.example .env.local     # add your Follow Up Boss key
npm run dev                    # http://localhost:5173
```

`npm run dev` serves the frontend only. The form will fail at submit because
`/api/lead` is a serverless function — run `vercel dev` instead to exercise the
whole flow locally.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check, then production build to `dist/` |
| `npm run typecheck` | Types only |
| `npm run lint` | Lint `src/` and `api/` |
| `node qa/funnel.qa.mjs` | Full funnel test at three screen sizes (82 assertions) |
| `node scripts/build-preview.mjs` | Single-file `preview.html` for review/email |

---

## Deploying

### Vercel (recommended)

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project** and import it. The framework is detected as
   Vite; `vercel.json` supplies the rest.
3. **Settings → Environment Variables**, add for Production *and* Preview:

   | Name | Value |
   | --- | --- |
   | `FOLLOW_UP_BOSS_API_KEY` | your (rotated) FUB API key |
   | `FUB_LEAD_TYPE` | `Seller Inquiry` *(optional)* |
   | `FUB_ASSIGNED_TAG` | e.g. `Seller LP 2026` *(optional)* |
   | `FUB_SYSTEM` / `FUB_SYSTEM_KEY` | only if you register a FUB integration |

4. Deploy, then point your domain at it.

Environment variables are read only by the serverless function. They are never
bundled into the browser code — the QA suite asserts this on every run.

### Netlify

`netlify.toml` is included and redirects `/api/lead` to
`netlify/functions/lead.ts`. Set the same environment variables under
**Site settings → Environment variables**.

---

## How the pieces fit

```
src/
  config.ts              ← pixel ID, copy, colours-adjacent settings, disclaimer
  App.tsx                ← step state machine; the only place trackLead() is called
  components/
    StepAddress.tsx      ← step 1 hero + address
    StepContact.tsx      ← step 2 contact + timeline
    StepSuccess.tsx      ← confirmation
    Field.tsx            ← labelled input with accessible error reporting
    Chrome.tsx           ← masthead + brokerage/licence footer
  lib/
    pixel.ts             ← Meta Pixel init, PageView, deduplicated Lead
    attribution.ts       ← captures UTM / fbclid, keeps them for the session
    validation.ts        ← field rules, phone formatting (mirrored server-side)
    submitLead.ts        ← posts to /api/lead
api/
  lead.ts                ← Vercel entry point
  _lib/lead-core.ts      ← validation + Follow Up Boss call (the ONLY place the key is read)
netlify/functions/lead.ts← Netlify entry point, same core
```

### Meta Pixel

The pixel ID lives in `src/config.ts` and is referenced from one file
(`src/lib/pixel.ts`) plus the `<noscript>` fallback in `index.html`.

- `PageView` fires once when the landing page loads.
- `Lead` fires **only** after the server confirms Follow Up Boss accepted the
  lead. Not on CTA click, not on step change, not on page load.
- Duplicates are blocked three ways: an in-memory guard against double-clicks, a
  `sessionStorage` guard against refresh and back-button, and an `eventID` sent
  with the event so a future server-side Conversions API event collapses into
  the same conversion rather than counting twice.

To verify after deploying: install the **Meta Pixel Helper** Chrome extension,
load the page (expect one `PageView`), complete the form (expect exactly one
`Lead`), then refresh the confirmation page (expect no second `Lead`).

### Follow Up Boss

Leads are sent to the documented Events API:

```
POST https://api.followupboss.com/v1/events
Authorization: Basic base64("<API key>:")     ← key as username, blank password
```

Payload carries first name, last name, email, phone, property address, selling
timeline (as both a tag and in the message body), and any UTM/fbclid attribution
captured from the ad click.

Follow Up Boss returns `201` for a new person, `200` when it matched and updated
an existing one, and `204` when a lead-flow rule archived it. All three count as
delivered. Anything else means the visitor sees an error and can retry, and the
Meta `Lead` event does **not** fire.

**Two things to confirm in your FUB account before running ads:**

1. That the API key's user has permission to create events. Send one test lead
   and check it lands where you expect.
2. Whether you want a lead flow / round-robin assignment rule for this source.
   Leads arrive with source `Facebook / Instagram Ad` (or the UTM source) and
   tags `Seller Lead`, `Landing Page`, and `Timeline: …`.

The retry guard in `api/_lib/lead-core.ts` is in-memory, which catches the
realistic case — a visitor tapping again after a timeout on a warm function
instance. If you want a hard guarantee across instances, swap that `Map` for
Vercel KV or Upstash Redis keyed on the same `submissionId`.

---

## Editing content

Almost everything an editor touches is in `src/config.ts`:

- `COPY` — headline, subtitle, labels, CTAs, success message
- `TIMELINE_OPTIONS` — the three selling-timeline choices
- `DISCLAIMER` — team name, affiliation, licensees, and two empty slots for
  brokerage legal name / DRE and any extra required language
- `META_PIXEL_ID`
- `HERO_BACKGROUND` — the two sizes of the hero photograph, or `null` for a
  clean white hero

Swapping the hero photo: export at 1536px and 860px wide as `.webp`, drop both
into `public/`, update `HERO_BACKGROUND`, and update the two `<link rel=preload>`
tags near the top of `index.html` to match.

### About the photographs

`src/assets/wil-and-liz.webp` is Wil and Liz's own photograph with the white
studio backdrop and its floor shadow made transparent, so they stand in the
scene instead of sitting in a box. Their faces, bodies, clothing and proportions
are untouched, and the image is never stretched or cropped.

---

## Accessibility

Semantic HTML, labelled inputs, visible focus rings, keyboard-operable timeline
radios, `role="alert"` error messages linked with `aria-describedby`, and error
and selected states that use a border shift, a background change and an icon —
never colour on its own. All motion is disabled under
`prefers-reduced-motion: reduce`; only the submit spinner keeps moving, because
it communicates that something is happening.

---

## Test coverage

`node qa/funnel.qa.mjs` builds nothing and assumes `dist/` is current. It drives
the real production build at 375px, 820px and 1440px and asserts, at each size:

PageView fires · Lead does not fire early · no horizontal scroll on either step ·
empty address blocked · `aria-invalid` set · address carried to step 2 · step 2
blocks empty submit · invalid email caught · phone auto-formats · one timeline
selected · CRM failure shows an error and fires no Lead · retry allowed · Lead
fires once on success with an `eventID` · double-click sends one lead · payload
complete · UTM and fbclid preserved · retry reuses one submission id · refresh
does not re-fire Lead · no console errors.

Plus, once: 44px minimum tap targets, 16px minimum input font (stops iOS
zooming), no CRM credentials or CRM hostname anywhere in the client bundle.
