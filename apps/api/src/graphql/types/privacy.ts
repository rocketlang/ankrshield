/**
 * Privacy Score GraphQL Types
 */

import { builder } from '../builder';
import { PrivacyScore } from '@prisma/client';

builder.objectRef<PrivacyScore>('PrivacyScore').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    timestamp: t.expose('timestamp', { type: 'DateTime' }),
    overallScore: t.exposeInt('overallScore'),
    networkScore: t.exposeInt('networkScore'),
    dnsScore: t.exposeInt('dnsScore'),
    appScore: t.exposeInt('appScore'),
    aiScore: t.exposeInt('aiScore'),
    totalRequests: t.exposeInt('totalRequests'),
    blockedRequests: t.exposeInt('blockedRequests'),
    allowedRequests: t.exposeInt('allowedRequests'),
    trackersBlocked: t.exposeInt('trackersBlocked'),
    previousScore: t.exposeInt('previousScore', { nullable: true }),
    scoreChange: t.exposeInt('scoreChange', { nullable: true }),
    period: t.exposeString('period'),
  }),
});
