/**
 * Meta Pixel.
 *
 * Contract enforced here:
 *  - PageView fires once, on landing-page load.
 *  - The Lead event fires ONLY after the server has confirmed the lead reached
 *    Follow Up Boss. Never on CTA click, step change, or page load.
 *  - Lead is deduplicated three ways: an in-memory guard (double click),
 *    a sessionStorage guard (refresh / back button), and an eventID passed to
 *    Meta so a future server-side Conversions API event collapses into the
 *    same conversion instead of counting twice.
 */

import { META_PIXEL_ID, META_LEAD_EVENT } from '@/config';

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void };
    _fbq?: unknown;
  }
}

const LEAD_FIRED_KEY = 'wl_lead_fired_v1';
let leadFiredThisPageLoad = false;

/** Injects the official Meta Pixel snippet and fires PageView exactly once. */
export function initPixel(): void {
  if (typeof window === 'undefined' || window.fbq) return;

  /* eslint-disable */
  // Official Meta Pixel base code.
  (function (f: any, b: any, e: string, v: string) {
    let n: any, t: any, s: any;
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  // Re-read off `window` — the snippet above installed fbq imperatively, which
  // TypeScript's control-flow analysis can't see.
  const fbq = (window as Window).fbq;
  fbq?.('init', META_PIXEL_ID);
  fbq?.('track', 'PageView');
}

function alreadyFired(): boolean {
  if (leadFiredThisPageLoad) return true;
  try {
    return sessionStorage.getItem(LEAD_FIRED_KEY) === '1';
  } catch {
    return false;
  }
}

function markFired(): void {
  leadFiredThisPageLoad = true;
  try {
    sessionStorage.setItem(LEAD_FIRED_KEY, '1');
  } catch {
    /* no-op */
  }
}

/**
 * Fire the completed-lead conversion. Call this ONLY from the success branch of
 * a confirmed CRM submission. Safe to call more than once; it no-ops after the
 * first successful fire.
 *
 * @param eventId Same ID sent to the backend, for Meta's deduplication.
 */
export function trackLead(eventId: string): void {
  if (alreadyFired()) return;
  markFired();
  window.fbq?.('track', META_LEAD_EVENT, {}, { eventID: eventId });
}

/** Exposed for tests / QA so a fresh run can re-fire in a dev session. */
export function resetLeadGuard(): void {
  leadFiredThisPageLoad = false;
  try {
    sessionStorage.removeItem(LEAD_FIRED_KEY);
  } catch {
    /* no-op */
  }
}
