// @rule:HNG — Shatru-commanded containment state (the WHO half of a capability-kill).
// HanumanG owns the agent register; a revoked agent fails attestation + reads as revoked.
export const revoked = new Set<string>();
export const isRevoked = (id?: string | null): boolean => !!id && revoked.has(id);
