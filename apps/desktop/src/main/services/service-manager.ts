/**
 * Service Manager
 * Orchestrates service lifecycle with dependency management
 */

import { configManager } from '../config.js';
import { databaseManager } from '../infrastructure/database.js';
import { redisManager } from '../infrastructure/redis.js';
import { userManager } from '../infrastructure/user.js';
import { permissionManager } from '../infrastructure/permissions.js';
import { eventBus, EventType } from '../infrastructure/event-bus.js';
import { settingsService } from './settings.js';
import { DNSService } from './dns.js';
import { NetworkService } from './network.js';
import { PrivacyService } from './privacy.js';

export enum ServiceStatus {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  ERROR = 'error',
  DEGRADED = 'degraded', // Running but with limited functionality
}

interface ServiceState {
  status: ServiceStatus;
  message?: string;
  error?: Error;
  lastStarted?: Date;
  lastStopped?: Date;
}

/**
 * Service Manager
 * Manages initialization order and lifecycle of all services
 */
export class ServiceManager {
  private services: Map<string, ServiceState> = new Map();
  private dnsService: DNSService | null = null;
  private networkService: NetworkService | null = null;
  private privacyService: PrivacyService | null = null;
  private isInitialized = false;

  constructor() {
    this.initializeServiceStates();
  }

  /**
   * Initialize service states
   */
  private initializeServiceStates(): void {
    this.services.set('database', { status: ServiceStatus.STOPPED });
    this.services.set('redis', { status: ServiceStatus.STOPPED });
    this.services.set('user', { status: ServiceStatus.STOPPED });
    this.services.set('settings', { status: ServiceStatus.STOPPED });
    this.services.set('dns', { status: ServiceStatus.STOPPED });
    this.services.set('network', { status: ServiceStatus.STOPPED });
    this.services.set('privacy', { status: ServiceStatus.STOPPED });
  }

  /**
   * Get status of all services
   */
  getStatus(): Map<string, ServiceState> {
    return new Map(this.services);
  }

  /**
   * Get status of a specific service
   */
  getServiceStatus(serviceName: string): ServiceState | undefined {
    return this.services.get(serviceName);
  }

  /**
   * Check if all critical services are running
   */
  isHealthy(): boolean {
    const database = this.services.get('database');
    const user = this.services.get('user');

    return database?.status === ServiceStatus.RUNNING && user?.status === ServiceStatus.RUNNING;
  }

  /**
   * Initialize all services in correct order
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[ServiceManager] Already initialized');
      return;
    }

    console.log('[ServiceManager] Starting initialization...');

    try {
      // Load configuration
      console.log('[ServiceManager] Loading configuration...');
      const config = configManager.load();
      console.log(`[ServiceManager] Environment: ${config.nodeEnv}`);

      // Check permissions (non-blocking)
      await this.checkPermissions();

      // Phase 1: Infrastructure (critical, sequential)
      await this.initializeDatabase();
      await this.initializeRedis(); // Non-blocking failure
      await this.initializeUser();
      await this.initializeSettings();

      // Phase 2: Services (can fail gracefully, parallel)
      await this.initializeServices();

      this.isInitialized = true;
      console.log('[ServiceManager] Initialization complete');
    } catch (error) {
      console.error('[ServiceManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check platform permissions
   */
  private async checkPermissions(): Promise<void> {
    try {
      console.log('[ServiceManager] Checking permissions...');
      const status = await permissionManager.getStatusMessage();
      console.log('[ServiceManager] Permission status:\n' + status);
    } catch (error) {
      console.warn('[ServiceManager] Permission check failed:', error);
    }
  }

  /**
   * Initialize database connection
   */
  private async initializeDatabase(): Promise<void> {
    this.setServiceStatus('database', ServiceStatus.STARTING);

    try {
      console.log('[ServiceManager] Connecting to database...');
      await databaseManager.connect();

      // Run health check
      const healthy = await databaseManager.healthCheck();
      if (!healthy) {
        throw new Error('Database health check failed');
      }

      this.setServiceStatus('database', ServiceStatus.RUNNING, 'Connected');
      console.log('[ServiceManager] Database connected successfully');
    } catch (error) {
      this.setServiceStatus('database', ServiceStatus.ERROR, undefined, error as Error);
      throw error; // Database is critical
    }
  }

  /**
   * Initialize Redis connection (optional)
   */
  private async initializeRedis(): Promise<void> {
    this.setServiceStatus('redis', ServiceStatus.STARTING);

    try {
      console.log('[ServiceManager] Connecting to Redis...');
      await redisManager.connect();

      if (redisManager.isConnected()) {
        this.setServiceStatus('redis', ServiceStatus.RUNNING, 'Connected');
        console.log('[ServiceManager] Redis connected successfully');
      } else {
        // Redis disabled or unavailable
        this.setServiceStatus('redis', ServiceStatus.DEGRADED, 'Disabled or unavailable');
        console.log('[ServiceManager] Continuing without Redis');
      }
    } catch (error) {
      this.setServiceStatus('redis', ServiceStatus.DEGRADED, 'Connection failed', error as Error);
      console.warn('[ServiceManager] Redis connection failed, continuing without cache:', error);
      // Don't throw - Redis is optional
    }
  }

  /**
   * Initialize user/device management
   */
  private async initializeUser(): Promise<void> {
    this.setServiceStatus('user', ServiceStatus.STARTING);

    try {
      console.log('[ServiceManager] Initializing user/device...');
      const userInfo = await userManager.initialize();

      this.setServiceStatus('user', ServiceStatus.RUNNING, `User: ${userInfo.userId}`);
      console.log(`[ServiceManager] User initialized: ${userInfo.userId} (${userInfo.deviceName})`);
    } catch (error) {
      this.setServiceStatus('user', ServiceStatus.ERROR, undefined, error as Error);
      throw error; // User is critical
    }
  }

  /**
   * Initialize settings service
   */
  private async initializeSettings(): Promise<void> {
    this.setServiceStatus('settings', ServiceStatus.STARTING);

    try {
      console.log('[ServiceManager] Initializing settings service...');
      await settingsService.initialize();

      this.setServiceStatus('settings', ServiceStatus.RUNNING, 'Settings loaded');
      console.log('[ServiceManager] Settings service initialized');
    } catch (error) {
      this.setServiceStatus('settings', ServiceStatus.ERROR, undefined, error as Error);
      // Settings is important but not critical - use defaults
      console.warn('[ServiceManager] Settings service failed, using defaults:', error);
    }
  }

  /**
   * Initialize application services (parallel)
   */
  private async initializeServices(): Promise<void> {
    const config = configManager.get();
    const results = await Promise.allSettled([
      this.initializeDNSService(),
      config.enableNetworkMonitor ? this.initializeNetworkService() : Promise.resolve(),
      this.initializePrivacyService(),
    ]);

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const serviceName = ['dns', 'network', 'privacy'][index];
        console.error(`[ServiceManager] ${serviceName} service failed:`, result.reason);
      }
    });
  }

  /**
   * Initialize DNS service
   */
  private async initializeDNSService(): Promise<void> {
    this.setServiceStatus('dns', ServiceStatus.STARTING);

    try {
      console.log('[ServiceManager] Initializing DNS service...');
      this.dnsService = new DNSService();
      await this.dnsService.initialize();

      this.setServiceStatus('dns', ServiceStatus.RUNNING, 'DNS resolver active');
      console.log('[ServiceManager] DNS service initialized');
    } catch (error) {
      this.setServiceStatus('dns', ServiceStatus.DEGRADED, 'Initialization failed', error as Error);
      console.error('[ServiceManager] DNS service failed, continuing in degraded mode:', error);
      // Don't throw - service will use fallback mode
    }
  }

  /**
   * Initialize network monitoring service
   */
  private async initializeNetworkService(): Promise<void> {
    this.setServiceStatus('network', ServiceStatus.STARTING);

    try {
      console.log('[ServiceManager] Initializing network monitoring service...');
      this.networkService = new NetworkService();
      await this.networkService.initialize();

      this.setServiceStatus('network', ServiceStatus.RUNNING, 'Network monitoring active');
      console.log('[ServiceManager] Network service initialized');
    } catch (error) {
      this.setServiceStatus(
        'network',
        ServiceStatus.DEGRADED,
        'Initialization failed',
        error as Error
      );
      console.error('[ServiceManager] Network service failed, continuing in degraded mode:', error);
      // Don't throw - service will use fallback mode
    }
  }

  /**
   * Initialize privacy scoring service
   */
  private async initializePrivacyService(): Promise<void> {
    this.setServiceStatus('privacy', ServiceStatus.STARTING);

    try {
      console.log('[ServiceManager] Initializing privacy service...');
      this.privacyService = new PrivacyService();
      await this.privacyService.initialize();

      this.setServiceStatus('privacy', ServiceStatus.RUNNING, 'Privacy scoring active');
      console.log('[ServiceManager] Privacy service initialized');
    } catch (error) {
      this.setServiceStatus(
        'privacy',
        ServiceStatus.DEGRADED,
        'Initialization failed',
        error as Error
      );
      console.error('[ServiceManager] Privacy service failed, continuing in degraded mode:', error);
      // Don't throw - service will use fallback mode
    }
  }

  /**
   * Get DNS service instance
   */
  getDNSService(): DNSService | null {
    return this.dnsService;
  }

  /**
   * Get network service instance
   */
  getNetworkService(): NetworkService | null {
    return this.networkService;
  }

  /**
   * Get privacy service instance
   */
  getPrivacyService(): PrivacyService | null {
    return this.privacyService;
  }

  /**
   * Gracefully shutdown all services
   */
  async shutdown(): Promise<void> {
    console.log('[ServiceManager] Starting shutdown...');

    try {
      // Phase 1: Stop application services (parallel)
      await Promise.allSettled([
        this.dnsService?.cleanup(),
        this.networkService?.cleanup(),
        this.privacyService?.cleanup(),
      ]);

      // Phase 2: Cleanup user and settings
      if (userManager) {
        await userManager.cleanup();
        this.setServiceStatus('user', ServiceStatus.STOPPED);
      }

      if (settingsService) {
        await settingsService.cleanup();
        this.setServiceStatus('settings', ServiceStatus.STOPPED);
      }

      // Phase 3: Close infrastructure (sequential, reverse order)
      if (redisManager) {
        await redisManager.cleanup();
        this.setServiceStatus('redis', ServiceStatus.STOPPED);
      }

      if (databaseManager) {
        await databaseManager.cleanup();
        this.setServiceStatus('database', ServiceStatus.STOPPED);
      }

      // Cleanup event bus
      eventBus.cleanup();

      this.isInitialized = false;
      console.log('[ServiceManager] Shutdown complete');
    } catch (error) {
      console.error('[ServiceManager] Shutdown failed:', error);
      throw error;
    }
  }

  /**
   * Restart a specific service
   */
  async restartService(serviceName: string): Promise<void> {
    console.log(`[ServiceManager] Restarting ${serviceName} service...`);

    switch (serviceName) {
      case 'dns':
        if (this.dnsService) {
          await this.dnsService.cleanup();
        }
        await this.initializeDNSService();
        break;

      case 'network':
        if (this.networkService) {
          await this.networkService.cleanup();
        }
        await this.initializeNetworkService();
        break;

      case 'privacy':
        if (this.privacyService) {
          await this.privacyService.cleanup();
        }
        await this.initializePrivacyService();
        break;

      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }

    console.log(`[ServiceManager] ${serviceName} service restarted`);
  }

  /**
   * Get service health summary
   */
  getHealthSummary(): {
    healthy: boolean;
    services: Array<{ name: string; status: ServiceStatus; message?: string }>;
  } {
    const services = Array.from(this.services.entries()).map(([name, state]) => ({
      name,
      status: state.status,
      message: state.message,
    }));

    return {
      healthy: this.isHealthy(),
      services,
    };
  }

  /**
   * Set service status
   */
  private setServiceStatus(
    serviceName: string,
    status: ServiceStatus,
    message?: string,
    error?: Error
  ): void {
    const state: ServiceState = {
      status,
      message,
      error,
      lastStarted:
        status === ServiceStatus.RUNNING ? new Date() : this.services.get(serviceName)?.lastStarted,
      lastStopped:
        status === ServiceStatus.STOPPED ? new Date() : this.services.get(serviceName)?.lastStopped,
    };

    this.services.set(serviceName, state);

    // Emit event
    if (status === ServiceStatus.RUNNING) {
      eventBus.emit(EventType.SERVICE_STARTED, {
        serviceName,
        timestamp: new Date(),
      });
    } else if (status === ServiceStatus.STOPPED) {
      eventBus.emit(EventType.SERVICE_STOPPED, {
        serviceName,
        reason: message,
        timestamp: new Date(),
      });
    } else if (status === ServiceStatus.ERROR) {
      eventBus.emit(EventType.SERVICE_ERROR, {
        serviceName,
        error: error || new Error('Unknown error'),
        timestamp: new Date(),
      });
    }
  }
}

// Singleton instance
const serviceManager = new ServiceManager();

export default serviceManager;
export { serviceManager };
