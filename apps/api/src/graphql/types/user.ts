/**
 * User GraphQL Type
 */

import { builder } from '../builder';
import { User as PrismaUser } from '@prisma/client';

// DateTime scalar
builder.scalarType('DateTime', {
  serialize: (date: Date) => date.toISOString(),
  parseValue: (value) => {
    if (typeof value === 'string') {
      return new Date(value);
    }
    throw new Error('Invalid DateTime');
  },
});

// Enums
const SubscriptionTierEnum = builder.enumType('SubscriptionTier', {
  values: ['FREE', 'FREEMIUM', 'PREMIUM', 'PRO', 'FAMILY', 'ENTERPRISE', 'SUPER'] as const,
});

// User type
export const UserRef = builder.objectRef<PrismaUser>('User');

UserRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    name: t.exposeString('name', { nullable: true }),
    tier: t.expose('tier', { type: SubscriptionTierEnum }),
    privacyLevel: t.exposeInt('privacyLevel'),
    emailVerified: t.expose('emailVerified', {
      type: 'DateTime',
      nullable: true,
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    lastLoginAt: t.expose('lastLoginAt', {
      type: 'DateTime',
      nullable: true,
    }),

    // Note: Relations are commented out due to type issues
    // TODO: Re-enable after fixing Pothos type configuration
    // devices: t.field({
    //   type: ['Device'],
    //   resolve: async (user, _args, context) => {
    //     return context.prisma.device.findMany({ where: { userId: user.id } });
    //   },
    // }),
    // policies: t.field({
    //   type: ['Policy'],
    //   resolve: async (user, _args, context) => {
    //     return context.prisma.policy.findMany({ where: { userId: user.id } });
    //   },
    // }),
    // alerts: t.field({
    //   type: ['Alert'],
    //   resolve: async (user, _args, context) => {
    //     return context.prisma.alert.findMany({ where: { userId: user.id } });
    //   },
    // }),
  }),
});
