/**
 * Netlify Functions equivalent of api/lead.ts.
 * Only needed if you deploy to Netlify instead of Vercel — netlify.toml
 * redirects /api/lead to this function so the frontend is unchanged.
 */

import { handleLead, type LeadPayload } from '../../api/_lib/lead-core.ts';

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }

  const body = (await request.json().catch(() => ({}))) as LeadPayload;
  const result = await handleLead(body);

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
