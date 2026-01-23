import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export interface AppConfig {
  // Database
  databaseUrl: string;

  // Redis
  redisUrl?: string;
  redisEnabled: boolean;

  // Environment
  nodeEnv: 'development' | 'production' | 'test';
  isDevelopment: boolean;
  isProduction: boolean;

  // App
  appName: string;
  appVersion: string;
  appDataPath: string;
  userDataPath: string;

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // Features
  enableNetworkMonitor: boolean;
  enableDnsResolver: boolean;
  enableAiMonitoring: boolean;

  // Performance
  batchSize: number;
  flushInterval: number;
}

class ConfigManager {
  private config: AppConfig | null = null;

  /**
   * Load configuration from environment variables and .env file
   */
  load(): AppConfig {
    if (this.config) {
      return this.config;
    }

    // Load .env file if exists (development)
    this.loadEnvFile();

    const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';

    this.config = {
      // Database - required
      databaseUrl: this.getRequired('DATABASE_URL', this.getDefaultDatabaseUrl()),

      // Redis - optional
      redisUrl: process.env.REDIS_URL,
      redisEnabled: process.env.REDIS_ENABLED !== 'false',

      // Environment
      nodeEnv,
      isDevelopment: nodeEnv === 'development',
      isProduction: nodeEnv === 'production',

      // App
      appName: app.getName(),
      appVersion: app.getVersion(),
      appDataPath: app.getPath('appData'),
      userDataPath: app.getPath('userData'),

      // Logging
      logLevel: (process.env.LOG_LEVEL as any) || (nodeEnv === 'production' ? 'info' : 'debug'),

      // Features
      enableNetworkMonitor: process.env.ENABLE_NETWORK_MONITOR !== 'false',
      enableDnsResolver: process.env.ENABLE_DNS_RESOLVER !== 'false',
      enableAiMonitoring: process.env.ENABLE_AI_MONITORING !== 'false',

      // Performance
      batchSize: parseInt(process.env.BATCH_SIZE || '100', 10),
      flushInterval: parseInt(process.env.FLUSH_INTERVAL || '5000', 10),
    };

    this.validate();

    return this.config;
  }

  /**
   * Get configuration (must call load() first)
   */
  get(): AppConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return this.config;
  }

  /**
   * Load .env file from app root
   */
  private loadEnvFile(): void {
    const envPath = path.join(process.cwd(), '.env');

    if (!fs.existsSync(envPath)) {
      return;
    }

    try {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const lines = envContent.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          // Only set if not already defined
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = value;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load .env file:', error);
    }
  }

  /**
   * Get required environment variable with default fallback
   */
  private getRequired(key: string, defaultValue: string): string {
    const value = process.env[key];
    if (value) {
      return value;
    }

    console.warn(`Environment variable ${key} not set, using default: ${defaultValue}`);
    return defaultValue;
  }

  /**
   * Get default database URL (SQLite in user data directory)
   */
  private getDefaultDatabaseUrl(): string {
    const dbPath = path.join(app.getPath('userData'), 'ankrshield.db');
    return `file:${dbPath}`;
  }

  /**
   * Validate configuration
   */
  private validate(): void {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    // Database URL is required
    if (!this.config.databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    // Validate log level
    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLogLevels.includes(this.config.logLevel)) {
      throw new Error(`Invalid LOG_LEVEL: ${this.config.logLevel}. Must be one of: ${validLogLevels.join(', ')}`);
    }

    // Validate batch size
    if (this.config.batchSize < 1 || this.config.batchSize > 10000) {
      throw new Error('BATCH_SIZE must be between 1 and 10000');
    }

    // Validate flush interval
    if (this.config.flushInterval < 100 || this.config.flushInterval > 60000) {
      throw new Error('FLUSH_INTERVAL must be between 100 and 60000 ms');
    }
  }
}

// Singleton instance
const configManager = new ConfigManager();

export default configManager;
export { configManager };
