/**
 * Action Dispatch Routes — the main "Act" API
 * @rule:XSACT-YK-001 Route by action type first
 * @rule:XSACT-003 Mode 3 always-on
 * @rule:CA-004 _meta in every response
 */

import type { FastifyInstance } from 'fastify';
import { dispatch, approvalQueue } from './handler.js';
import type { ActionType } from '../consent/types.js';
import type { ThreatSignal } from '../beacon/existential-classifier.js';

export async function registerDispatchRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/action/execute — main dispatch
  app.post<{
    Body: {
      client_id: string;
      threat: {
        id: string;
        type: string;
        target: string;
        target_confirmed_attacker_owned: boolean;
        signals: ThreatSignal[];
        registrar_abuse_email?: string;
        client_name?: string;
        evidence?: string;
      };
      requested_action: ActionType;
    };
  }>('/api/v1/action/execute', async (request, reply) => {
    const result = await dispatch(request.body);

    const statusCode = result.dispatched
      ? 200
      : result.pending_approval
        ? 202 // Accepted — awaiting approval
        : 403; // Blocked

    return reply.status(statusCode).send(result);
  });

  // POST /api/v1/action/approve/:queueId — Mode 1 human approval
  app.post<{ Params: { queueId: string } }>(
    '/api/v1/action/approve/:queueId',
    async (request, reply) => {
      const item = approvalQueue.get(request.params.queueId);

      if (!item) {
        return reply.status(404).send({ error: 'queue_item_not_found' });
      }
      if (item.approved) {
        return reply.status(409).send({ error: 'already_approved' });
      }

      item.approved = true;

      // Re-dispatch with Mode 2 semantics (standing order approved manually)
      const result = await dispatch(item.request);

      return { approved: true, queue_id: request.params.queueId, execution: result };
    }
  );

  // GET /api/v1/action/queue/:clientId — view pending approvals
  // @rule:CA-001 default limit 50 per page
  app.get<{ Params: { clientId: string }; Querystring: { limit?: string } }>(
    '/api/v1/action/queue/:clientId',
    async (request) => {
      const limit = Math.min(parseInt(request.query.limit ?? '50', 10), 200);
      const allPending = [...approvalQueue.entries()].filter(
        ([, v]) => v.request.client_id === request.params.clientId && !v.approved
      );
      const overflow_granthx_ref =
        allPending.length > limit
          ? `granthx://xshield-active/approval-queue/${request.params.clientId}/full`
          : undefined;
      const pending = allPending.slice(0, limit).map(([id, v]) => ({
        queue_id: id,
        action: v.request.requested_action,
        target: v.request.threat.target,
        severity: v.classification.severity,
        reasoning: v.classification.reasoning,
        queued_at: v.queued_at,
      }));

      return {
        client_id: request.params.clientId,
        pending_count: allPending.length,
        returned: pending.length,
        ...(overflow_granthx_ref && { overflow_granthx_ref }),
        items: pending,
      };
    }
  );

  app.log.info('Dispatch routes registered: /execute + /approve + /queue');
}
