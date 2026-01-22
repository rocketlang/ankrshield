/**
 * Network Event GraphQL Types
 */

import { builder } from '../builder';
import { NetworkEvent, Tracker } from '@prisma/client';

builder.enumType('EventType', {
  values: [
    'DNS_QUERY',
    'DNS_BLOCKED',
    'NETWORK_REQUEST',
    'NETWORK_BLOCKED',
    'AI_FILE_ACCESS',
    'AI_CLIPBOARD',
    'AI_NETWORK',
    'AI_BLOCKED',
    'POLICY_VIOLATION',
  ] as const,
});

builder.objectRef<NetworkEvent>('NetworkEvent').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    timestamp: t.expose('timestamp', { type: 'DateTime' }),
    eventType: t.expose('eventType', { type: 'EventType' }),
    domain: t.exposeString('domain'),
    ip: t.exposeString('ip', { nullable: true }),
    protocol: t.exposeString('protocol', { nullable: true }),
    isBlocked: t.exposeBoolean('isBlocked'),
    blockedBy: t.exposeString('blockedBy', { nullable: true }),
    bytesIn: t.exposeInt('bytesIn'),
    bytesOut: t.exposeInt('bytesOut'),

    // Relations
    device: t.field({
      type: 'Device',
      resolve: async (event, _args, context) => {
        return context.prisma.device.findUniqueOrThrow({ where: { id: event.deviceId } });
      },
    }),
    tracker: t.field({
      type: 'Tracker',
      nullable: true,
      resolve: async (event, _args, context) => {
        if (!event.trackerId) return null;
        return context.prisma.tracker.findUnique({ where: { id: event.trackerId } });
      },
    }),
  }),
});

builder.enumType('TrackerCategory', {
  values: [
    'ADVERTISING',
    'ANALYTICS',
    'SOCIAL_MEDIA',
    'TELEMETRY',
    'MALWARE',
    'CDN',
    'FINGERPRINTING',
    'CRYPTOMINING',
    'OTHER',
  ] as const,
});

builder.enumType('ThreatLevel', {
  values: ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const,
});

builder.objectRef<Tracker>('Tracker').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    domain: t.exposeString('domain'),
    category: t.expose('category', { type: 'TrackerCategory' }),
    vendor: t.exposeString('vendor', { nullable: true }),
    threatLevel: t.expose('threatLevel', { type: 'ThreatLevel' }),
    description: t.exposeString('description', { nullable: true }),
    blockedCount: t.exposeInt('blockedCount'),
  }),
});
