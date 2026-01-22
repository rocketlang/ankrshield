/**
 * Privacy scoring engine
 */

export interface PrivacyScoreInput {
  blockedCount: number;
  allowedCount: number;
  totalTrackers: number;
}

export class PrivacyEngine {
  calculateScore(input: PrivacyScoreInput): number {
    // TODO: Implement privacy scoring algorithm
    const blockRate = input.allowedCount > 0
      ? input.blockedCount / (input.blockedCount + input.allowedCount)
      : 1;

    return Math.round(blockRate * 100);
  }
}
