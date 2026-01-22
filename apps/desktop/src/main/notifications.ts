/**
 * Notification Service
 * Native OS notifications for privacy alerts
 */

import { Notification } from 'electron';
import * as path from 'path';
import { showMainWindow } from './window';

export interface NotificationOptions {
  silent?: boolean;
  urgency?: 'normal' | 'critical' | 'low';
  timeoutType?: 'default' | 'never';
}

/**
 * Notification Service
 * Manages native OS notifications
 */
export class NotificationService {
  private enabled: boolean = true;

  constructor() {
    // Check if notifications are supported
    if (!Notification.isSupported()) {
      console.warn('Notifications not supported on this platform');
      this.enabled = false;
    }
  }

  /**
   * Show a notification
   */
  show(title: string, body: string, options?: NotificationOptions): void {
    if (!this.enabled || !Notification.isSupported()) {
      return;
    }

    try {
      const notification = new Notification({
        title,
        body,
        icon: this.getIcon(),
        silent: options?.silent || false,
        urgency: options?.urgency || 'normal',
        timeoutType: options?.timeoutType || 'default',
      });

      // Handle notification click
      notification.on('click', () => {
        showMainWindow();
      });

      notification.show();
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  /**
   * Show privacy alert
   */
  showPrivacyAlert(score: number): void {
    if (score > 80) {
      this.show(
        'Privacy Alert',
        `Your privacy score is critical: ${score}/100. Click to view details.`,
        { urgency: 'critical' }
      );
    } else if (score > 60) {
      this.show(
        'Privacy Warning',
        `Your privacy score is poor: ${score}/100. Consider reviewing your settings.`,
        { urgency: 'normal' }
      );
    }
  }

  /**
   * Show tracker blocked notification
   */
  showTrackerBlocked(domain: string, count: number): void {
    this.show(
      'Tracker Blocked',
      `Blocked ${count} connection${count > 1 ? 's' : ''} to ${domain}`,
      { silent: true, urgency: 'low' }
    );
  }

  /**
   * Show protection status notification
   */
  showProtectionStatus(enabled: boolean): void {
    this.show(
      enabled ? 'Protection Enabled' : 'Protection Disabled',
      enabled
        ? 'ankrshield is now protecting your privacy'
        : 'Privacy protection has been paused',
      { urgency: 'normal' }
    );
  }

  /**
   * Show update available notification
   */
  showUpdateAvailable(version: string): void {
    this.show(
      'Update Available',
      `Version ${version} is available. Downloading...`,
      { urgency: 'normal' }
    );
  }

  /**
   * Show update downloaded notification
   */
  showUpdateDownloaded(version: string): void {
    this.show(
      'Update Ready',
      `Version ${version} has been downloaded. Restart to install.`,
      { urgency: 'normal', timeoutType: 'never' }
    );
  }

  /**
   * Show error notification
   */
  showError(message: string): void {
    this.show(
      'Error',
      message,
      { urgency: 'critical' }
    );
  }

  /**
   * Enable notifications
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable notifications
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled(): boolean {
    return this.enabled && Notification.isSupported();
  }

  /**
   * Get app icon for notifications
   */
  private getIcon(): string {
    const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
    return path.join(__dirname, '../assets/icons', iconName);
  }
}
