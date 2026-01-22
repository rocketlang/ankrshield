/**
 * Authentication GraphQL Types
 */

import { builder } from '../builder';

// Input types
export const RegisterInput = builder.inputType('RegisterInput', {
  fields: (t) => ({
    email: t.string({ required: true }),
    password: t.string({ required: true }),
    name: t.string({ required: false }),
  }),
});

export const LoginInput = builder.inputType('LoginInput', {
  fields: (t) => ({
    email: t.string({ required: true }),
    password: t.string({ required: true }),
  }),
});

// Auth response object type
builder.objectRef<{ token: string; user: any }>('AuthResponse').implement({
  fields: (t) => ({
    token: t.exposeString('token'),
    user: t.field({
      type: 'User',
      resolve: (parent) => parent.user,
    }),
  }),
});
