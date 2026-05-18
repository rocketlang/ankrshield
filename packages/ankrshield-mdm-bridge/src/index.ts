/**
 * @ankrshield/mdm-bridge
 *
 * Fastify plugin that wires AnkrShield device events into:
 *   - Microsoft Intune (Graph API)
 *   - VMware Workspace ONE (WS1 REST API v2)
 *
 * Usage:
 *   import { MdmBridgePlugin } from '@ankrshield/mdm-bridge';
 *   await fastify.register(MdmBridgePlugin, {
 *     intune: { tenantId, clientId, clientSecret, policyId },
 *     workspaceOne: { apiUrl, apiKey, username, password, ogId },
 *     adminKey: 'my-secret',
 *   });
 *
 * Routes registered (all under /mdm):
 *   POST /mdm/intune/policy       — receive Intune Graph webhook
 *   POST /mdm/intune/compliance   — push compliance for a device
 *   POST /mdm/ws1/policy          — receive WS1 webhook
 *   POST /mdm/ws1/compliance      — push compliance for a device
 *   POST /mdm/event               — receive AnkrShield device event (threat/scan/checkin)
 *   GET  /mdm/devices             — list enrolled devices (admin)
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IntuneConnector } from './IntuneConnector.js';
import { WorkspaceOneConnector } from './WorkspaceOneConnector.js';
import type {
  AnkrShieldDeviceState,
  BridgeEvent,
  IntuneConfig,
  WorkspaceOneConfig,
} from './types.js';

export { IntuneConnector } from './IntuneConnector.js';
export { WorkspaceOneConnector } from './WorkspaceOneConnector.js';
export type * from './types.js';

// ── In-memory device state store (replace with Redis/DB in production) ────────

const deviceStore = new Map<string, AnkrShieldDeviceState>();

// ── Plugin options ────────────────────────────────────────────────────────────

export interface MdmBridgeOptions {
  intune?: IntuneConfig;
  workspaceOne?: WorkspaceOneConfig;
  adminKey?: string;
}

// ── Fastify plugin ────────────────────────────────────────────────────────────

export const MdmBridgePlugin: FastifyPluginAsync<MdmBridgeOptions> = async (
  fastify: FastifyInstance,
  opts: MdmBridgeOptions
) => {
  const intuneConnector = opts.intune ? new IntuneConnector(opts.intune) : null;
  const ws1Connector = opts.workspaceOne ? new WorkspaceOneConnector(opts.workspaceOne) : null;
  const adminKey = opts.adminKey ?? process.env.MDM_ADMIN_KEY ?? 'ankr-mdm-admin';

  function requireAdmin(request: any, reply: any): boolean {
    const key = (request.headers['x-admin-key'] as string) ?? '';
    if (key !== adminKey) {
      reply.status(401).send({ error: 'Unauthorized' });
      return false;
    }
    return true;
  }

  // ── Intune: receive policy push ───────────────────────────────────────────
  fastify.post('/mdm/intune/policy', async (request: any, reply: any) => {
    if (!intuneConnector) {
      return reply.status(503).send({ error: 'Intune not configured' });
    }
    try {
      const policy = intuneConnector.receivePolicy(request.body as Record<string, unknown>);
      fastify.log.info({ policy }, 'Intune policy received');
      return reply.send({ ok: true, policy });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: msg });
    }
  });

  // ── Intune: report compliance ─────────────────────────────────────────────
  fastify.post('/mdm/intune/compliance', async (request: any, reply: any) => {
    if (!requireAdmin(request, reply)) return;
    if (!intuneConnector) {
      return reply.status(503).send({ error: 'Intune not configured' });
    }
    const state = request.body as AnkrShieldDeviceState;
    if (!state.deviceId) {
      return reply.status(400).send({ error: 'deviceId required' });
    }

    // Enrich with computed compliance details
    state.complianceDetails = IntuneConnector.buildComplianceDetails(state);
    state.isCompliant = state.complianceDetails.every((d) => d.pass || d.severity === 'info');

    deviceStore.set(state.deviceId, state);

    const result = await intuneConnector.reportCompliance(state);
    return reply.send({ ok: result.ok, intuneStatus: result.status, deviceId: state.deviceId });
  });

  // ── WS1: receive policy push ──────────────────────────────────────────────
  fastify.post('/mdm/ws1/policy', async (request: any, reply: any) => {
    if (!ws1Connector) {
      return reply.status(503).send({ error: 'Workspace ONE not configured' });
    }
    try {
      const policy = ws1Connector.receivePolicy(request.body as Record<string, unknown>);
      fastify.log.info({ policy }, 'WS1 policy received');
      return reply.send({ ok: true, policy });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: msg });
    }
  });

  // ── WS1: report compliance ────────────────────────────────────────────────
  fastify.post('/mdm/ws1/compliance', async (request: any, reply: any) => {
    if (!requireAdmin(request, reply)) return;
    if (!ws1Connector) {
      return reply.status(503).send({ error: 'Workspace ONE not configured' });
    }
    const state = request.body as AnkrShieldDeviceState;
    if (!state.deviceId) {
      return reply.status(400).send({ error: 'deviceId required' });
    }

    state.complianceDetails = IntuneConnector.buildComplianceDetails(state);
    state.isCompliant = state.complianceDetails.every((d) => d.pass || d.severity === 'info');
    deviceStore.set(state.deviceId, state);

    const result = await ws1Connector.reportCompliance(state);
    return reply.send({ ok: result.ok, ws1Status: result.status, deviceId: state.deviceId });
  });

  // ── Unified device event endpoint ─────────────────────────────────────────
  fastify.post('/mdm/event', async (request: any, reply: any) => {
    const event = request.body as BridgeEvent;
    if (!event.deviceId || !event.type) {
      return reply.status(400).send({ error: 'deviceId and type required' });
    }

    fastify.log.info({ event }, 'MDM bridge event received');

    // Update in-memory store
    const existing = deviceStore.get(event.deviceId) ?? ({} as Partial<AnkrShieldDeviceState>);

    if (event.type === 'device_checkin') {
      const updated: AnkrShieldDeviceState = {
        ...(existing as AnkrShieldDeviceState),
        deviceId: event.deviceId,
        lastCheckin: event.ts,
        ...(event.payload as Partial<AnkrShieldDeviceState>),
        isCompliant: false,
        complianceDetails: [],
      };
      updated.complianceDetails = IntuneConnector.buildComplianceDetails(updated);
      updated.isCompliant = updated.complianceDetails.every((d) => d.pass || d.severity === 'info');
      deviceStore.set(event.deviceId, updated);

      // Auto-push compliance to configured MDMs
      const pushes: Promise<unknown>[] = [];
      if (intuneConnector) pushes.push(intuneConnector.reportCompliance(updated).catch(() => null));
      if (ws1Connector) pushes.push(ws1Connector.reportCompliance(updated).catch(() => null));
      await Promise.all(pushes);
    }

    return reply.send({ ok: true, eventType: event.type });
  });

  // ── List enrolled devices (admin) ─────────────────────────────────────────
  fastify.get('/mdm/devices', async (request: any, reply: any) => {
    if (!requireAdmin(request, reply)) return;
    const devices = Array.from(deviceStore.values());
    return reply.send({ total: devices.length, devices });
  });

  // ── Health ────────────────────────────────────────────────────────────────
  fastify.get('/mdm/health', async (_request: any, reply: any) => {
    return reply.send({
      ok: true,
      intune: intuneConnector != null,
      workspaceOne: ws1Connector != null,
      deviceCount: deviceStore.size,
    });
  });
};
