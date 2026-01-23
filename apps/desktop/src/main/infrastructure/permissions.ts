import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Permission check results
 */
export interface PermissionStatus {
  granted: boolean;
  message: string;
  fixInstructions?: string;
}

/**
 * Platform-specific permission requirements
 */
export enum Permission {
  NETWORK_CAPTURE = 'network_capture',
  DNS_MODIFY = 'dns_modify',
  FILE_ACCESS = 'file_access',
}

/**
 * Permission manager
 * Checks platform-specific permissions for network monitoring and DNS resolution
 */
class PermissionManager {
  /**
   * Check if network capture permission is granted
   */
  async checkNetworkCapture(): Promise<PermissionStatus> {
    const platform = process.platform;

    switch (platform) {
      case 'linux':
        return this.checkLinuxNetworkCapture();

      case 'win32':
        return this.checkWindowsNetworkCapture();

      case 'darwin':
        return this.checkMacOSNetworkCapture();

      default:
        return {
          granted: false,
          message: `Unsupported platform: ${platform}`,
        };
    }
  }

  /**
   * Check if DNS modification permission is granted
   */
  async checkDNSModify(): Promise<PermissionStatus> {
    const platform = process.platform;

    switch (platform) {
      case 'linux':
        return this.checkLinuxDNSModify();

      case 'win32':
        return this.checkWindowsDNSModify();

      case 'darwin':
        return this.checkMacOSDNSModify();

      default:
        return {
          granted: false,
          message: `Unsupported platform: ${platform}`,
        };
    }
  }

  /**
   * Check Linux network capture permission (CAP_NET_RAW)
   */
  private async checkLinuxNetworkCapture(): Promise<PermissionStatus> {
    try {
      // Check if running as root
      if (process.getuid && process.getuid() === 0) {
        return {
          granted: true,
          message: 'Running as root',
        };
      }

      // Check if node binary has CAP_NET_RAW capability
      const { stdout } = await execAsync(`getcap $(which node) 2>/dev/null || echo ""`);

      if (stdout.includes('cap_net_raw')) {
        return {
          granted: true,
          message: 'CAP_NET_RAW capability granted',
        };
      }

      return {
        granted: false,
        message: 'Insufficient permissions for network capture',
        fixInstructions: 'Run: sudo setcap cap_net_raw=eip $(which node)\nOr run the app as root (not recommended)',
      };
    } catch (error) {
      return {
        granted: false,
        message: 'Failed to check network capture permission',
        fixInstructions: 'Ensure getcap is installed: sudo apt-get install libcap2-bin',
      };
    }
  }

  /**
   * Check Windows network capture permission (admin)
   */
  private async checkWindowsNetworkCapture(): Promise<PermissionStatus> {
    try {
      // Check if running as administrator
      const { stdout } = await execAsync('net session 2>nul');

      if (stdout || stdout === '') {
        return {
          granted: true,
          message: 'Running with administrator privileges',
        };
      }

      return {
        granted: false,
        message: 'Insufficient permissions for network capture',
        fixInstructions: 'Right-click the application and select "Run as administrator"',
      };
    } catch (error) {
      return {
        granted: false,
        message: 'Not running with administrator privileges',
        fixInstructions: 'Right-click the application and select "Run as administrator"',
      };
    }
  }

  /**
   * Check macOS network capture permission (Network Extension entitlement)
   */
  private async checkMacOSNetworkCapture(): Promise<PermissionStatus> {
    // macOS Network Extension requires specific entitlements in the app bundle
    // For now, we assume it's granted if the app is signed with the right entitlements
    // In practice, this would need to check the entitlements plist

    try {
      // Check if app is signed (basic check)
      const appPath = process.execPath;
      const { stdout } = await execAsync(`codesign -dv "${appPath}" 2>&1 || echo ""`);

      if (stdout.includes('Signature=')) {
        return {
          granted: true,
          message: 'App is code-signed, assuming Network Extension entitlement',
        };
      }

      return {
        granted: true, // Assume granted for development
        message: 'Development mode - network capture available via lsof fallback',
      };
    } catch (error) {
      return {
        granted: true, // macOS typically doesn't need special permissions for lsof
        message: 'Using lsof-based network monitoring (fallback)',
      };
    }
  }

  /**
   * Check Linux DNS modification permission
   */
  private async checkLinuxDNSModify(): Promise<PermissionStatus> {
    try {
      // Check if running as root (required to modify /etc/resolv.conf)
      if (process.getuid && process.getuid() === 0) {
        return {
          granted: true,
          message: 'Running as root',
        };
      }

      // Check if user has sudo privileges
      const { stdout } = await execAsync('sudo -n true 2>&1 || echo "fail"');

      if (!stdout.includes('fail')) {
        return {
          granted: true,
          message: 'User has sudo privileges',
        };
      }

      return {
        granted: false,
        message: 'Insufficient permissions to modify DNS settings',
        fixInstructions: 'Run the app as root or configure sudo privileges',
      };
    } catch (error) {
      return {
        granted: false,
        message: 'Failed to check DNS modification permission',
      };
    }
  }

  /**
   * Check Windows DNS modification permission
   */
  private async checkWindowsDNSModify(): Promise<PermissionStatus> {
    // Same as network capture on Windows - requires admin
    return this.checkWindowsNetworkCapture();
  }

  /**
   * Check macOS DNS modification permission
   */
  private async checkMacOSDNSModify(): Promise<PermissionStatus> {
    try {
      // Check if user has admin privileges (can use networksetup)
      const { stdout } = await execAsync('groups $(whoami)');

      if (stdout.includes('admin')) {
        return {
          granted: true,
          message: 'User is in admin group',
        };
      }

      return {
        granted: false,
        message: 'User not in admin group',
        fixInstructions: 'Add user to admin group or run with administrator privileges',
      };
    } catch (error) {
      return {
        granted: false,
        message: 'Failed to check DNS modification permission',
      };
    }
  }

  /**
   * Check all required permissions
   */
  async checkAll(): Promise<{
    networkCapture: PermissionStatus;
    dnsModify: PermissionStatus;
  }> {
    const [networkCapture, dnsModify] = await Promise.all([
      this.checkNetworkCapture(),
      this.checkDNSModify(),
    ]);

    return { networkCapture, dnsModify };
  }

  /**
   * Get user-friendly permission status message
   */
  async getStatusMessage(): Promise<string> {
    const { networkCapture, dnsModify } = await this.checkAll();

    const messages: string[] = [];

    if (!networkCapture.granted) {
      messages.push(`⚠️  Network capture: ${networkCapture.message}`);
      if (networkCapture.fixInstructions) {
        messages.push(`   Fix: ${networkCapture.fixInstructions}`);
      }
    } else {
      messages.push(`✓ Network capture: ${networkCapture.message}`);
    }

    if (!dnsModify.granted) {
      messages.push(`⚠️  DNS modification: ${dnsModify.message}`);
      if (dnsModify.fixInstructions) {
        messages.push(`   Fix: ${dnsModify.fixInstructions}`);
      }
    } else {
      messages.push(`✓ DNS modification: ${dnsModify.message}`);
    }

    return messages.join('\n');
  }
}

// Singleton instance
const permissionManager = new PermissionManager();

export default permissionManager;
export { permissionManager };
