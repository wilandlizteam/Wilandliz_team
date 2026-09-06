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
 *
 * API contract used (verified against Follow Up Boss documentation):
 *   POST https://api.followupboss.com/v1/events
 *   Auth: HTTP Basic — API key as the username, empty password
 *   Success: 201 (person + event created) | 200 (existing person updated)
 *            204 (lead flow archived — FUB accepted it and chose to ignore it)
 * ---------------------------------------------------------------------------
 */

const FUB_EVENTS_URL = 'https://api.followupboss.com/v1/events';

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
const ALLOWED_TIMELINES = new Set(['0-3 months', '3-6 months', '6-12 months']);

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
    source: str(raw.source, 120) || 'Wil & Liz Seller Landing Page',
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

  const tags = ['Seller Lead', 'Landing Page', `Timeline: ${lead.timeline}`];
  if (process.env.FUB_ASSIGNED_TAG) tags.push(process.env.FUB_ASSIGNED_TAG);

  const message = [
    `Seller lead from the Wil & Liz landing page.`,
    ``,
    `Property address: ${lead.propertyAddress}`,
    `Selling timeline: ${lead.timeline}`,
    ...(attributionLines.length ? ['', 'Marketing attribution:', ...attributionLines] : []),
  ].join('\n');

  const payload = {
    source: lead.source,
    system: process.env.FUB_SYSTEM || undefined,
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
    return { status: 200, body: { ok: true } };
  }

  // Roll back the dedupe entry so the visitor's retry is actually attempted.
  if (lead.submissionId) recentSubmissions.delete(lead.submissionId);

  const detail = await response.text().catch(() => '');
  console.error(`[lead] Follow Up Boss rejected the lead (${response.status}): ${detail}`);
  return { status: 502, body: { ok: false } };
}
