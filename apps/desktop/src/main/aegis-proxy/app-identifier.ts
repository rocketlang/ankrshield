// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — per-app identifier (ASD-T-006)
//
// Best-effort mapping from a connecting TCP source port → PID → executable
// name → human-friendly app_id (e.g. "claude-desktop", "cursor"). Linux uses
// `ss -tnp`; macOS uses `lsof`; Windows uses `netstat -ano + tasklist`.
//
// @rule:ASD-YK-005 — per-app identity is guidance, not security. A spoofing
//   app can pretend to be a more-permissive identity; this identifier is for
//   UI labelling, not enforcement.

import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execCallback);

export interface ResolveAppIdOptions {
  /** Client's TCP source port (req.socket.remotePort). */
  clientPort: number;
  /** Proxy's bind port (the destination). */
  proxyPort: number;
  /** Timeout for the shell lookup. Default 500 ms. */
  timeoutMs?: number;
}

export interface AppIdentity {
  /** Human-friendly identifier — "claude-desktop", "cursor", "unknown:<port>". */
  appId: string;
  /** PID of the originating process if resolved. */
  pid: number | null;
  /** Executable basename if resolved. */
  executable: string | null;
}

/**
 * Best-effort: returns `{ appId: "unknown:<port>", pid: null, executable: null }`
 * if lookup fails or platform is unsupported. Never throws.
 */
export async function resolveAppId(opts: ResolveAppIdOptions): Promise<AppIdentity> {
  const fallback: AppIdentity = {
    appId: `unknown:${opts.clientPort}`,
    pid: null,
    executable: null,
  };
  if (!opts.clientPort) return fallback;

  try {
    if (process.platform === 'linux') return await resolveLinux(opts, fallback);
    if (process.platform === 'darwin') return await resolveMac(opts, fallback);
    if (process.platform === 'win32') return await resolveWindows(opts, fallback);
  } catch {
    // Any failure → fallback. ASD-YK-005: don't fail requests because of
    // identifier lookup; it's UI guidance, not enforcement.
  }
  return fallback;
}

// ─── Platform-specific lookups ────────────────────────────────────────────────

async function resolveLinux(
  opts: ResolveAppIdOptions,
  fallback: AppIdentity
): Promise<AppIdentity> {
  const timeout = opts.timeoutMs ?? 500;
  // `ss -Htnp` — no header, TCP, numeric, processes.
  // Filter both sides to the loopback connection we care about.
  const cmd = `ss -Htnp '( src 127.0.0.1:${opts.proxyPort} and dst 127.0.0.1:${opts.clientPort} )'`;
  const { stdout } = await exec(cmd, { timeout, encoding: 'utf8' });
  return parseLinuxSsOutput(stdout, opts.clientPort, fallback);
}

/**
 * Parse `ss -Htnp` output. Example line:
 *   ESTAB 0 0 127.0.0.1:4857 127.0.0.1:54321 users:(("cursor",pid=12345,fd=42))
 *
 * Exported for unit testing — no shell required.
 */
export function parseLinuxSsOutput(
  stdout: string,
  clientPort: number,
  fallback: AppIdentity
): AppIdentity {
  // The first capture group accepts process names with no spaces; the
  // executable may contain dots, dashes, underscores. ss escapes embedded
  // characters via backslashes — out of scope for v1.
  // ss output: users:(("name",pid=N,fd=N)) for single process, or
  //            users:(("nameA",pid=N,fd=N),("nameB",...)) for multi-process.
  // First .match returns the first capture — that's what we want.
  const match = stdout.match(/\("([^"]+)",pid=(\d+),fd=\d+\)/);
  if (!match) return fallback;
  const executable = match[1]!;
  const pid = Number(match[2]);
  return {
    appId: normaliseAppId(executable),
    pid,
    executable,
  };
}

async function resolveMac(opts: ResolveAppIdOptions, fallback: AppIdentity): Promise<AppIdentity> {
  const timeout = opts.timeoutMs ?? 500;
  // lsof -i TCP:<port> -P -n -F pcn
  // Output is a series of lines starting with single-char field markers:
  //   p<pid>
  //   c<command>
  //   n<endpoint>
  const cmd = `lsof -iTCP:${opts.clientPort} -P -n -F pcn`;
  const { stdout } = await exec(cmd, { timeout, encoding: 'utf8' });
  return parseMacLsofOutput(stdout, fallback);
}

export function parseMacLsofOutput(stdout: string, fallback: AppIdentity): AppIdentity {
  let pid: number | null = null;
  let executable: string | null = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1)) || null;
    if (line.startsWith('c')) executable = line.slice(1);
  }
  if (executable == null) return fallback;
  return {
    appId: normaliseAppId(executable),
    pid,
    executable,
  };
}

async function resolveWindows(
  opts: ResolveAppIdOptions,
  fallback: AppIdentity
): Promise<AppIdentity> {
  const timeout = opts.timeoutMs ?? 1000;
  // netstat -ano output line: "TCP    127.0.0.1:54321   127.0.0.1:4857   ESTABLISHED   12345"
  const { stdout: netstatOut } = await exec('netstat -ano -p TCP', { timeout, encoding: 'utf8' });
  const pid = parseWindowsNetstatForPid(netstatOut, opts.clientPort, opts.proxyPort);
  if (pid == null) return fallback;
  const { stdout: tasklistOut } = await exec(`tasklist /NH /FI "PID eq ${pid}" /FO CSV`, {
    timeout,
    encoding: 'utf8',
  });
  const executable = parseWindowsTasklistOutput(tasklistOut);
  return {
    appId: executable ? normaliseAppId(executable) : `unknown:pid=${pid}`,
    pid,
    executable,
  };
}

export function parseWindowsNetstatForPid(
  stdout: string,
  clientPort: number,
  proxyPort: number
): number | null {
  const clientStr = `127.0.0.1:${clientPort}`;
  const proxyStr = `127.0.0.1:${proxyPort}`;
  for (const line of stdout.split('\n')) {
    if (line.includes(clientStr) && line.includes(proxyStr)) {
      const m = line.match(/\s(\d+)\s*$/);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

export function parseWindowsTasklistOutput(stdout: string): string | null {
  // CSV row: "image.exe","12345","Services","0","123,456 K"
  const firstLine = stdout.split('\n').find((l) => l.trim().length > 0);
  if (!firstLine) return null;
  const m = firstLine.match(/^"([^"]+)"/);
  if (!m) return null;
  return m[1]!.replace(/\.exe$/i, '');
}

// ─── App ID normalisation ─────────────────────────────────────────────────────

const KNOWN_APP_IDS: Record<string, string> = {
  // Anthropic
  claude: 'claude-desktop',
  Claude: 'claude-desktop',
  'Claude Helper': 'claude-desktop',
  // Editors with agentic features
  cursor: 'cursor',
  Cursor: 'cursor',
  code: 'vscode',
  Code: 'vscode',
  'Code Helper': 'vscode',
  windsurf: 'windsurf',
  Windsurf: 'windsurf',
  // OpenAI
  chatgpt: 'chatgpt-desktop',
  ChatGPT: 'chatgpt-desktop',
  // CLIs
  aider: 'aider',
  // Generic
  curl: 'curl',
  wget: 'wget',
  python: 'python',
  python3: 'python',
};

export function normaliseAppId(executable: string): string {
  if (KNOWN_APP_IDS[executable]) return KNOWN_APP_IDS[executable]!;
  // For node scripts, "node" alone is uninformative — keep generic.
  if (executable === 'node') return 'node';
  return executable;
}
