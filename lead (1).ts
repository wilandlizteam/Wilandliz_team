/**
 * Vercel serverless function — POST /api/lead
 *
 * The browser posts the lead here; this function adds the Follow Up Boss
 * credential (from an environment variable) and forwards it. The key never
 * leaves the server.
 *
 * The request/response shapes are declared locally rather than imported from
 * `@vercel/node`. That package was pulled in for two type names only, and it
 * dragged five known vulnerabilities and a large install into every deploy.
 * These structural types describe exactly what this handler touches, so they
 * satisfy the runtime's actual contract without the dependency.
 */

import { handleLead, type LeadPayload } from './_lib/lead-core';

type NodeRequest = {
  method?: string;
  body?: unknown;
};

type NodeResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): unknown };
};

export default async function handler(req: NodeRequest, res: NodeResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  const body: LeadPayload =
    typeof req.body === 'string'
      ? safeParse(req.body)
      : ((req.body ?? {}) as LeadPayload);

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
