/**
 * Network Monitor Factory
 * Creates platform-specific monitor instances
 */

import { BaseNetworkMonitor } from './base-monitor';
import { LinuxMonitor } from './linux-monitor';
import { WindowsMonitor } from './windows-monitor';
import { MacOSMonitor } from './macos-monitor';
import { MonitorConfig, UnsupportedPlatformError, Platform } from '../types';

/**
 * Create a network monitor for the current platform
 */
export function createNetworkMonitor(
  config: Partial<MonitorConfig> = {}
): BaseNetworkMonitor {
  const platform = process.platform as Platform;

  switch (platform) {
    case 'linux':
      return new LinuxMonitor(config);

    case 'win32':
      return new WindowsMonitor(config);

    case 'darwin':
      return new MacOSMonitor(config);

    default:
      throw new UnsupportedPlatformError(platform);
  }
}

/**
 * Get platform information
 */
export function getPlatformInfo(): {
  platform: Platform;
  isSupported: boolean;
  requiresRoot: boolean;
  captureMethod: string;
} {
  const platform = process.platform as Platform;

  const info = {
    linux: {
      platform: 'linux' as Platform,
      isSupported: true,
      requiresRoot: true,
      captureMethod: 'libpcap (BPF)',
    },
    win32: {
      platform: 'win32' as Platform,
      isSupported: true,
      requiresRoot: true,
      captureMethod: 'WinDivert',
    },
    darwin: {
      platform: 'darwin' as Platform,
      isSupported: true,
      requiresRoot: false,
      captureMethod: 'Network Extension / lsof',
    },
  };

  return (
    info[platform] || {
      platform: platform as Platform,
      isSupported: false,
      requiresRoot: false,
      captureMethod: 'None',
    }
  );
}

/**
 * Check if current platform is supported
 */
export function isPlatformSupported(): boolean {
  const platform = process.platform;
  return platform === 'linux' || platform === 'win32' || platform === 'darwin';
}
