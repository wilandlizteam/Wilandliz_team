/**
 * Real handler end-to-end.
 *
 * WHY THIS EXISTS: the other two suites both stub the boundary —
 * funnel.qa.mjs intercepts /api/lead in the browser, and lead-core.test.mjs
 * imports lead-core.ts directly. Neither ever loaded api/lead.ts, so an
 * extensionless relative import that made the serverless function fail to load
 * with ERR_MODULE_NOT_FOUND passed every test and every typecheck.
 *
 * This suite closes that hole: it imports the REAL api/lead.ts, serves it over
 * REAL HTTP alongside the REAL production build, and drives the whole funnel in
 * a browser. Only the outbound Follow Up Boss call is stubbed, so no key is
 * used and no lead is ever created.
 *
 * Run:  node --experimental-strip-types qa/handler.e2e.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');

process.env.FOLLOW_UP_BOSS_API_KEY = 'e2e-probe-key-not-real';
delete process.env.FUB_SOURCE;
delete process.env.FUB_SYSTEM;

const results = [];
const check = (name, pass, detail = '') =>
  results.push({ name, pass, detail: pass ? '' : String(detail) });

/* ---- stub the outbound CRM call only -------------------------------------- */
const fubCalls = [];
globalThis.fetch = async (url, init) => {
  fubCalls.push({ url: String(url), body: JSON.parse(init.body) });
  const isEvent = String(url).includes('/v1/events');
  return new Response(JSON.stringify(isEvent ? { id: 4242 } : {}), {
    status: isEvent ? 201 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

/* ---- THE POINT OF THIS FILE: load the real function ----------------------- */
let handler;
try {
  ({ default: handler } = await import(path.join(ROOT, 'api/lead.ts')));
  check('api/lead.ts loads as an ES module', typeof handler === 'function', typeof handler);
} catch (error) {
  check('api/lead.ts loads as an ES module', false, `${error.code}: ${error.message.split('\n')[0]}`);
  console.log(`  ✗ api/lead.ts failed to load — ${error.code}\n    ${error.message.split('\n')[0]}`);
  process.exit(1);
}
try {
  const mod = await import(path.join(ROOT, 'netlify/functions/lead.ts'));
  check('netlify/functions/lead.ts loads as an ES module', typeof mod.default === 'function');
} catch (error) {
  check('netlify/functions/lead.ts loads as an ES module', false, error.code);
}

/* ---- serve the real build + the real function ----------------------------- */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
};

/** Every response the real handler produced, captured as it was sent. */
const apiExchanges = [];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/lead') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    // The request/response shape the host hands a Node serverless function.
    const vreq = { method: req.method, body: parsed };
    const vres = {
      setHeader: (k, v) => res.setHeader(k, v),
      status: (code) => ({
        json: (b) => {
          apiExchanges.push({ status: code, body: b });
          res.writeHead(code, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(b));
        },
      }),
    };
    try {
      await handler(vreq, vres);
    } catch (error) {
      console.error('  handler threw:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"ok":false}');
    }
    return;
  }

  const file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* ---- drive the funnel ----------------------------------------------------- */
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));
// Blocked deliberately: these are the only expected network failures.
await page.route('**/connect.facebook.net/**', (r) => r.abort());
await page.route('**/fonts.googleapis.com/**', (r) => r.abort());

await page.goto(`${BASE}/?utm_source=facebook&utm_campaign=seller_q4&fbclid=IwAR_probe`);
await page.waitForSelector('h1');

await page.fill('#property-address', '1420 Camino Real, Fullerton, CA 92835');
await page.click('button[type=submit]');
const reachedStep2 = await page
  .waitForSelector('#firstName', { timeout: 8000 })
  .then(() => true)
  .catch(() => false);
check('page 1 → page 2 navigation works', reachedStep2);
check(
  'address persists to page 2',
  (await page.locator('.recall__value').textContent()).trim() ===
    '1420 Camino Real, Fullerton, CA 92835',
);

await page.fill('#firstName', 'Dana');
await page.fill('#lastName', 'Ortiz');
await page.fill('#email', 'dana.ortiz@example.com');
await page.fill('#phone', '7145550142');
await page.locator('.choice', { hasText: '3–6 months' }).click();

// Arm the wait BEFORE clicking, so the response can never be missed.
const leadResponse = page
  .waitForResponse((r) => r.url().includes('/api/lead'), { timeout: 12000 })
  .catch(() => null);
await page.click('form button[type=submit]');
const apiResponse = await leadResponse;

const success = await page
  .waitForSelector('.success', { timeout: 12000 })
  .then(() => true)
  .catch(() => false);

check(
  '/api/lead returns 200 over real HTTP',
  apiResponse?.status() === 200,
  apiResponse ? `status ${apiResponse.status()}` : 'no /api/lead response observed',
);
check(
  '/api/lead responded {"ok":true}',
  apiExchanges.at(-1)?.body?.ok === true,
  JSON.stringify(apiExchanges),
);
check('success screen is shown', success);
check('no error banner is shown', (await page.locator('.submit-error').count()) === 0);

/* ---- what actually reached the CRM ---------------------------------------- */
const ev = fubCalls.find((c) => c.url.includes('/v1/events'));
const note = fubCalls.find((c) => c.url.includes('/v1/notes'));

check('event posted to /v1/events', !!ev, JSON.stringify(fubCalls.map((c) => c.url)));
check('firstName mapped correctly', ev?.body.person.firstName === 'Dana');
check('lastName mapped correctly', ev?.body.person.lastName === 'Ortiz');
check('email mapped correctly', ev?.body.person.emails?.[0]?.value === 'dana.ortiz@example.com');
check('phone mapped correctly', ev?.body.person.phones?.[0]?.value === '(714) 555-0142');
check('note posted to /v1/notes', !!note);
check('note attached to the person id from the event', note?.body.personId === 4242);
check('note carries the timeline', /^Timeline: 3-6 months$/m.test(note?.body.body ?? ''));

/* ---- pixel ---------------------------------------------------------------- */
const pixel = await page.evaluate(() => (window.fbq?.queue ?? []).map((a) => [...a].slice(0, 2)));
check('PageView fired', pixel.some((c) => c[1] === 'PageView'), JSON.stringify(pixel));
check('Lead fired exactly once, after success',
  pixel.filter((c) => c[1] === 'Lead').length === 1, JSON.stringify(pixel));

const realErrors = pageErrors.filter((e) => !/ERR_FAILED|ERR_TUNNEL|net::/.test(e));
check('no unexpected page errors', realErrors.length === 0, realErrors.join(' | '));

await browser.close().catch(() => {});
server.close();

for (const r of results) {
  console.log(`${r.pass ? '  ✓' : '  ✗'} ${r.name}${r.detail ? '  → ' + r.detail : ''}`);
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
