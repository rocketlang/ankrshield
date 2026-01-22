/**
 * Policy evaluation engine
 */

import type { Policy } from './types';

export class PolicyEngine {
  private policies: Policy[] = [];

  addPolicy(policy: Policy): void {
    this.policies.push(policy);
  }

  evaluate(domain: string): 'allow' | 'block' {
    // TODO: Implement policy evaluation for domain
    console.log(`Evaluating policy for ${domain}`);
    return 'allow';
  }
}
