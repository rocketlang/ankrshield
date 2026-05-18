/**
 * Audit Routes
 * @rule:XSACT-009 Audit trail mandatory for all actions
 */

import type { FastifyInstance } from 'fastify';
import { getAuditRecords, getAuditRecord } from './logger.js';

export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { clientId: string } }>('/api/v1/audit/:clientId', async (request) => ({
    client_id: request.params.clientId,
    records: getAuditRecords(request.params.clientId),
    count: getAuditRecords(request.params.clientId).length,
  }));

  app.get<{ Params: { id: string } }>('/api/v1/audit/record/:id', async (request, reply) => {
    const record = getAuditRecord(request.params.id);
    if (!record) return reply.status(404).send({ error: 'not_found' });
    return record;
  });

  app.log.info('Audit routes registered');
}
