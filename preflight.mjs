/**
 * Runs before the production build.
 *
 * Its only job is to turn "some files never reached the server" — the failure
 * that took down the first Vercel deploy — into a message that says exactly
 * what is missing and what to do about it, instead of a TypeScript error code.
 *
 * Exits 1 with an explanation if anything the site cannot be built without is
 * absent. Warns, but does not fail, for things that are merely nice to have.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const rel = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(rel(p));

/** Files and folders the site genuinely cannot be built without. */
const REQUIRED = [
  ['index.html', 'the HTML entry point Vite builds from'],
  ['vite.config.ts', 'build configuration'],
  ['src/main.tsx', 'the React entry point'],
  ['src/App.tsx', 'the funnel step machine'],
  ['src/index.css', 'the entire design system'],
  ['src/config.ts', 'pixel ID, copy, and the brokerage disclaimer'],
  ['src/components', 'the landing page components'],
  ['src/lib', 'pixel, attribution, validation, and submit logic'],
  ['src/assets/wil-and-liz.webp', "Wil and Liz's portrait"],
];

/** Present on a healthy deploy, but the site still builds without them. */
const EXPECTED = [
  ['api/lead.ts', 'the secure lead endpoint — the form will 404 on submit without it'],
  ['api/_lib/lead-core.ts', 'the Follow Up Boss integration'],
  ['public/hero-home.webp', 'the desktop hero photograph'],
  ['public/hero-home-sm.webp', 'the mobile hero photograph'],
];

const missingRequired = REQUIRED.filter(([p]) => !exists(p));
const missingExpected = EXPECTED.filter(([p]) => !exists(p));

if (missingRequired.length) {
  const list = missingRequired.map(([p, why]) => `    ${p.padEnd(32)} ${why}`).join('\n');
  console.error(`
  ────────────────────────────────────────────────────────────────────────
  BUILD STOPPED — source files are missing from this checkout
  ────────────────────────────────────────────────────────────────────────

  Missing:

${list}

  The build directory is:
    ${ROOT}

  This almost always means the files were never committed and pushed, rather
  than anything being wrong with the code. Subdirectories are the usual
  casualty — GitHub's drag-and-drop web uploader does not always carry nested
  folders, and a stray .gitignore rule can silently drop them too.

  Check what the repository actually contains:

    git ls-files | head -40          # should list src/, api/, public/ files
    git check-ignore -v src          # prints a rule if something is ignoring src/

  If src/ is not in that list, commit it from the project root:

    git add -A && git commit -m "Add application source" && git push

  ────────────────────────────────────────────────────────────────────────
`);
  process.exit(1);
}

if (missingExpected.length) {
  console.warn('  Preflight warnings (build continues):');
  for (const [p, why] of missingExpected) console.warn(`    missing ${p} — ${why}`);
}

console.log('  Preflight OK — all source files present.');
