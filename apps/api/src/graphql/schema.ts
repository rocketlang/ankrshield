/**
 * GraphQL Schema
 * Imports all types and resolvers
 */

import { builder } from './builder';

// Define Query and Mutation types first
builder.queryType({});
builder.mutationType({});

// Import types in dependency order (leaf types first)
import './types/policy';
import './types/alert';
import './types/network';
import './types/privacy';
import './types/device';
import './types/user';
import './types/auth';
import './types/warrior';
import './types/xshield';

// Import resolvers
import './resolvers/auth';
import './resolvers/query';
import './resolvers/warrior';
import './resolvers/xshield';

// Build and export schema
export const schema = builder.toSchema();
