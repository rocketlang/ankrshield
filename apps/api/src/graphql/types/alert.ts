/**
 * Alert GraphQL Types
 */

import { builder } from '../builder';
import { Alert } from '@prisma/client';

builder.enumType('AlertSeverity', {
  values: ['INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const,
});

builder.objectRef<Alert>('Alert').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    timestamp: t.expose('timestamp', { type: 'DateTime' }),
    severity: t.expose('severity', { type: 'AlertSeverity' }),
    title: t.exposeString('title'),
    message: t.exposeString('message'),
    category: t.exposeString('category'),
    isRead: t.exposeBoolean('isRead'),
    isDismissed: t.exposeBoolean('isDismissed'),
    actionUrl: t.exposeString('actionUrl', { nullable: true }),
  }),
});
