import { LEAD_ENDPOINT } from '@/config';
import { describeSource, getAttribution } from './attribution';
import type { LeadDraft } from './validation';

export type SubmitResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Posts the lead to our own serverless endpoint, which is the only thing that
 * holds the Follow Up Boss credential. Returns ok:true ONLY when the server
 * confirms the CRM accepted the lead — the caller uses that to decide whether
 * to fire the Meta Lead event.
 *
 * @param submissionId Stable per completed form. Sent so a retry after a
 *   network timeout cannot create a second lead for the same person.
 */
export async function submitLead(
  draft: LeadDraft,
  submissionId: string,
): Promise<SubmitResult> {
  const attribution = getAttribution();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        submissionId,
        propertyAddress: draft.propertyAddress.trim(),
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        timeline: draft.timeline,
        source: describeSource(attribution),
        attribution,
      }),
    });

    if (response.ok) return { ok: true };

    // 4xx from our own validation is worth showing; anything else stays generic.
    if (response.status === 400) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      return {
        ok: false,
        message: body?.message ?? 'Please double-check your details and try again.',
      };
    }

    return {
      ok: false,
      message:
        "We couldn't send your request just now. Please try again — or call us and we'll take it down directly.",
    };
  } catch {
    return {
      ok: false,
      message:
        'That request timed out. Please check your connection and try again.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
