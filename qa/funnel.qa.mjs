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

  // 2b. Step 1 copy verbatim, and the portrait belongs here
  const copy1 = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent,
    sub: document.querySelector('.subtitle')?.textContent,
    label: document.querySelector('label[for=property-address]')?.textContent,
    ph: document.querySelector('#property-address')?.getAttribute('placeholder'),
    cta: document.querySelector('button[type=submit]')?.textContent,
    portraits: [...document.querySelectorAll('img')].filter((i) =>
      /wil-and-liz/.test(i.currentSrc || i.src),
    ).length,
    glass: !!document.querySelector('.hero__copy.glass'),
  }));
  check(`${tag} step 1 headline verbatim`, copy1.h1 === 'Sell Your Home for Top Dollar', copy1.h1);
  check(
    `${tag} step 1 subtitle verbatim`,
    copy1.sub === "With 75+ years of combined experience, we'll help you sell faster and for top dollar. ⭐",
    copy1.sub,
  );
  check(
    `${tag} address question verbatim`,
    copy1.label === "What's the address of the home you're thinking about selling?",
    copy1.label,
  );
  check(`${tag} address placeholder verbatim`, copy1.ph === 'Enter your property address', copy1.ph);
  check(`${tag} step 1 CTA is GET STARTED`, copy1.cta === 'GET STARTED', copy1.cta);
  check(`${tag} portrait IS shown on step 1`, copy1.portraits === 1, `${copy1.portraits} found`);
  check(`${tag} step 1 uses the glass card`, copy1.glass);

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

  // 4c. Step 2 is a different composition: no portrait, logo instead.
  // Wait for the logo bitmap to decode, and settle the smooth scroll, so the
  // measurements below are of the real laid-out page.
  await page.waitForFunction(() => {
    const i = document.querySelector('.brand-plate img');
    return i && i.complete && i.naturalWidth > 0;
  });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(150);

  const stage = await page.evaluate(() => {
    const portraits = [...document.querySelectorAll('img')].filter((i) =>
      /wil-and-liz/.test(i.currentSrc || i.src),
    );
    const logoEl = document.querySelector('.brand-plate img');
    const bgEl = document.querySelector('.stage__bg');
    const plate = document.querySelector('.brand-plate')?.getBoundingClientRect();
    const panel = document.querySelector('.stage__panel')?.getBoundingClientRect();
    const sect = document.querySelector('.stage')?.getBoundingClientRect();
    // True rectangle intersection — overlap needs BOTH axes to overlap.
    const overlaps =
      plate && panel
        ? !(
            plate.right <= panel.left ||
            plate.left >= panel.right ||
            plate.bottom <= panel.top ||
            plate.top >= panel.bottom
          )
        : true;
    return {
      portraits: portraits.length,
      logoSrc: logoEl?.currentSrc || logoEl?.src || '',
      logoNatural: logoEl ? logoEl.naturalWidth / logoEl.naturalHeight : 0,
      logoRendered: logoEl
        ? logoEl.getBoundingClientRect().width / logoEl.getBoundingClientRect().height
        : 0,
      logoWidth: logoEl ? logoEl.getBoundingClientRect().width : 0,
      bg: bgEl ? getComputedStyle(bgEl).backgroundImage : '',
      masthead: !!document.querySelector('.masthead'),
      // Inset from the top-right corner of the step-2 section itself, which is
      // what "upper-right with comfortable spacing" actually means.
      plateRight: plate && sect ? sect.right - plate.right : -1,
      plateTop: plate && sect ? plate.top - sect.top : -1,
      collides: overlaps,
    };
  });

  check(`${tag} portrait is NOT shown on step 2`, stage.portraits === 0, `${stage.portraits} found`);
  check(`${tag} step 2 uses the dining-room photo`, /dining-room/.test(stage.bg), stage.bg.slice(0, 80));
  check(`${tag} official logo present, upper right`, /logo-legacy-built/.test(stage.logoSrc) && stage.plateTop >= 8 && stage.plateRight >= 8, JSON.stringify(stage));
  check(
    `${tag} logo is not distorted`,
    Math.abs(stage.logoNatural - stage.logoRendered) < 0.02,
    `natural ${stage.logoNatural.toFixed(3)} vs rendered ${stage.logoRendered.toFixed(3)}`,
  );
  check(
    `${tag} logo is small but visible (${Math.round(stage.logoWidth)}px)`,
    stage.logoWidth >= 60 && stage.logoWidth <= 130,
  );
  check(`${tag} logo does not overlap the form panel`, !stage.collides);
  check(`${tag} masthead gives way to the logo on step 2`, stage.masthead === false);

  // 4d. Exact copy, verbatim
  const copy2 = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent,
    q: [...document.querySelectorAll('legend')].map((l) => l.textContent),
    opts: [...document.querySelectorAll('.choice span')].map((s) => s.textContent),
    cta: document.querySelector('form button[type=submit]')?.textContent,
  }));
  check(`${tag} step 2 headline verbatim`, copy2.h1 === "Let's Get Your Home Sold.", copy2.h1);
  check(
    `${tag} timeline question verbatim`,
    copy2.q.includes('How soon are you looking to sell your home?'),
    JSON.stringify(copy2.q),
  );
  check(
    `${tag} timeline options verbatim`,
    JSON.stringify(copy2.opts) === JSON.stringify(['0–3 months', '3–6 months', '6–12 months']),
    JSON.stringify(copy2.opts),
  );
  check(`${tag} final CTA is GET MY HOME VALUE`, copy2.cta === 'GET MY HOME VALUE', copy2.cta);

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

  // 12b. Success copy verbatim
  const succ = await page.evaluate(() => ({
    h1: document.querySelector('.success h1')?.textContent,
    p: document.querySelector('.success p')?.textContent,
  }));
  check(`${tag} success headline verbatim`, succ.h1 === "You're All Set! 🏡", succ.h1);
  check(
    `${tag} success body verbatim`,
    succ.p ===
      'Thanks for reaching out. Wil & Liz Team will be in touch shortly to discuss your home and your selling goals.',
    succ.p,
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
