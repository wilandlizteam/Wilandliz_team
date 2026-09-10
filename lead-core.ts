/**
 * ---------------------------------------------------------------------------
 * LEAD → FOLLOW UP BOSS  (server only)
 * ---------------------------------------------------------------------------
 * This module runs exclusively on the server. It is the only place the Follow
 * Up Boss credential is ever read, and it is never imported from src/.
 *
 * Required environment variable:
 *   FOLLOW_UP_BOSS_API_KEY   your Follow Up Boss API key
 *
 * Optional environment variables:
 *   FUB_SYSTEM               X-System header value  (only if you have registered
 *   FUB_SYSTEM_KEY           X-System-Key header value   an integration with FUB)
 *   FUB_LEAD_TYPE            defaults to "Seller Inquiry"
 *   FUB_ASSIGNED_TAG         extra tag added to every person, e.g. "Seller LP"
 *   FUB_SOURCE               lead source recorded in FUB; defaults to the
 *                            landing page's own hostname, else the site name
 *
 * API contract used (verified against Follow Up Boss documentation):
 *
 *   POST https://api.followupboss.com/v1/events
 *     Auth: HTTP Basic — API key as the username, empty password
 *     Success: 201 (person + event created) | 200 (existing person updated)
 *              204 (lead flow archived — FUB accepted it and chose to ignore it)
 *     Using /v1/events rather than /v1/people is what lets Follow Up Boss match
 *     an existing contact instead of creating a duplicate.
 *
 *   POST https://api.followupboss.com/v1/notes
 *     Body: { personId (required, int), subject, body, isHtml }
 *     Success: 200
 *     The note carries the timeline and the rest of the step-2 detail, so none
 *     of it has to be crammed into the name, email or phone fields.
 * ---------------------------------------------------------------------------
 */

const FUB_EVENTS_URL = 'https://api.followupboss.com/v1/events';
const FUB_NOTES_URL = 'https://api.followupboss.com/v1/notes';

export type LeadPayload = {
  submissionId?: unknown;
  propertyAddress?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  timeline?: unknown;
  source?: unknown;
  attribution?: unknown;
};

export type CoreResult = {
  status: number;
  body: { ok: boolean; message?: string };
};

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
/*
 * The selling timeline is OPTIONAL — an empty value is valid. The page serves
 * homeowners who are only curious what their home is worth, not just those
 * ready to list. Anything outside this set is rejected so a tampered request
 * cannot write arbitrary text into the CRM.
 */
const ALLOWED_TIMELINES = new Set([
  '',
  '0-3 months',
  '3-6 months',
  '6-12 months',
  'Just curious about my home value',
]);

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * Best-effort duplicate suppression for retries.
 *
 * Serverless instances are recycled, so this only catches repeats that land on
 * a warm instance — which covers the realistic case (a visitor tapping the
 * button again seconds after a timeout). Follow Up Boss additionally matches
 * people by email, so a retry updates the existing contact rather than
 * creating a second one. For hard guarantees across instances, swap this Map
 * for Vercel KV / Upstash Redis keyed on the same submissionId.
 */
const recentSubmissions = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

function seenRecently(id: string): boolean {
  const now = Date.now();
  for (const [key, at] of recentSubmissions) {
    if (now - at > DEDUPE_WINDOW_MS) recentSubmissions.delete(key);
  }
  if (recentSubmissions.has(id)) return true;
  recentSubmissions.set(id, now);
  return false;
}

export async function handleLead(raw: LeadPayload): Promise<CoreResult> {
  const apiKey = process.env.FOLLOW_UP_BOSS_API_KEY;
  if (!apiKey) {
    // Configuration fault. Never leak detail to the browser, but make it
    // unmissable in the function logs.
    console.error('[lead] FOLLOW_UP_BOSS_API_KEY is not set — lead was NOT delivered.');
    return { status: 500, body: { ok: false } };
  }

  /* ----------------------------- validate ------------------------------- */

  const lead = {
    submissionId: str(raw.submissionId, 64),
    propertyAddress: str(raw.propertyAddress, 300),
    firstName: str(raw.firstName, 80),
    lastName: str(raw.lastName, 80),
    email: str(raw.email, 200),
    phone: str(raw.phone, 40),
    timeline: str(raw.timeline, 40),
    /* What the visitor's ad click said. Recorded in the note and as a tag —
       NOT used as the FUB source, which identifies the landing page itself. */
    adSource: str(raw.source, 120),
  };

  const problems: string[] = [];
  if (!lead.propertyAddress) problems.push('property address');
  if (!lead.firstName) problems.push('first name');
  if (!lead.lastName) problems.push('last name');
  if (!EMAIL_RE.test(lead.email)) problems.push('email address');
  if (lead.phone.replace(/\D/g, '').length < 10) problems.push('phone number');
  if (!ALLOWED_TIMELINES.has(lead.timeline)) problems.push('selling timeline');


  if (problems.length) {
    return {
      status: 400,
      body: { ok: false, message: `Please check your ${problems.join(', ')}.` },
    };
  }

  if (lead.submissionId && seenRecently(lead.submissionId)) {
    // Already delivered. Report success so the visitor sees the confirmation
    // they have earned, without a second record being created.
    return { status: 200, body: { ok: true } };
  }

  /* ------------------------- shape for the CRM -------------------------- */

  const attribution = (
    raw.attribution && typeof raw.attribution === 'object' ? raw.attribution : {}
  ) as Record<string, string>;

  const attributionLines = Object.entries(attribution)
    .filter(([, v]) => typeof v === 'string' && v)
    .map(([k, v]) => `${k}: ${v}`);

  /*
   * FUB "source" identifies where the lead came from as a system — this landing
   * page. The ad campaign that drove the click is richer than a single string,
   * so it rides along in the note and the tags instead of overwriting this.
   */
  let landingHost = '';
  try {
    if (attribution.landingPage) landingHost = new URL(attribution.landingPage).hostname;
  } catch {
    /* malformed URL from the browser — fall through to the default name */
  }
  const source = process.env.FUB_SOURCE || landingHost || 'Wil & Liz Seller Landing Page';
  const system = process.env.FUB_SYSTEM || 'Wil & Liz Seller Landing Page';

  /*
   * Tagging. A blank timeline gets no timeline tag rather than an empty one,
   * and "just curious" is tagged distinctly so the team can tell a research
   * enquiry from a listing lead in Follow Up Boss.
   */
  const justCurious = lead.timeline === 'Just curious about my home value';
  const tags = ['Home Value Lead', 'Landing Page'];
  if (lead.timeline) {
    tags.push(justCurious ? 'Curious — not selling yet' : `Timeline: ${lead.timeline}`);
  } else {
    tags.push('Timeline: not specified');
  }
  if (lead.adSource) tags.push(`Source: ${lead.adSource}`);
  if (process.env.FUB_ASSIGNED_TAG) tags.push(process.env.FUB_ASSIGNED_TAG);

  const message = [
    `Home value request from the Wil & Liz landing page.`,
    ``,
    `Property address: ${lead.propertyAddress}`,
    `Selling timeline: ${
      justCurious
        ? 'Not selling — curious about home value'
        : lead.timeline || 'Not specified'
    }`,
    ...(attributionLines.length ? ['', 'Marketing attribution:', ...attributionLines] : []),
  ].join('\n');

  /*
   * The note. Everything step 2 collected beyond the four contact fields lives
   * here, spelled out, so nothing has to be squeezed into firstName, lastName,
   * email or phone — those stay exactly what the visitor typed.
   */
  const noteBody = [
    `Timeline: ${
      justCurious
        ? "Not selling — just curious about home value"
        : lead.timeline || 'Not specified'
    }`,
    ``,
    `Additional information:`,
    `Property address: ${lead.propertyAddress}`,
    `Name: ${lead.firstName} ${lead.lastName}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone}`,
    ...(lead.adSource ? ['', `Lead source: ${lead.adSource}`] : []),
    ...(attributionLines.length ? ['', 'Marketing attribution:', ...attributionLines] : []),
  ].join('\n');

  const payload = {
    source,
    system,
    type: process.env.FUB_LEAD_TYPE || 'Seller Inquiry',
    message,
    person: {
      firstName: lead.firstName,
      lastName: lead.lastName,
      emails: [{ value: lead.email, type: 'home' }],
      phones: [{ value: lead.phone, type: 'mobile' }],
      addresses: [{ street: lead.propertyAddress, type: 'home' }],
      tags,
      sourceUrl: attribution.landingPage,
    },
    property: {
      street: lead.propertyAddress,
      type: 'Residential',
    },
  };

  /* ------------------------------- send --------------------------------- */

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    // API key as the username, blank password, per the FUB auth docs.
    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
  };
  if (process.env.FUB_SYSTEM) headers['X-System'] = process.env.FUB_SYSTEM;
  if (process.env.FUB_SYSTEM_KEY) headers['X-System-Key'] = process.env.FUB_SYSTEM_KEY;

  let response: Response;
  try {
    response = await fetch(FUB_EVENTS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (lead.submissionId) recentSubmissions.delete(lead.submissionId);
    console.error('[lead] Network error reaching Follow Up Boss:', error);
    return { status: 502, body: { ok: false } };
  }

  // 200 updated an existing person, 201 created one, 204 means FUB accepted the
  // lead and archived it by lead-flow rules. All three are "we have it".
  if (response.status === 200 || response.status === 201 || response.status === 204) {
    // The lead is delivered. The note is a best-effort enrichment on top of it:
    // if it fails, the visitor has still been captured and must still be told
    // the submission worked.
    const personId = await readPersonId(response);
    if (personId !== null) {
      await attachNote(personId, headers, noteBody);
    } else if (response.status !== 204) {
      console.warn(
        '[lead] Lead delivered, but no person id was found in the Follow Up Boss ' +
          'response, so the note could not be attached.',
      );
    }
    return { status: 200, body: { ok: true } };
  }

  // Roll back the dedupe entry so the visitor's retry is actually attempted.
  if (lead.submissionId) recentSubmissions.delete(lead.submissionId);

  const detail = await response.text().catch(() => '');
  console.error(`[lead] Follow Up Boss rejected the lead (${response.status}): ${detail}`);
  return { status: 502, body: { ok: false } };
}

/**
 * Pulls the person id out of an events response.
 *
 * Follow Up Boss documents this response only as "nearly identical to the
 * response received from the v1/people request for the same contact", without
 * pinning the shape, so rather than assume one path this checks the plausible
 * ones and gives up quietly if none is present. A 204 carries no body at all.
 */
async function readPersonId(response: Response): Promise<number | null> {
  if (response.status === 204) return null;

  let data: unknown;
  try {
    data = await response.clone().json();
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const shape = data as Record<string, unknown>;
  const candidates: unknown[] = [
    shape.id,
    shape.personId,
    (shape.person as Record<string, unknown> | undefined)?.id,
  ];

  for (const value of candidates) {
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n === 'number' && Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

/**
 * Attaches the step-2 detail to the contact as a Follow Up Boss note.
 *
 * Never throws and never changes the caller's result: the lead itself has
 * already landed, and a missing note is not worth telling the visitor their
 * submission failed. Problems are logged for whoever is debugging.
 */
async function attachNote(
  personId: number,
  headers: Record<string, string>,
  body: string,
): Promise<void> {
  try {
    const noteResponse = await fetch(FUB_NOTES_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        personId,
        subject: 'Seller Lead from Wil & Liz Seller Landing Page',
        body,
        isHtml: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!noteResponse.ok) {
      const detail = await noteResponse.text().catch(() => '');
      console.error(
        `[lead] Lead delivered, but the note failed for person ${personId} ` +
          `(${noteResponse.status}): ${detail}`,
      );
    }
  } catch (error) {
    console.error(`[lead] Lead delivered, but the note request threw for person ${personId}:`, error);
  }
}
