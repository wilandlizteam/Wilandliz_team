/** Shared field validation + formatting. Mirrored server-side in /api/lead.ts. */

export type LeadDraft = {
  propertyAddress: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  timeline: string;
};

export type FieldErrors = Partial<Record<keyof LeadDraft, string>>;

/**
 * Pragmatic email check. Deliberately not RFC-exhaustive — the goal is to catch
 * typos without rejecting valid addresses. Real verification happens on reply.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Formats as (555) 123-4567 while the user types. US/Canada shape. */
export function formatPhone(value: string): string {
  const d = digitsOnly(value).slice(0, 11);
  const n = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  if (n.length <= 3) return n;
  if (n.length <= 6) return `(${n.slice(0, 3)}) ${n.slice(3)}`;
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6, 10)}`;
}

export function validateAddress(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Please enter the property address.';
  if (v.length < 5) return 'Please enter a bit more of the address.';
  return undefined;
}

export function validateContact(draft: LeadDraft): FieldErrors {
  const errors: FieldErrors = {};

  if (!draft.firstName.trim()) errors.firstName = 'Please enter your first name.';
  if (!draft.lastName.trim()) errors.lastName = 'Please enter your last name.';

  const email = draft.email.trim();
  if (!email) errors.email = 'Please enter your email address.';
  else if (!EMAIL_RE.test(email)) errors.email = 'Please check your email address.';

  const phoneDigits = digitsOnly(draft.phone);
  if (!phoneDigits) errors.phone = 'Please enter your phone number.';
  else if (phoneDigits.length < 10) errors.phone = 'Please enter a 10-digit phone number.';

  if (!draft.timeline) errors.timeline = 'Please choose a timeline.';

  return errors;
}

/** RFC4122-ish id used for submission idempotency and Meta event dedup. */
export function createId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
