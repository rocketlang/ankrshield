/**
 * Device GraphQL Type
 */

import { builder } from '../builder';
import { Device } from '@prisma/client';

builder.enumType('DeviceType', {
  values: ['WINDOWS', 'MACOS', 'LINUX', 'IOS', 'ANDROID', 'BROWSER', 'GATEWAY'] as const,
});

builder.objectRef<Device>('Device').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    deviceType: t.expose('deviceType', { type: 'DeviceType' }),
    hostname: t.exposeString('hostname', { nullable: true }),
    osVersion: t.exposeString('osVersion', { nullable: true }),
    appVersion: t.exposeString('appVersion', { nullable: true }),
    isActive: t.exposeBoolean('isActive'),
    lastSeenAt: t.expose('lastSeenAt', { type: 'DateTime' }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),

    // Relations
    user: t.field({
      type: 'User',
      resolve: async (device, _args, context) => {
        return context.prisma.user.findUniqueOrThrow({ where: { id: device.userId } });
      },
    }),
    networkEvents: t.field({
      type: ['NetworkEvent'],
      resolve: async (device, _args, context) => {
        return context.prisma.networkEvent.findMany({ where: { deviceId: device.id } });
      },
    }),
  }),
});
