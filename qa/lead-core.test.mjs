/**
 * Server-side tests for the Follow Up Boss integration.
 *
 * The browser suite (funnel.qa.mjs) stubs /api/lead at the network layer, so it
 * never sees what is actually sent to Follow Up Boss. This exercises
 * api/_lib/lead-core.ts directly with `fetch` replaced, and asserts the exact
 * request bodies — field mapping, the note, and the failure paths.
 *
 * Nothing here touches the real API: no key is used and no lead is created.
 *
 * Run:  node --experimental-strip-types qa/lead-core.test.mjs
 */
import assert from 'node:assert/strict';
import { handleLead } from '../api/_lib/lead-core.ts';

process.env.FOLLOW_UP_BOSS_API_KEY = 'test-key-not-real';
delete process.env.FUB_SYSTEM;
delete process.env.FUB_SYSTEM_KEY;
delete process.env.FUB_SOURCE;
delete process.env.FUB_ASSIGNED_TAG;

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (error) {
    results.push({ name, pass: false, detail: error.message.split('\n')[0] });
  }
};

let calls = [];
const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Replaces global fetch and records every request lead-core makes. */
function stubFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const call = {
      url: String(url),
      method: init?.method,
      headers: init?.headers ?? {},
      body: init?.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return handler(call);
  };
}

const validLead = (over = {}) => ({
  submissionId: `sub-${Math.random().toString(36).slice(2)}`,
  propertyAddress: '1420 Camino Real, Fullerton, CA 92835',
  firstName: 'Dana',
  lastName: 'Ortiz',
  email: 'dana.ortiz@example.com',
  phone: '(714) 555-0142',
  timeline: '3-6 months',
  source: 'facebook / seller_q4',
  attribution: {
    utm_source: 'facebook',
    utm_campaign: 'seller_q4',
    fbclid: 'IwAR_test123',
    landingPage: 'https://sell.wilandliz.com/?utm_source=facebook',
  },
  ...over,
});

const eventsCall = () => calls.find((c) => c.url.includes('/v1/events'));
const noteCall = () => calls.find((c) => c.url.includes('/v1/notes'));

/* ========================================================================== */
/* 1. Happy path — field mapping                                              */
/* ========================================================================== */
{
  stubFetch((c) =>
    c.url.includes('/v1/events') ? json(201, { id: 55501, name: 'Dana Ortiz' }) : json(200, {}),
  );
  const result = await handleLead(validLead());

  check('lead succeeds', () => assert.equal(result.status, 200));
  check('response says ok', () => assert.deepEqual(result.body, { ok: true }));

  const ev = eventsCall();
  check('posts to the Events API, not /v1/people', () => {
    assert.ok(ev, 'no events call');
    assert.equal(ev.url, 'https://api.followupboss.com/v1/events');
    assert.ok(!calls.some((c) => c.url.includes('/v1/people')));
  });
  check('uses HTTP Basic auth, key not in the URL', () => {
    assert.match(ev.headers.Authorization, /^Basic /);
    assert.ok(!ev.url.includes('test-key-not-real'));
  });

  check('firstName maps to firstName', () => assert.equal(ev.body.person.firstName, 'Dana'));
  check('lastName maps to lastName', () => assert.equal(ev.body.person.lastName, 'Ortiz'));
  check('email maps to person.emails', () =>
    assert.equal(ev.body.person.emails[0].value, 'dana.ortiz@example.com'));
  check('phone maps to person.phones', () =>
    assert.equal(ev.body.person.phones[0].value, '(714) 555-0142'));

  // The whole point of the note: the timeline must not pollute contact fields.
  check('timeline is NOT in firstName / lastName / email / phone', () => {
    const contact = JSON.stringify([
      ev.body.person.firstName,
      ev.body.person.lastName,
      ev.body.person.emails,
      ev.body.person.phones,
    ]);
    assert.ok(!contact.includes('3-6 months'), `timeline leaked into contact fields: ${contact}`);
  });

  check('source identifies the landing page, not the ad', () =>
    assert.equal(ev.body.source, 'sell.wilandliz.com'));
  check('system identifies this site', () =>
    assert.equal(ev.body.system, 'Wil & Liz Seller Landing Page'));
  check('event type is a seller lead type', () =>
    assert.equal(ev.body.type, 'Seller Inquiry'));
  check('ad source is preserved as a tag', () =>
    assert.ok(ev.body.person.tags.includes('Source: facebook / seller_q4')));

  /* ---- the note ---- */
  const note = noteCall();
  check('creates a note', () => {
    assert.ok(note, 'no note call');
    assert.equal(note.url, 'https://api.followupboss.com/v1/notes');
    assert.equal(note.method, 'POST');
  });
  check('note attaches to the person id from the event response', () =>
    assert.equal(note.body.personId, 55501));
  check('note subject names the landing page', () =>
    assert.equal(note.body.subject, 'Seller Lead from Wil & Liz Seller Landing Page'));
  check('note body shows the timeline', () =>
    assert.match(note.body.body, /^Timeline: 3-6 months$/m));
  check('note body carries the property address', () =>
    assert.match(note.body.body, /1420 Camino Real, Fullerton, CA 92835/));
  check('note body carries the rest of the step-2 detail', () => {
    assert.match(note.body.body, /Name: Dana Ortiz/);
    assert.match(note.body.body, /Email: dana\.ortiz@example\.com/);
    assert.match(note.body.body, /Phone: \(714\) 555-0142/);
  });
  check('note body carries marketing attribution', () => {
    assert.match(note.body.body, /utm_campaign: seller_q4/);
    assert.match(note.body.body, /fbclid: IwAR_test123/);
  });
  check('note is sent after the event, not before', () => {
    assert.ok(calls.indexOf(ev) < calls.indexOf(note));
  });
}

/* ========================================================================== */
/* 2. Person id in other documented-adjacent shapes                           */
/* ========================================================================== */
for (const [label, body, expected] of [
  ['top-level id', { id: 900 }, 900],
  ['nested person.id', { person: { id: 901 } }, 901],
  ['personId', { personId: 902 }, 902],
  ['id as a string', { id: '903' }, 903],
]) {
  stubFetch((c) => (c.url.includes('/v1/events') ? json(200, body) : json(200, {})));
  await handleLead(validLead());
  check(`finds the person id from ${label}`, () =>
    assert.equal(noteCall()?.body.personId, expected));
}

/* ========================================================================== */
/* 3. No person id, and 204 — lead still succeeds, no bogus note              */
/* ========================================================================== */
{
  stubFetch((c) => (c.url.includes('/v1/events') ? json(200, { ok: true }) : json(200, {})));
  const result = await handleLead(validLead());
  check('no person id: lead still reported as delivered', () =>
    assert.equal(result.status, 200));
  check('no person id: no note attempted', () => assert.equal(noteCall(), undefined));
}
{
  stubFetch((c) =>
    c.url.includes('/v1/events') ? new Response(null, { status: 204 }) : json(200, {}),
  );
  const result = await handleLead(validLead());
  check('204 (lead flow archived) counts as delivered', () => assert.equal(result.status, 200));
  check('204: no note attempted', () => assert.equal(noteCall(), undefined));
}

/* ========================================================================== */
/* 4. Failure paths                                                           */
/* ========================================================================== */
{
  stubFetch(() => json(400, { errorMessage: 'bad' }));
  const result = await handleLead(validLead());
  check('rejected lead returns a failure', () => assert.equal(result.status, 502));
  check('rejected lead does NOT create a note', () => assert.equal(noteCall(), undefined));
  check('failure body leaks nothing technical', () =>
    assert.deepEqual(result.body, { ok: false }));
}
{
  stubFetch(() => {
    throw new Error('socket hang up');
  });
  const result = await handleLead(validLead());
  check('network error returns a failure', () => assert.equal(result.status, 502));
  check('network error creates no note', () => assert.equal(noteCall(), undefined));
}
{
  // The note failing must not tell the visitor their submission failed.
  stubFetch((c) =>
    c.url.includes('/v1/events') ? json(201, { id: 77 }) : json(500, { error: 'nope' }),
  );
  const result = await handleLead(validLead());
  check('note failure does NOT fail the lead', () => assert.equal(result.status, 200));
  check('note failure was still attempted', () => assert.ok(noteCall()));
}

/* ========================================================================== */
/* 5. Optional timeline                                                       */
/* ========================================================================== */
{
  stubFetch((c) => (c.url.includes('/v1/events') ? json(201, { id: 81 }) : json(200, {})));
  const result = await handleLead(validLead({ timeline: '' }));
  check('submits with no timeline', () => assert.equal(result.status, 200));
  check('note records the timeline as not specified', () =>
    assert.match(noteCall().body.body, /^Timeline: Not specified$/m));
  check('tags mark the timeline as unspecified', () =>
    assert.ok(eventsCall().body.person.tags.includes('Timeline: not specified')));
}
{
  stubFetch((c) => (c.url.includes('/v1/events') ? json(201, { id: 82 }) : json(200, {})));
  const result = await handleLead(validLead({ timeline: 'Just curious about my home value' }));
  check('submits with the "just curious" option', () => assert.equal(result.status, 200));
  check('note spells out that they are not selling', () =>
    assert.match(noteCall().body.body, /Timeline: Not selling — just curious about home value/));
  check('tagged distinctly from a listing lead', () =>
    assert.ok(eventsCall().body.person.tags.includes('Curious — not selling yet')));
}

/* ========================================================================== */
/* 6. Validation and configuration guards                                     */
/* ========================================================================== */
{
  stubFetch(() => json(201, { id: 1 }));
  const result = await handleLead(validLead({ email: 'not-an-email' }));
  check('invalid email is rejected before any API call', () => {
    assert.equal(result.status, 400);
    assert.equal(calls.length, 0);
  });
}
{
  stubFetch(() => json(201, { id: 1 }));
  const result = await handleLead(validLead({ timeline: 'whenever i feel like it' }));
  check('a tampered timeline value is rejected', () => {
    assert.equal(result.status, 400);
    assert.equal(calls.length, 0);
  });
}
{
  const saved = process.env.FOLLOW_UP_BOSS_API_KEY;
  delete process.env.FOLLOW_UP_BOSS_API_KEY;
  stubFetch(() => json(201, { id: 1 }));
  const result = await handleLead(validLead());
  check('missing API key fails closed, with no API call', () => {
    assert.equal(result.status, 500);
    assert.equal(calls.length, 0);
  });
  process.env.FOLLOW_UP_BOSS_API_KEY = saved;
}

/* ========================================================================== */
/* 7. Duplicate suppression                                                   */
/* ========================================================================== */
{
  stubFetch((c) => (c.url.includes('/v1/events') ? json(201, { id: 90 }) : json(200, {})));
  const lead = validLead();
  const first = await handleLead(lead);
  const second = await handleLead(lead);
  check('a repeated submission still reports success', () => {
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
  });
  check('but only one event reaches Follow Up Boss', () =>
    assert.equal(calls.filter((c) => c.url.includes('/v1/events')).length, 1));
  check('and only one note', () =>
    assert.equal(calls.filter((c) => c.url.includes('/v1/notes')).length, 1));
}

/* -------------------------------- report --------------------------------- */
const failed = results.filter((r) => !r.pass);
for (const r of results) {
  console.log(`${r.pass ? '  ✓' : '  ✗'} ${r.name}${r.detail ? '  → ' + r.detail : ''}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
