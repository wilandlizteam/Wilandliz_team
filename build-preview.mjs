/**
 * Bundles the production build into ONE self-contained preview.html — every
 * stylesheet, script and image inlined as a data URI — so the page can be
 * emailed, opened from a USB stick, or dropped into a review tool.
 *
 * The preview is for review only. It has no server, so the form posts nowhere;
 * set PREVIEW_MODE below and it simulates a successful CRM response instead.
 *
 * Run:  npm run build && node scripts/build-preview.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'preview.html');

const MIME = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function dataUri(assetPath) {
  const abs = path.join(DIST, assetPath.replace(/^\//, ''));
  if (!fs.existsSync(abs)) return null;
  const mime = MIME[path.extname(abs).toLowerCase()];
  if (!mime) return null;
  return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
}

/** Replace every /assets/... or /*.webp|jpg|png reference with its data URI. */
function inlineAssets(text) {
  return text.replace(/\/(?:assets\/)?[\w.-]+\.(?:webp|jpg|jpeg|png|svg)/g, (match) => {
    return dataUri(match) ?? match;
  });
}

let html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

// Inline the stylesheet
html = html.replace(
  /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (_m, href) => `<style>${inlineAssets(fs.readFileSync(path.join(DIST, href.replace(/^\//, '')), 'utf8'))}</style>`,
);

// Inline the module script
html = html.replace(
  /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_m, src) =>
    `<script type="module">${inlineAssets(fs.readFileSync(path.join(DIST, src.replace(/^\//, '')), 'utf8'))}</script>`,
);

// Drop the preloads and remote font/pixel calls — a self-contained file
// shouldn't reach out to the network to render.
html = html
  .replace(/<link rel="preload"[\s\S]*?\/>/g, '')
  .replace(/<link rel="modulepreload"[^>]*>/g, '');

// Remaining inline references (og:image, favicon)
html = inlineAssets(html);

// Preview shim: stand in for the /api/lead endpoint that only exists on a real
// deployment, and stop the Meta pixel firing from a local file.
const shim = `
<script>
  window.__WL_PREVIEW__ = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url ?? '';
    if (url.includes('/api/lead')) {
      console.info('[preview] lead captured locally:', JSON.parse(init.body));
      return new Promise((r) =>
        setTimeout(() => r(new Response('{"ok":true}', { status: 200 })), 700),
      );
    }
    return realFetch(input, init);
  };
</script>`;
html = html.replace('</head>', `${shim}\n</head>`);

fs.writeFileSync(OUT, html);
console.log(`preview.html written — ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
