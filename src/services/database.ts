import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

/** PostgreSQL database service */
class DatabaseService {
  private pool: pg.Pool | null = null;
  private isConnected = false;

  /** Initialize database connection pool */
  async connect(): Promise<void> {
    if (!config.database.url) {
      console.warn('⚠️  Database URL not configured. Running without database.');
      return;
    }

    try {
      this.pool = new Pool({
        connectionString: config.database.url,
        ssl: config.server.isProduction ? { rejectUnauthorized: false } : undefined,
        max: 20, // Maximum pool size
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      console.log('✅ Database connected');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      this.pool = null;
    }
  }

  /** Disconnect from database */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      console.log('👋 Database disconnected');
    }
  }

  /** Execute a query */
  async query<T = unknown>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Database not connected');
    }

    try {
      return await this.pool.query<T>(text, params);
    } catch (error) {
      console.error('❌ Database query error:', error);
      throw error;
    }
  }

  /** Get a client from the pool for transactions */
  async getClient(): Promise<pg.PoolClient> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Database not connected');
    }

    return await this.pool.connect();
  }

  /** Check if database is connected */
  get connected(): boolean {
    return this.isConnected;
  }

  /** Get database statistics */
  async getStats(): Promise<{ connected: boolean; poolSize?: number; idleCount?: number }> {
    if (!this.pool || !this.isConnected) {
      return { connected: false };
    }

    return {
      connected: true,
      poolSize: this.pool.totalCount,
      idleCount: this.pool.idleCount,
    };
  }
}

/** Singleton instance */
export const databaseService = new DatabaseService();
