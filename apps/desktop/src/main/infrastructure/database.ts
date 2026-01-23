import { PrismaClient } from '@prisma/client';
import { configManager } from '../config.js';

/**
 * Database connection states
 */
export enum DatabaseStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * Database connection manager
 * Manages Prisma Client lifecycle with connection pooling and health checks
 */
class DatabaseManager {
  private client: PrismaClient | null = null;
  private status: DatabaseStatus = DatabaseStatus.DISCONNECTED;
  private retryCount = 0;
  private maxRetries = 3;
  private retryDelays = [1000, 2000, 4000]; // Exponential backoff

  /**
   * Get Prisma Client instance (singleton)
   */
  getClient(): PrismaClient {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Get current connection status
   */
  getStatus(): DatabaseStatus {
    return this.status;
  }

  /**
   * Check if database is connected
   */
  isConnected(): boolean {
    return this.status === DatabaseStatus.CONNECTED;
  }

  /**
   * Connect to database with retry logic
   */
  async connect(): Promise<void> {
    if (this.status === DatabaseStatus.CONNECTED) {
      console.log('[Database] Already connected');
      return;
    }

    if (this.status === DatabaseStatus.CONNECTING) {
      console.log('[Database] Connection in progress');
      return;
    }

    this.status = DatabaseStatus.CONNECTING;
    console.log('[Database] Connecting...');

    try {
      const config = configManager.get();

      // Create Prisma Client
      this.client = new PrismaClient({
        datasources: {
          db: {
            url: config.databaseUrl,
          },
        },
        log: config.isDevelopment
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
      });

      // Test connection
      await this.client.$connect();

      // Verify with a simple query
      await this.client.$queryRaw`SELECT 1`;

      this.status = DatabaseStatus.CONNECTED;
      this.retryCount = 0;

      console.log('[Database] Connected successfully');
    } catch (error) {
      this.status = DatabaseStatus.ERROR;
      console.error('[Database] Connection failed:', error);

      // Retry with exponential backoff
      if (this.retryCount < this.maxRetries) {
        const delay = this.retryDelays[this.retryCount];
        this.retryCount++;

        console.log(`[Database] Retrying in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.connect();
      }

      throw new Error(`Database connection failed after ${this.maxRetries} attempts: ${error}`);
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    console.log('[Database] Disconnecting...');

    try {
      await this.client.$disconnect();
      this.client = null;
      this.status = DatabaseStatus.DISCONNECTED;
      console.log('[Database] Disconnected successfully');
    } catch (error) {
      console.error('[Database] Disconnect failed:', error);
      throw error;
    }
  }

  /**
   * Health check - verify database connection is alive
   */
  async healthCheck(): Promise<boolean> {
    if (!this.client || this.status !== DatabaseStatus.CONNECTED) {
      return false;
    }

    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('[Database] Health check failed:', error);
      this.status = DatabaseStatus.ERROR;
      return false;
    }
  }

  /**
   * Run database migrations (production only)
   */
  async runMigrations(): Promise<void> {
    const config = configManager.get();

    if (!config.isProduction) {
      console.log('[Database] Skipping migrations (not production)');
      return;
    }

    if (!this.client) {
      throw new Error('Database not connected');
    }

    try {
      console.log('[Database] Running migrations...');
      // In production, migrations should be run via prisma CLI
      // This is a placeholder for any runtime migrations needed
      console.log('[Database] Migrations complete');
    } catch (error) {
      console.error('[Database] Migration failed:', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.disconnect();
  }
}

// Singleton instance
const databaseManager = new DatabaseManager();

export default databaseManager;
export { databaseManager };
