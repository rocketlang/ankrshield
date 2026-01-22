/**
 * App Resolver
 * Resolve process ID to application information
 */

import { AppInfo, Platform } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';

const execAsync = promisify(exec);

/**
 * Cache for app information (PID -> AppInfo)
 */
const appCache = new Map<number, AppInfo>();
const CACHE_TTL = 60000; // 60 seconds
const cacheTimestamps = new Map<number, number>();

/**
 * Resolve application information from process ID
 */
export class AppResolver {
  private platform: Platform;

  constructor() {
    this.platform = process.platform as Platform;
  }

  /**
   * Get app info by PID
   */
  async getAppByPID(pid: number): Promise<AppInfo | null> {
    // Check cache
    const cached = this.getCachedApp(pid);
    if (cached) return cached;

    // Resolve based on platform
    let appInfo: AppInfo | null = null;

    switch (this.platform) {
      case 'linux':
        appInfo = await this.getLinuxApp(pid);
        break;
      case 'darwin':
        appInfo = await this.getMacOSApp(pid);
        break;
      case 'win32':
        appInfo = await this.getWindowsApp(pid);
        break;
    }

    // Cache result
    if (appInfo) {
      this.cacheApp(pid, appInfo);
    }

    return appInfo;
  }

  /**
   * Get app info for Linux
   */
  private async getLinuxApp(pid: number): Promise<AppInfo | null> {
    try {
      // Read /proc/[pid]/cmdline
      const cmdline = await readFile(`/proc/${pid}/cmdline`, 'utf-8');
      const args = cmdline.split('\0').filter(Boolean);

      if (args.length === 0) return null;

      const executablePath = args[0];
      const name = this.extractAppName(executablePath);

      return {
        pid,
        name,
        executablePath,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get app info for macOS
   */
  private async getMacOSApp(pid: number): Promise<AppInfo | null> {
    try {
      // Use ps command to get process info
      const { stdout } = await execAsync(`ps -p ${pid} -o comm=`);
      const name = stdout.trim();

      if (!name) return null;

      // Try to get bundle ID for macOS apps
      let bundleId: string | undefined;
      try {
        const { stdout: lsofOut } = await execAsync(
          `lsof -p ${pid} | grep .app/Contents/MacOS | head -1`
        );

        const appPathMatch = lsofOut.match(/(.+\.app)\//);
        if (appPathMatch) {
          const appPath = appPathMatch[1];
          const { stdout: bundleOut } = await execAsync(
            `defaults read "${appPath}/Contents/Info.plist" CFBundleIdentifier 2>/dev/null || echo ""`
          );
          bundleId = bundleOut.trim() || undefined;
        }
      } catch {
        // Ignore if bundle ID not found
      }

      return {
        pid,
        name: this.extractAppName(name),
        executablePath: name,
        bundleId,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get app info for Windows
   */
  private async getWindowsApp(pid: number): Promise<AppInfo | null> {
    try {
      // Use wmic or PowerShell to get process info
      const { stdout } = await execAsync(
        `powershell "Get-Process -Id ${pid} | Select-Object Name, Path | ConvertTo-Json"`
      );

      const info = JSON.parse(stdout);
      if (!info || !info.Name) return null;

      return {
        pid,
        name: info.Name,
        executablePath: info.Path || info.Name,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract human-readable app name from path
   */
  private extractAppName(path: string): string {
    // Remove path and extension
    const fileName = path.split('/').pop() || path.split('\\').pop() || path;

    // Remove common extensions
    const name = fileName
      .replace(/\.(exe|app|bin|sh)$/i, '')
      .replace(/^\./, '');

    // Capitalize first letter
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /**
   * Get cached app info
   */
  private getCachedApp(pid: number): AppInfo | null {
    const cached = appCache.get(pid);
    const timestamp = cacheTimestamps.get(pid);

    if (!cached || !timestamp) return null;

    // Check if cache is still valid
    if (Date.now() - timestamp > CACHE_TTL) {
      appCache.delete(pid);
      cacheTimestamps.delete(pid);
      return null;
    }

    return cached;
  }

  /**
   * Cache app info
   */
  private cacheApp(pid: number, info: AppInfo): void {
    appCache.set(pid, info);
    cacheTimestamps.set(pid, Date.now());

    // Limit cache size
    if (appCache.size > 1000) {
      const oldestPid = Array.from(cacheTimestamps.entries()).sort(
        (a, b) => a[1] - b[1]
      )[0][0];
      appCache.delete(oldestPid);
      cacheTimestamps.delete(oldestPid);
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    appCache.clear();
    cacheTimestamps.clear();
  }
}

/**
 * Find PID for a connection tuple
 * This is platform-specific and complex - simplified implementation
 */
export async function findPIDForConnection(
  _sourceIp: string,
  sourcePort: number,
  _destinationIp: string,
  destinationPort: number
): Promise<number | null> {
  const platform = process.platform as Platform;

  try {
    switch (platform) {
      case 'linux':
        return await findLinuxPID(sourcePort, destinationPort);
      case 'darwin':
        return await findMacOSPID(sourcePort, destinationPort);
      case 'win32':
        return await findWindowsPID(sourcePort, destinationPort);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Find PID on Linux using /proc/net/tcp
 */
async function findLinuxPID(
  sourcePort: number,
  _destinationPort: number
): Promise<number | null> {
  try {
    // Read /proc/net/tcp
    const tcp = await readFile('/proc/net/tcp', 'utf-8');
    const lines = tcp.split('\n').slice(1); // Skip header

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;

      // Parse local address (IP:Port in hex)
      const localAddr = parts[1];
      const [, localPortHex] = localAddr.split(':');
      const localPort = parseInt(localPortHex, 16);

      if (localPort === sourcePort) {
        const inode = parts[9];

        // Find process that owns this inode
        const { stdout } = await execAsync(
          `find /proc/*/fd -lname "socket:\\[${inode}\\]" 2>/dev/null | head -1`
        );

        const match = stdout.match(/\/proc\/(\d+)\//);
        if (match) {
          return parseInt(match[1]);
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Find PID on macOS using lsof
 */
async function findMacOSPID(
  sourcePort: number,
  destinationPort: number
): Promise<number | null> {
  try {
    const { stdout } = await execAsync(
      `lsof -i TCP:${sourcePort} -t 2>/dev/null || lsof -i TCP:${destinationPort} -t 2>/dev/null || echo ""`
    );

    const pid = parseInt(stdout.trim());
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Find PID on Windows using netstat
 */
async function findWindowsPID(
  sourcePort: number,
  _destinationPort: number
): Promise<number | null> {
  try {
    const { stdout } = await execAsync(
      `netstat -ano | findstr :${sourcePort} | findstr ESTABLISHED`
    );

    // Parse netstat output
    // Example: TCP    192.168.1.100:54321    93.184.216.34:443    ESTABLISHED    1234
    const match = stdout.match(/\s+(\d+)\s*$/);
    if (match) {
      return parseInt(match[1]);
    }

    return null;
  } catch {
    return null;
  }
}
