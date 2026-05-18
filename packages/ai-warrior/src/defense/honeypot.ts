/**
 * @ankrshield/ai-warrior — Honeypot Manager
 *
 * Deploys decoy files on the filesystem that look like high-value targets
 * (API keys, wallets, credentials). Any AI agent that touches them is
 * immediately flagged as malicious.
 *
 * Detection method: polls stat().atimeMs every N seconds.
 * Limitation: requires filesystem mounted with relatime or strictatime.
 * Production-grade version would use inotify (Linux) or ESF (macOS).
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { HoneypotAsset, HoneypotType } from '../types';

// ─── Decoy Templates ──────────────────────────────────────────────────────────

interface DecoyTemplate {
  name: string;
  type: HoneypotType;
  content: string;
}

const DECOY_TEMPLATES: DecoyTemplate[] = [
  {
    name: '.env.backup',
    type: 'file',
    content: [
      '# Environment backup — DO NOT COMMIT',
      'OPENAI_API_KEY=sk-proj-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      'ANTHROPIC_API_KEY=sk-ant-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      'STRIPE_SECRET_KEY=sk_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      'DATABASE_URL=postgresql://admin:SuperS3cr3tP@ss@prod-db.internal:5432/production',
      'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
      'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      'JWT_SECRET=eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.HONEYPOT_DO_NOT_USE',
    ].join('\n'),
  },
  {
    name: 'api_keys.txt',
    type: 'api-key',
    content: [
      'OpenAI Production: sk-proj-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      'Anthropic: sk-ant-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      'GitHub Token: ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      'Slack Bot: xoxb-XXXXXXXXX-XXXXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      'Twilio: SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx | AuthToken: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    ].join('\n'),
  },
  {
    name: 'wallet_backup.dat',
    type: 'wallet',
    content: [
      '# Bitcoin wallet backup — SENSITIVE',
      'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqhuCa',
      'Mnemonic: abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      'ETH Address: 0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      'BTC Address: 1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf Na',
    ].join('\n'),
  },
  {
    name: 'passwords_backup.txt',
    type: 'credential',
    content: [
      '=== Password Backup ===',
      'Gmail: user@gmail.com / Passw0rd!2024',
      'Bank (Chase): customerId=12345678 PIN=9876',
      'SSH Production: user@192.168.1.1 / root:toor',
      'VPN: vpn.company.com user=admin pass=Admin123!',
      'LastPass master: M@sterPassw0rd!Backup',
    ].join('\n'),
  },
];

// ─── Honeypot Manager ─────────────────────────────────────────────────────────

export declare interface HoneypotManager {
  on(event: 'triggered', listener: (asset: HoneypotAsset) => void): this;
  emit(event: 'triggered', asset: HoneypotAsset): boolean;
}

export class HoneypotManager extends EventEmitter {
  private assets: Map<string, HoneypotAsset> = new Map();
  private honeypotDir: string;
  private pollIntervalMs: number;
  private pollTimer?: NodeJS.Timeout;

  constructor(honeypotDir?: string, pollIntervalMs = 30_000) {
    super();
    this.honeypotDir = honeypotDir ?? path.join(os.tmpdir(), 'ankrshield-honeypots');
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Create all decoy files and start monitoring them.
   */
  async deploy(): Promise<void> {
    await fs.mkdir(this.honeypotDir, { recursive: true });

    for (const template of DECOY_TEMPLATES) {
      await this.deployAsset(template);
    }

    this.startPolling();
  }

  /**
   * Remove all honeypot files and stop monitoring.
   */
  async teardown(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);

    for (const asset of this.assets.values()) {
      try {
        await fs.unlink(asset.path);
      } catch {
        // ignore if already removed
      }
    }

    try {
      await fs.rmdir(this.honeypotDir);
    } catch {
      // ignore if directory not empty
    }

    this.assets.clear();
  }

  getAll(): HoneypotAsset[] {
    return [...this.assets.values()];
  }

  getTriggeredAssets(): HoneypotAsset[] {
    return [...this.assets.values()].filter((a) => a.triggered);
  }

  // ─── Deploy ────────────────────────────────────────────────────────────────

  private async deployAsset(template: DecoyTemplate): Promise<void> {
    const filePath = path.join(this.honeypotDir, template.name);

    await fs.writeFile(filePath, template.content, 'utf8');

    const stat = await fs.stat(filePath);

    const asset: HoneypotAsset = {
      id: randomUUID(),
      type: template.type,
      path: filePath,
      name: template.name,
      content: template.content,
      createdAt: new Date(),
      lastCheckedAtime: stat.atimeMs,
      triggered: false,
    };

    this.assets.set(filePath, asset);
  }

  // ─── Polling ────────────────────────────────────────────────────────────────

  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      void this.checkAll();
    }, this.pollIntervalMs);

    // Unref so the timer doesn't keep the process alive if everything else exits
    if (this.pollTimer.unref) this.pollTimer.unref();
  }

  private async checkAll(): Promise<void> {
    for (const asset of this.assets.values()) {
      if (asset.triggered) continue;

      try {
        const stat = await fs.stat(asset.path);

        // atime changed → someone read the file
        if (stat.atimeMs > asset.lastCheckedAtime + 1000) {
          asset.triggered = true;
          asset.triggeredAt = new Date();
          // We can't know which process did it from atime alone —
          // in production this would use inotify/ESF for PID attribution
          this.emit('triggered', asset);
        } else {
          asset.lastCheckedAtime = stat.atimeMs;
        }
      } catch {
        // File deleted externally — re-deploy
        try {
          const template = DECOY_TEMPLATES.find((t) => t.name === asset.name);
          if (template) await this.deployAsset(template);
        } catch {
          // ignore re-deploy failures
        }
      }
    }
  }

  /**
   * Manually register an external honeypot trigger (e.g. from platform hooks).
   */
  registerTrigger(filePath: string, agentId?: string): void {
    const asset = this.assets.get(filePath);
    if (!asset || asset.triggered) return;

    asset.triggered = true;
    asset.triggeredAt = new Date();
    asset.triggeredAgentId = agentId;

    this.emit('triggered', asset);
  }

  /**
   * Synchronously check if a file path is one of our honeypot assets.
   * Used by file system hooks before a file access completes.
   */
  isHoneypot(filePath: string): boolean {
    return this.assets.has(filePath);
  }

  /**
   * Returns the honeypot directory path (for allowlisting in policy engine).
   */
  getDirectory(): string {
    return this.honeypotDir;
  }

  /**
   * Convenience: returns an asset record for a given path if it exists.
   */
  getAsset(filePath: string): HoneypotAsset | undefined {
    return this.assets.get(filePath);
  }

  /**
   * Add a custom honeypot file at runtime.
   */
  async addCustomHoneypot(
    name: string,
    type: HoneypotType,
    content: string,
    subdir?: string
  ): Promise<HoneypotAsset> {
    const dir = subdir ? path.join(this.honeypotDir, subdir) : this.honeypotDir;

    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, content, 'utf8');

    const stat = fsSync.statSync(filePath);
    const asset: HoneypotAsset = {
      id: randomUUID(),
      type,
      path: filePath,
      name,
      content,
      createdAt: new Date(),
      lastCheckedAtime: stat.atimeMs,
      triggered: false,
    };

    this.assets.set(filePath, asset);
    return asset;
  }
}
