/**
 * Beacon Credential Generator
 * @rule:XSACT-YK-004 Requires Mode 2 pre-auth — called only when pre-authorised
 * @rule:XSACT-006 Legal basis: DPDP S.7(g) + GDPR Art.6(1)(f)
 *
 * Generates fake-but-realistic credentials with embedded tracking UUID.
 * When attacker uses them → hits /api/v1/auth/beacon → fingerprint captured.
 */

import { randomUUID, randomBytes } from 'node:crypto';

export type CredentialType = 'api_key' | 'login' | 'aws_key' | 'github_token' | 'slack_token';

export interface BeaconCredential {
  id: string; // tracking UUID (embedded in credential where possible)
  client_id: string;
  type: CredentialType;
  fake_value: string; // the credential the attacker will find
  created_at: string;
  seeded_at?: string;
  seeded_where?: string; // e.g. "dark_web_forum", "paste_site", "honeypot_file"
  triggered: boolean;
  triggered_at?: string;
  attacker_ip?: string;
  attacker_fingerprint?: Record<string, unknown>;
  case_id?: string;
}

/** File-backed store — survives restarts. @see persistence/file-store.ts */
import { FileBackedMap } from '../persistence/file-store.js';
export const beaconStore = new FileBackedMap<BeaconCredential>('beacon-credentials');

function generateApiKey(trackingId: string): string {
  const suffix = randomBytes(24).toString('hex');
  // Embed tracking ID prefix (first 8 chars) in key — looks realistic
  return `xsh_live_${trackingId.replace(/-/g, '').slice(0, 8)}${suffix}`;
}

function generateAwsKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return (
    'AKIA' +
    Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  );
}

function generateGithubToken(): string {
  return `ghp_${randomBytes(20).toString('hex')}`;
}

function generateSlackToken(): string {
  return `xoxb-${randomBytes(4).toString('hex')}-${randomBytes(8).toString('hex')}-${randomBytes(12).toString('hex')}`;
}

function generateLogin(clientName: string): { username: string; password: string } {
  const domains = ['gmail.com', 'outlook.com', 'company.internal'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return {
    username: `admin.${clientName.toLowerCase().replace(/\s/g, '')}@${domain}`,
    password: `P@ssw0rd!${randomBytes(4).toString('hex')}`,
  };
}

/**
 * Generate a beacon credential set for a client.
 * @rule:XSACT-YK-004 Caller must verify addendum signed + Mode 2 pre-auth
 */
export function generateBeaconCredentials(
  clientId: string,
  clientName: string,
  types: CredentialType[] = ['api_key', 'aws_key']
): BeaconCredential[] {
  const credentials: BeaconCredential[] = [];

  for (const type of types) {
    const id = randomUUID();
    let fake_value: string;

    switch (type) {
      case 'api_key':
        fake_value = generateApiKey(id);
        break;
      case 'aws_key':
        fake_value = `${generateAwsKey()}:${randomBytes(20).toString('base64')}`;
        break;
      case 'github_token':
        fake_value = generateGithubToken();
        break;
      case 'slack_token':
        fake_value = generateSlackToken();
        break;
      case 'login': {
        const { username, password } = generateLogin(clientName);
        fake_value = `${username}:${password}`;
        break;
      }
      default:
        fake_value = randomBytes(32).toString('hex');
    }

    const cred: BeaconCredential = {
      id,
      client_id: clientId,
      type,
      fake_value,
      created_at: new Date().toISOString(),
      triggered: false,
    };

    beaconStore.set(id, cred);
    credentials.push(cred);
  }

  return credentials;
}

export function getBeaconCredential(id: string): BeaconCredential | undefined {
  return beaconStore.get(id);
}

export function recordBeaconTrigger(
  credentialId: string,
  attackerIp: string,
  fingerprint: Record<string, unknown>
): BeaconCredential | null {
  const cred = beaconStore.get(credentialId);
  if (!cred) return null;

  cred.triggered = true;
  cred.triggered_at = new Date().toISOString();
  cred.attacker_ip = attackerIp;
  cred.attacker_fingerprint = fingerprint;
  cred.case_id = `XS-${Date.now()}`;
  beaconStore.set(credentialId, cred);

  return cred;
}
