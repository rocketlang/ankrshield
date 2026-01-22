/**
 * Policy GraphQL Types
 */

import { builder } from '../builder';
import { Policy } from '@prisma/client';

builder.enumType('PolicyAction', {
  values: ['ALLOW', 'BLOCK', 'NOTIFY', 'PROMPT'] as const,
});

builder.objectRef<Policy>('Policy').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    description: t.exposeString('description', { nullable: true }),
    isEnabled: t.exposeBoolean('isEnabled'),
    priority: t.exposeInt('priority'),
    action: t.expose('action', { type: 'PolicyAction' }),
    notifyUser: t.exposeBoolean('notifyUser'),
    logEvent: t.exposeBoolean('logEvent'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});
