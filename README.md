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
| `npm run build` | Preflight check, type-check, then production build to `dist/` |
| `npm run typecheck` | Frontend types only |
| `npm run typecheck:server` | Serverless function types (not part of the build) |
| `npm run lint` | Lint `src/` |
| `npm run qa` | Build, then the full funnel test suite (181 assertions) |
| `node scripts/build-preview.mjs` | Single-file `preview.html` for review/email |

The QA suite drives a real browser. Playwright is deliberately **not** a
dependency — it would add ~150MB to every deploy for a tool the server never
runs. Install it once when you want to run the tests:

```bash
npm i --no-save playwright && npx playwright install chromium
npm run qa
```

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

### If the deploy fails

**`TS18003: No inputs were found in config file`** — or the build stops with
`BUILD STOPPED — source files are missing from this checkout`.

Neither is a code problem. Both mean the deployed checkout is missing folders:
the root files (`package.json`, `tsconfig.json`) arrived but `src/`, `api/` or
`public/` did not. The usual causes are GitHub's drag-and-drop web uploader,
which does not reliably carry nested folders, and pushing from the wrong
directory.

Check what the repository actually contains:

```bash
git ls-files | head -40      # expect ~40 files including src/ and api/
git check-ignore -v src      # prints a rule only if something ignores src/
```

A healthy repo lists 40 files. If `src/` is absent, push from the project root
(the folder containing `package.json`) with the command line rather than the
web uploader:

```bash
cd wilandliz-seller-funnel
git init && git add -A
git commit -m "Wil & Liz seller funnel"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Also confirm Vercel's **Settings → General → Root Directory** is empty (or set
to the folder containing `package.json`, if you committed the project inside a
subfolder).

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
scripts/preflight.mjs    ← fails the build with a readable message if files are missing
```

**Build configuration.** One `tsconfig.json` covers everything the site build
compiles. The serverless functions are type-checked separately via
`tsconfig.server.json` and `npm run typecheck:server` — they are compiled by the
host at deploy time, not by `vite build`, so keeping them out of the site build
means a problem with them can never take the landing page down.

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
   tags `Home Value Lead`, `Landing Page`, and one of `Timeline: …`,
   `Curious — not selling yet`, or `Timeline: not specified`. Those three make it
   easy to build separate smart lists for ready-to-list sellers, future sellers,
   and pure home-value enquiries.

The retry guard in `api/_lib/lead-core.ts` is in-memory, which catches the
realistic case — a visitor tapping again after a timeout on a warm function
instance. If you want a hard guarantee across instances, swap that `Map` for
Vercel KV or Upstash Redis keyed on the same `submissionId`.

---

## Editing content

Almost everything an editor touches is in `src/config.ts`:

- `COPY` — headline, subtitle, labels, CTAs, consent line, success message
- `TIMELINE_OPTIONS` — the timeline choices. **The question is optional**: a
  visitor can submit without answering. `validateContact()` in
  `src/lib/validation.ts` and `ALLOWED_TIMELINES` in `api/_lib/lead-core.ts`
  both have to agree, or the lead 400s. An option marked `wide: true` gets its
  own full-width row.
- `EHOMES_LOGO` — the ehomes mark shown in the footer's "powered by" credit
- `DISCLAIMER` — team name, affiliation, licensees, and two empty slots for
  brokerage legal name / DRE and any extra required language
- `META_PIXEL_ID`
- `HERO_BACKGROUND` — the two sizes of the step 1 photograph, or `null` for a
  clean white hero
- `PAGE2_BACKGROUND` — the two sizes of the step 2 interior photograph

Swapping the hero photo: export at 1536px and 860px wide as `.webp`, drop both
into `public/`, update `HERO_BACKGROUND`, and update the two `<link rel=preload>`
tags near the top of `index.html` to match. The step 2 photo is the same but at
1760px and 900px, and should be landscape — phones show it at a 4:3 crop.

### The two steps are deliberately different

**Step 1** is the cinematic hero: the exterior photograph runs full bleed, a
single frosted glass card carries the eyebrow, headline, subtitle and address
field, and Wil and Liz stand at the right.

**Step 2** is the interior. No portrait, no masthead — the dining-room
photograph fills the frame and the official logo in the upper right is the only
branding. On desktop the glass form panel sits left, over the kitchen doorway,
so the table, pendant and window stay clear. On phones and small tablets the
room runs as a full-width 4:3 band at the top with the form rising over its
lower edge, which keeps the whole room legible instead of cropping it to a
sliver.

The glass is `backdrop-filter` layered over a mostly opaque white tint, so where
the filter is unsupported the panel is simply a solid card and nothing about
readability depends on the blur.

### About the photographs

`src/assets/wil-and-liz.webp` is Wil and Liz's own photograph with the white
studio backdrop and its floor shadow made transparent, so they stand in the
scene instead of sitting in a box. Their faces, bodies, clothing and proportions
are untouched, and the image is never stretched or cropped. It appears on
step 1 only.

`public/dining-room.webp` is the supplied interior photograph, resampled up,
unsharp-masked and given a small exposure/contrast/saturation lift — a
presentation pass only. Nothing in the room was added, removed, moved or
re-composed.

`src/assets/logo-legacy-built.png` is the official Wil & Liz mark, unmodified:
no recolouring, no redrawing, no added effects. Only the flat white surround was
made transparent so it can sit on the brand plate. It appears beside the WIL &
LIZ wordmark in the header and, on step 2, alone in the upper right.

`src/assets/logo-ehomes.png` is the official ehomes mark exactly as supplied —
it already shipped with a transparent background, so only the empty margin was
trimmed. Its orange is the one deliberate exception to the navy-and-white
palette: it is a real partner mark rather than a colour choice, so it is used
once, small, in the footer credit.

Both logos are sized by a single dimension in CSS, so neither can be stretched —
the QA suite asserts each rendered aspect ratio matches its source file.

### Tone

The page is positioned as a home-value and market-analysis request, not a
listing pitch. Step 2 asks where to send the analysis, the timeline question is
optional and includes an explicitly not-selling answer, and the consent line is
about real estate goals rather than selling. Step 1's headline and address
question are still sell-oriented and were left as approved — see the note in the
project handover if that positioning is revisited.

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

Design and content assertions, also at each size: every line of copy on all
three screens matches the approved wording character for character · the
portrait appears on step 1 and nowhere else · step 2 uses the dining-room
photograph · the official logo is present in the upper right with real spacing
from both edges · the logo's rendered aspect ratio matches the source file, so
it cannot have been stretched · the logo is between 60 and 130px wide · the logo
does not overlap the form panel · the masthead gives way to the logo on step 2.

Plus, once: 44px minimum tap targets, 16px minimum input font (stops iOS
zooming), no CRM credentials or CRM hostname anywhere in the client bundle.
