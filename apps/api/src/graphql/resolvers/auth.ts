/**
 * Authentication Resolvers
 */

import { builder, prisma } from '../builder';
import { hashPassword, comparePassword } from '../../auth/password';
import { generateToken } from '../../utils/jwt-helper';
import { RegisterInput, LoginInput } from '../types/auth';

// Register mutation
builder.mutationField('register', (t) =>
  t.field({
    type: 'AuthResponse',
    args: {
      input: t.arg({ type: RegisterInput, required: true }),
    },
    resolve: async (_parent, { input }, context) => {
      const { email, password, name } = input;

      // Check if user already exists
      const existing = await prisma.user.findUnique({
        where: { email },
      });

      if (existing) {
        throw new Error('User already exists');
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          tier: 'FREE',
          privacyLevel: 5,
        },
      });

      // Generate JWT token
      const token = generateToken({
        userId: user.id,
        email: user.email,
        tier: user.tier,
      });

      return {
        token,
        user,
      };
    },
  })
);

// Login mutation
builder.mutationField('login', (t) =>
  t.field({
    type: 'AuthResponse',
    args: {
      input: t.arg({ type: LoginInput, required: true }),
    },
    resolve: async (_parent, { input }, context) => {
      const { email, password } = input;

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Verify password
      const valid = await comparePassword(password, user.password);

      if (!valid) {
        throw new Error('Invalid credentials');
      }

      // Update last login
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate JWT token
      const token = generateToken({
        userId: updatedUser.id,
        email: updatedUser.email,
        tier: updatedUser.tier,
      });

      return {
        token,
        user: updatedUser,
      };
    },
  })
);
