/**
 * Vercel serverless function — POST /api/lead
 *
 * The browser posts the lead here; this function adds the Follow Up Boss
 * credential (from an environment variable) and forwards it. The key never
 * leaves the server.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleLead, type LeadPayload } from './_lib/lead-core';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  const body: LeadPayload =
    typeof req.body === 'string' ? safeParse(req.body) : (req.body ?? {});

  const result = await handleLead(body);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(result.status).json(result.body);
}

function safeParse(raw: string): LeadPayload {
  try {
    return JSON.parse(raw) as LeadPayload;
  } catch {
    return {};
  }
}
