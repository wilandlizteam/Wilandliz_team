/**
 * End-to-end QA sweep. Serves the production build, drives the whole funnel at
 * three viewport sizes, and asserts the behaviour that matters for conversion
 * and tracking. Run with:  node qa/funnel.qa.mjs
 *
 * The Follow Up Boss call is stubbed at the network layer so the sweep never
 * creates real leads. It also exercises the failure path.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '../dist');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('nope');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (name, pass, detail = '') =>
  results.push({ name, pass, detail: pass ? '' : detail });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const VIEWPORTS = [
  { name: 'iPhone SE  375×667', width: 375, height: 667, mobile: true },
  { name: 'iPad       820×1180', width: 820, height: 1180, mobile: false },
  { name: 'Desktop   1440×900', width: 1440, height: 900, mobile: false },
];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();

  // --- stub the outside world -------------------------------------------
  // Block only the remote Meta script. The real pixel snippet still runs, so
  // this exercises our actual implementation; calls made before the script
  // loads sit in fbq.queue, which is what we read.
  await page.route('**/connect.facebook.net/**', (r) => r.abort());
  const pixel = () => page.evaluate(() => (window.fbq?.queue ?? []).map((a) => [...a]));

  let leadPosts = [];
  let failNext = false;
  await page.route('**/api/lead', async (route) => {
    leadPosts.push(JSON.parse(route.request().postData()));
    if (failNext) {
      failNext = false;
      return route.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const tag = `[${vp.name}]`;
  await page.goto(
    `${BASE}/?utm_source=facebook&utm_medium=paid_social&utm_campaign=seller_q4&utm_content=carousel_a&fbclid=IwAR_test123`,
  );
  await page.waitForSelector('h1');

  // 1. PageView fired on load
  const afterLoad = await pixel();
  check(
    `${tag} PageView fires on load`,
    afterLoad.some((c) => c[0] === 'track' && c[1] === 'PageView'),
    JSON.stringify(afterLoad),
  );
  check(
    `${tag} Lead does NOT fire on page 1 load`,
    !afterLoad.some((c) => c[1] === 'Lead'),
  );

  // 2. No horizontal scroll
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    win: window.innerWidth,
  }));
  check(
    `${tag} no horizontal scrolling`,
    overflow.doc <= overflow.win + 1 && overflow.body <= overflow.win + 1,
    `doc ${overflow.doc} / body ${overflow.body} vs win ${overflow.win}`,
  );

  // 3. Empty address is rejected
  await page.click('button[type=submit]');
  check(
    `${tag} empty address blocked with a message`,
    await page.locator('#property-address-error').isVisible(),
  );
  check(
    `${tag} empty address sets aria-invalid`,
    (await page.getAttribute('#property-address', 'aria-invalid')) === 'true',
  );
  check(`${tag} still on step 1 after invalid submit`, await page.locator('#property-address').isVisible());

  // 4. Advance
  await page.fill('#property-address', '1420 Camino Real, Fullerton, CA 92835');
  await page.click('button[type=submit]');
  await page.waitForSelector('#firstName');

  const afterStep2 = await pixel();
  check(`${tag} Lead does NOT fire on GET STARTED`, !afterStep2.some((c) => c[1] === 'Lead'));

  // 4b. Step 2 must not overflow sideways either
  const overflow2 = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    win: window.innerWidth,
  }));
  check(
    `${tag} no horizontal scrolling on step 2`,
    overflow2.doc <= overflow2.win + 1 && overflow2.body <= overflow2.win + 1,
    `doc ${overflow2.doc} / body ${overflow2.body} vs win ${overflow2.win}`,
  );

  // 5. Address carried forward
  const recalled = await page.locator('.recall__value').textContent();
  check(
    `${tag} address persists to step 2`,
    recalled.trim() === '1420 Camino Real, Fullerton, CA 92835',
    recalled,
  );

  // 6. Step 2 validation
  await page.click('form button[type=submit]');
  const errs = await page.locator('[role=alert]').count();
  check(`${tag} step 2 blocks empty submit (${errs} messages)`, errs >= 5, `only ${errs}`);
  check(`${tag} no lead posted while invalid`, leadPosts.length === 0);

  // 7. Bad email caught
  await page.fill('#firstName', 'Dana');
  await page.fill('#lastName', 'Ortiz');
  await page.fill('#email', 'dana@@example');
  await page.fill('#phone', '7145550142');
  check(
    `${tag} invalid email flagged`,
    await page.locator('#email-error').isVisible(),
  );

  // 8. Phone auto-formats
  check(
    `${tag} phone formats as (714) 555-0142`,
    (await page.inputValue('#phone')) === '(714) 555-0142',
    await page.inputValue('#phone'),
  );

  await page.fill('#email', 'dana.ortiz@example.com');

  // 9. Timeline selection
  await page.locator('.choice', { hasText: '3–6 months' }).click();
  const selected = await page.locator('.choice[data-selected=true]').count();
  check(`${tag} exactly one timeline selected`, selected === 1, `${selected} selected`);

  // 10. Failure path — no success screen, no Lead event, retry allowed
  failNext = true;
  await page.click('form button[type=submit]');
  await page.waitForSelector('.submit-error');
  const afterFail = await pixel();
  check(`${tag} CRM failure shows an error`, await page.locator('.submit-error').isVisible());
  check(`${tag} Lead does NOT fire when CRM fails`, !afterFail.some((c) => c[1] === 'Lead'));
  check(`${tag} still on the form after failure`, await page.locator('#firstName').isVisible());
  check(
    `${tag} submit button re-enabled after failure`,
    await page.locator('form button[type=submit]').isEnabled(),
  );

  // 11. Success path + double-click guard
  const btn = page.locator('form button[type=submit]');
  await btn.click();
  await btn.click({ force: true }).catch(() => {});
  await page.waitForSelector('.success');

  const finalPixel = await pixel();
  const leadEvents = finalPixel.filter((c) => c[1] === 'Lead');
  check(`${tag} Lead fires after confirmed CRM success`, leadEvents.length === 1, `fired ${leadEvents.length}×`);
  check(
    `${tag} Lead carries an eventID for dedup`,
    !!leadEvents[0]?.[3]?.eventID,
    JSON.stringify(leadEvents[0]),
  );

  const successPosts = leadPosts.slice(1); // first was the deliberate failure
  check(
    `${tag} double-click sends exactly one lead`,
    successPosts.length === 1,
    `${successPosts.length} posts`,
  );

  // 12. Payload completeness + attribution
  const sent = successPosts[0] ?? {};
  const required = ['propertyAddress', 'firstName', 'lastName', 'email', 'phone', 'timeline'];
  const missing = required.filter((k) => !sent[k]);
  check(`${tag} lead payload complete`, missing.length === 0, `missing ${missing}`);
  check(
    `${tag} UTM + fbclid preserved`,
    sent.attribution?.utm_source === 'facebook' &&
      sent.attribution?.utm_campaign === 'seller_q4' &&
      sent.attribution?.fbclid === 'IwAR_test123',
    JSON.stringify(sent.attribution),
  );
  check(
    `${tag} retry reuses one submissionId`,
    leadPosts[0].submissionId === leadPosts[1].submissionId,
  );

  // 13. Refresh on success must not re-fire Lead
  await page.reload();
  await page.waitForSelector('h1');
  const afterReload = await pixel();
  check(
    `${tag} refresh does not re-fire Lead`,
    !afterReload.some((c) => c[1] === 'Lead'),
    JSON.stringify(afterReload),
  );

  // Ignore noise this harness creates on purpose: the blocked Meta script and
  // the deliberate 502 from the CRM-failure case.
  const realErrors = consoleErrors.filter(
    (e) => !/ERR_TUNNEL_CONNECTION_FAILED|ERR_FAILED|502 \(Bad Gateway\)/.test(e),
  );
  check(`${tag} no unexpected console errors`, realErrors.length === 0, realErrors.join(' | '));
  await ctx.close();
}

/* ------------------------- tap-target + secret audit --------------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.route('**/connect.facebook.net/**', (r) => r.abort());
  await page.goto(BASE);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, input, a, label.choice')]
      .filter((el) => !el.classList.contains('skip-link'))
      .map((el) => ({ el: el.tagName + (el.id ? '#' + el.id : ''), h: el.getBoundingClientRect().height }))
      .filter((x) => x.h > 0 && x.h < 44),
  );
  check('tap targets are at least 44px tall', small.length === 0, JSON.stringify(small));

  const fontTooSmall = await page.evaluate(() =>
    [...document.querySelectorAll('input')]
      .map((el) => parseFloat(getComputedStyle(el).fontSize))
      .filter((s) => s < 16),
  );
  check('inputs ≥16px so iOS does not zoom', fontTooSmall.length === 0, JSON.stringify(fontTooSmall));
  await ctx.close();
}

{
  const bundle = fs
    .readdirSync(path.join(DIST, 'assets'))
    .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
    .map((f) => fs.readFileSync(path.join(DIST, 'assets', f), 'utf8'))
    .join('\n');
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const all = bundle + html;
  const leaks = [/fka_[A-Za-z0-9]{8,}/, /FOLLOW_UP_BOSS_API_KEY\s*[:=]\s*["'][^"']+/, /api\.followupboss\.com/];
  const found = leaks.filter((re) => re.test(all)).map(String);
  check('no CRM credentials or CRM host in the client bundle', found.length === 0, found.join(', '));
  check('Meta Pixel ID present exactly where expected', all.includes('1711242080023828'));
}

await browser.close();
server.close();

/* ------------------------------- report ---------------------------------- */
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '  ✓' : '  ✗'} ${r.name}${r.detail ? '  → ' + r.detail : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
