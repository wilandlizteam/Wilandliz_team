/**
 * Captures Meta / UTM advertising attribution on first page load and keeps it
 * for the whole session, so it survives the step-1 -> step-2 transition and a
 * page refresh, then rides along with the lead to the CRM.
 */

const STORAGE_KEY = 'wl_attribution_v1';

const TRACKED_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
] as const;

export type Attribution = Partial<Record<(typeof TRACKED_PARAMS)[number], string>> & {
  landingPage?: string;
  referrer?: string;
  /** Meta browser cookies, useful later if server-side Conversions API is added. */
  fbp?: string;
  fbc?: string;
};

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : undefined;
}

function safeGet(): Attribution | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

function safeSet(value: Attribution) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* private browsing — attribution just won't survive a refresh */
  }
}

/**
 * Reads attribution from the URL the visitor landed on. Called once at boot.
 * Existing stored values win, so a mid-session navigation can't overwrite the
 * original ad click.
 */
export function captureAttribution(): Attribution {
  const stored = safeGet();
  if (stored) return stored;

  const params = new URLSearchParams(window.location.search);
  const data: Attribution = {};

  for (const key of TRACKED_PARAMS) {
    const value = params.get(key);
    if (value) data[key] = value.slice(0, 300);
  }

  data.landingPage = window.location.href.slice(0, 500);
  if (document.referrer) data.referrer = document.referrer.slice(0, 500);

  safeSet(data);
  return data;
}

/** Re-read at submit time so the Meta cookies (set by the pixel) are included. */
export function getAttribution(): Attribution {
  const data = safeGet() ?? captureAttribution();
  return {
    ...data,
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
  };
}

/** Human-readable lead source for the CRM. */
export function describeSource(a: Attribution): string {
  if (a.utm_source) return `${a.utm_source}${a.utm_campaign ? ` / ${a.utm_campaign}` : ''}`;
  if (a.fbclid || a.fbp) return 'Facebook / Instagram Ad';
  return 'Wil & Liz Seller Landing Page';
}
