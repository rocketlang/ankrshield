import { randomUUID } from 'crypto';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { configManager } from '../config.js';

/**
 * User/Device information
 */
export interface UserInfo {
  userId: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  arch: string;
  osVersion: string;
  appVersion: string;
  createdAt: Date;
  lastSeenAt: Date;
}

/**
 * User/Device ID manager
 * Generates and persists unique identifiers for the device and user
 */
class UserManager {
  private userInfo: UserInfo | null = null;
  private userFilePath: string | null = null;

  /**
   * Initialize user/device information
   */
  async initialize(): Promise<UserInfo> {
    if (this.userInfo) {
      return this.userInfo;
    }

    const config = configManager.get();
    this.userFilePath = path.join(config.userDataPath, 'user.json');

    // Try to load existing user info
    const existingInfo = this.loadFromFile();

    if (existingInfo) {
      // Update last seen timestamp
      existingInfo.lastSeenAt = new Date();
      existingInfo.appVersion = config.appVersion; // Update app version
      this.userInfo = existingInfo;
      this.saveToFile(this.userInfo);

      console.log(`[User] Loaded existing user: ${this.userInfo.userId}`);
      return this.userInfo;
    }

    // Generate new user info
    this.userInfo = {
      userId: this.generateUserId(),
      deviceId: this.generateDeviceId(),
      deviceName: os.hostname(),
      platform: process.platform,
      arch: process.arch,
      osVersion: os.release(),
      appVersion: config.appVersion,
      createdAt: new Date(),
      lastSeenAt: new Date(),
    };

    this.saveToFile(this.userInfo);

    console.log(`[User] Created new user: ${this.userInfo.userId}`);
    return this.userInfo;
  }

  /**
   * Get current user information
   */
  getUserInfo(): UserInfo {
    if (!this.userInfo) {
      throw new Error('User not initialized. Call initialize() first.');
    }
    return this.userInfo;
  }

  /**
   * Get user ID
   */
  getUserId(): string {
    return this.getUserInfo().userId;
  }

  /**
   * Get device ID
   */
  getDeviceId(): string {
    return this.getUserInfo().deviceId;
  }

  /**
   * Generate user ID
   */
  private generateUserId(): string {
    return `user_${randomUUID()}`;
  }

  /**
   * Generate device ID (based on machine characteristics)
   */
  private generateDeviceId(): string {
    // Generate a deterministic device ID based on machine characteristics
    // This helps identify the same device across reinstalls
    const machineId = this.getMachineId();
    return `device_${machineId}`;
  }

  /**
   * Get machine-specific identifier
   */
  private getMachineId(): string {
    try {
      // Use hostname + platform + arch as a machine fingerprint
      const fingerprint = `${os.hostname()}-${process.platform}-${os.arch()}-${os.cpus()[0]?.model || 'unknown'}`;

      // Create a simple hash (not cryptographic, just for identification)
      let hash = 0;
      for (let i = 0; i < fingerprint.length; i++) {
        const char = fingerprint.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
      }

      // Convert to alphanumeric string
      return Math.abs(hash).toString(36);
    } catch (error) {
      console.warn('[User] Failed to generate machine ID, using random ID:', error);
      return randomUUID().replace(/-/g, '').substring(0, 12);
    }
  }

  /**
   * Load user info from file
   */
  private loadFromFile(): UserInfo | null {
    if (!this.userFilePath) {
      return null;
    }

    try {
      if (!fs.existsSync(this.userFilePath)) {
        return null;
      }

      const content = fs.readFileSync(this.userFilePath, 'utf-8');
      const data = JSON.parse(content);

      // Convert date strings to Date objects
      if (data.createdAt) {
        data.createdAt = new Date(data.createdAt);
      }
      if (data.lastSeenAt) {
        data.lastSeenAt = new Date(data.lastSeenAt);
      }

      return data as UserInfo;
    } catch (error) {
      console.error('[User] Failed to load user info from file:', error);
      return null;
    }
  }

  /**
   * Save user info to file
   */
  private saveToFile(userInfo: UserInfo): void {
    if (!this.userFilePath) {
      throw new Error('User file path not set');
    }

    try {
      const content = JSON.stringify(userInfo, null, 2);
      fs.writeFileSync(this.userFilePath, content, 'utf-8');
    } catch (error) {
      console.error('[User] Failed to save user info to file:', error);
      throw error;
    }
  }

  /**
   * Update last seen timestamp
   */
  async updateLastSeen(): Promise<void> {
    if (!this.userInfo) {
      return;
    }

    this.userInfo.lastSeenAt = new Date();
    this.saveToFile(this.userInfo);
  }

  /**
   * Get device information summary
   */
  getDeviceSummary(): {
    deviceName: string;
    platform: string;
    osVersion: string;
    appVersion: string;
  } {
    const info = this.getUserInfo();
    return {
      deviceName: info.deviceName,
      platform: `${info.platform} ${info.arch}`,
      osVersion: info.osVersion,
      appVersion: info.appVersion,
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.userInfo) {
      await this.updateLastSeen();
    }
  }
}

// Singleton instance
const userManager = new UserManager();

export default userManager;
export { userManager };
