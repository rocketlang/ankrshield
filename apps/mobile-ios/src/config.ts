/**
 * AnkrShield Mobile — API Configuration
 *
 * Single source of truth for backend URLs.
 * Override via ANKRSHIELD_API_URL env var for local dev.
 */
export const API_BASE =
  (typeof process !== 'undefined' && process.env?.ANKRSHIELD_API_URL) ||
  'https://xshieldai.com/api';

export const GRAPHQL_URL = `${API_BASE}/graphql`;
