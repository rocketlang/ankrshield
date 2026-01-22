/**
 * Policy types
 */

export interface Policy {
  id: string;
  name: string;
  rules: PolicyRule[];
}

export interface PolicyRule {
  id: string;
  type: 'allow' | 'block';
  condition: string;
}
