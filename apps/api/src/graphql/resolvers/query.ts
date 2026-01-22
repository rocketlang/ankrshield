/**
 * Query Resolvers
 */

import { builder, prisma } from '../builder';

// Me query - returns current authenticated user
builder.queryField('me', (t) =>
  t.field({
    type: 'User',
    nullable: true,
    resolve: async (_parent, _args, context) => {
      if (!context.userId) {
        return null;
      }

      return prisma.user.findUnique({
        where: { id: context.userId },
      });
    },
  })
);

// Devices query
builder.queryField('devices', (t) =>
  t.field({
    type: ['Device'],
    resolve: async (_parent, _args, context) => {
      if (!context.userId) {
        throw new Error('Not authenticated');
      }

      return prisma.device.findMany({
        where: { userId: context.userId },
        orderBy: { lastSeenAt: 'desc' },
      });
    },
  })
);

// Network events query with pagination
builder.queryField('networkEvents', (t) =>
  t.field({
    type: ['NetworkEvent'],
    args: {
      limit: t.arg.int({ defaultValue: 50 }),
      offset: t.arg.int({ defaultValue: 0 }),
      deviceId: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.userId) {
        throw new Error('Not authenticated');
      }

      const { limit, offset, deviceId } = args;

      return prisma.networkEvent.findMany({
        where: {
          userId: context.userId,
          ...(deviceId ? { deviceId } : {}),
        },
        orderBy: { timestamp: 'desc' },
        take: limit || undefined,
        skip: offset || undefined,
      });
    },
  })
);

// Trackers query
builder.queryField('trackers', (t) =>
  t.field({
    type: ['Tracker'],
    args: {
      limit: t.arg.int({ defaultValue: 20 }),
      category: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args) => {
      const { limit, category } = args;

      return prisma.tracker.findMany({
        where: category ? { category: category as any } : {},
        orderBy: { blockedCount: 'desc' },
        take: limit || undefined,
      });
    },
  })
);

// Privacy score query
builder.queryField('privacyScores', (t) =>
  t.field({
    type: ['PrivacyScore'],
    args: {
      limit: t.arg.int({ defaultValue: 30 }),
      period: t.arg.string({ defaultValue: 'daily' }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.userId) {
        throw new Error('Not authenticated');
      }

      const { limit, period } = args;

      return prisma.privacyScore.findMany({
        where: {
          userId: context.userId,
          period: period || 'daily',
        },
        orderBy: { timestamp: 'desc' },
        take: limit || undefined,
      });
    },
  })
);
