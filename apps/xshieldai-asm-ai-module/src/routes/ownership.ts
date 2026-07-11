// LakshmanRekha — Endpoint ownership challenge routes
// @rule:ASMAI-P2-003 — ownership is PROVEN (dns_txt / http_well_known / fleet_internal),
// recorded as method + timestamp + observation, never a bare asserted boolean.
// @rule:ASMAI-S-006 — the scan gate consumes the verified flag this flow sets.
// @rule:CA-004 — _meta on all responses

import { readFileSync } from 'fs';
import { createHash, randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';

import type { FastifyInstance } from 'fastify';

import {
  createOwnershipChallenge,
  getChallengeHistory,
  getEndpoint,
  getOpenChallenge,
  hashSnippet,
  markEndpointOwnershipVerified,
  resolveChallenge,
} from '../core/db.js';

const TOKEN_PREFIX = 'lrk-verify-';

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

// Every numeric leaf in ports.json is a fleet port — the authority file is the allowlist.
function fleetPorts(): Set<number> {
  const ports = new Set<number>();
  try {
    const walk = (v: unknown) => {
      if (Number.isInteger(v)) ports.add(v as number);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(JSON.parse(readFileSync('/root/.ankr/config/ports.json', 'utf8')));
  } catch {
    /* authority unreadable — empty set, fleet_internal cannot verify */
  }
  return ports;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export async function ownershipRoutes(app: FastifyInstance) {
  // POST /api/v1/lrk/endpoints/:id/ownership/challenge — issue a challenge token
  app.post<{ Params: { id: string }; Body: { customer_id: string } }>(
    '/api/v1/lrk/endpoints/:id/ownership/challenge',
    async (req, reply) => {
      const t0 = Date.now();
      const { customer_id } = req.body ?? {};
      if (!customer_id) return reply.status(400).send({ error: 'customer_id required' });

      const endpoint = getEndpoint(req.params.id);
      if (!endpoint) return reply.status(404).send({ error: 'endpoint not found' });
      if (endpoint.customer_id !== customer_id) {
        return reply.status(403).send({ error: 'endpoint does not belong to this customer' });
      }

      const existing = getOpenChallenge(endpoint.id);
      const challenge =
        existing ??
        createOwnershipChallenge(endpoint.id, TOKEN_PREFIX + randomBytes(12).toString('hex'));

      return reply.status(existing ? 200 : 201).send({
        challenge_id: challenge.id,
        token: challenge.token,
        expires_at: challenge.expires_at,
        prove_via: {
          dns_txt: `TXT record ${challenge.token} at _lrk-challenge.<your-endpoint-host>`,
          http_well_known: `serve ${challenge.token} at <your-endpoint-origin>/.well-known/lrk-challenge.txt`,
          fleet_internal:
            'no token needed — localhost endpoints on a ports.json-registered port auto-verify',
        },
        verify: `POST /api/v1/lrk/endpoints/${endpoint.id}/ownership/verify`,
        _meta: {
          computed_at: new Date().toISOString(),
          duration_ms: Date.now() - t0,
          trust_mask_applied: 1,
        },
      });
    }
  );

  // POST /api/v1/lrk/endpoints/:id/ownership/verify — prove control
  app.post<{
    Params: { id: string };
    Body: {
      customer_id: string;
      endpoint_url: string;
      method: 'dns_txt' | 'http_well_known' | 'fleet_internal';
    };
  }>('/api/v1/lrk/endpoints/:id/ownership/verify', async (req, reply) => {
    const t0 = Date.now();
    const { customer_id, endpoint_url, method } = req.body ?? {};
    if (!customer_id || !endpoint_url || !method) {
      return reply.status(400).send({ error: 'customer_id, endpoint_url, method required' });
    }

    const endpoint = getEndpoint(req.params.id);
    if (!endpoint) return reply.status(404).send({ error: 'endpoint not found' });
    if (endpoint.customer_id !== customer_id) {
      return reply.status(403).send({ error: 'endpoint does not belong to this customer' });
    }

    // Prove-you-know-the-URL: the raw URL was never stored, only its hash (ASMAI-P2-003).
    // This also pins the host the SSRF-guarded probes below are allowed to touch.
    if (hashSnippet(endpoint_url) !== endpoint.endpoint_url_hash) {
      return reply.status(403).send({
        error: 'endpoint_url does not match the registered endpoint',
        code: 'URL_HASH_MISMATCH',
        rule: 'ASMAI-P2-003',
      });
    }

    let url: URL;
    try {
      url = new URL(endpoint_url);
    } catch {
      return reply.status(400).send({ error: 'endpoint_url is not a valid URL' });
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return reply.status(400).send({ error: 'only http/https endpoints supported' });
    }

    const mark = (proofDetail: string) => {
      markEndpointOwnershipVerified(endpoint.id, method, sha256(endpoint_url));
      const open = getOpenChallenge(endpoint.id);
      if (open) resolveChallenge(open.id, 'verified', method, proofDetail);
    };
    const failWith = (proofDetail: string, error: string) => {
      const open = getOpenChallenge(endpoint.id);
      if (open) resolveChallenge(open.id, 'failed', method, proofDetail);
      return reply
        .status(403)
        .send({ error, code: 'OWNERSHIP_PROOF_FAILED', rule: 'ASMAI-P2-003' });
    };

    if (method === 'fleet_internal') {
      const port = url.port ? parseInt(url.port, 10) : NaN;
      if (LOCAL_HOSTS.has(url.hostname) && fleetPorts().has(port)) {
        mark(`localhost:${port} present in ports.json authority`);
      } else {
        return failWith(
          `host=${url.hostname} port=${url.port || '(default)'} not a registered fleet port`,
          'not a fleet-internal endpoint (must be localhost on a ports.json-registered port)'
        );
      }
    } else {
      // Token methods need an open, unexpired challenge
      const challenge = getOpenChallenge(endpoint.id);
      if (!challenge) {
        return reply.status(422).send({
          error: 'no open challenge — issue one first',
          challenge: `POST /api/v1/lrk/endpoints/${endpoint.id}/ownership/challenge`,
        });
      }

      if (method === 'dns_txt') {
        try {
          const records = await resolveTxt(`_lrk-challenge.${url.hostname}`);
          const found = records.some((chunks) => chunks.join('').includes(challenge.token));
          if (!found) {
            return failWith(
              `TXT _lrk-challenge.${url.hostname} did not contain token`,
              'challenge token not found in DNS TXT record'
            );
          }
          mark(`TXT _lrk-challenge.${url.hostname} contained token`);
        } catch (e) {
          return failWith(
            `DNS resolution failed: ${e instanceof Error ? e.message : String(e)}`,
            'DNS TXT lookup failed'
          );
        }
      } else {
        // http_well_known — host pinned by the hash match above; no redirects, small read
        const probeUrl = `${url.origin}/.well-known/lrk-challenge.txt`;
        try {
          const r = await fetch(probeUrl, {
            redirect: 'manual',
            signal: AbortSignal.timeout(5000),
          });
          if (!r.ok)
            return failWith(`GET ${probeUrl} → HTTP ${r.status}`, 'well-known probe failed');
          const body = (await r.text()).slice(0, 1024);
          if (!body.includes(challenge.token)) {
            return failWith(`GET ${probeUrl} body did not contain token`, 'token not served');
          }
          mark(`GET ${probeUrl} served token`);
        } catch (e) {
          return failWith(
            `fetch failed: ${e instanceof Error ? e.message : String(e)}`,
            'well-known probe unreachable'
          );
        }
      }
    }

    const updated = getEndpoint(endpoint.id)!;
    return reply.status(200).send({
      endpoint_id: updated.id,
      ownership_verified: updated.ownership_verified,
      ownership_method: updated.ownership_method,
      ownership_verified_at: updated.ownership_verified_at,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    });
  });

  // GET /api/v1/lrk/endpoints/:id/ownership — current proof status
  app.get<{ Params: { id: string } }>('/api/v1/lrk/endpoints/:id/ownership', async (req, reply) => {
    const t0 = Date.now();
    const endpoint = getEndpoint(req.params.id);
    if (!endpoint) return reply.status(404).send({ error: 'endpoint not found' });
    return {
      endpoint_id: endpoint.id,
      ownership_verified: endpoint.ownership_verified,
      ownership_method: endpoint.ownership_method,
      ownership_verified_at: endpoint.ownership_verified_at,
      open_challenge: getOpenChallenge(endpoint.id),
      history: getChallengeHistory(endpoint.id),
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    };
  });
}
