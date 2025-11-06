import { Redis } from '@upstash/redis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/** Redis cache service for distributed caching using Upstash REST API */
class CacheService {
  private client: Redis | null = null;
  private isConnected = false;

  /** Initialize Redis connection */
  async connect(): Promise<void> {
    if (!config.redis.restUrl || !config.redis.restToken) {
      logger.warn('Redis credentials not configured. Running without cache.');
      return;
    }

    try {
      this.client = new Redis({
        url: config.redis.restUrl,
        token: config.redis.restToken,
      });

      // Test connection
      const result = await this.client.ping();
      if (result === 'PONG') {
        this.isConnected = true;
        logger.info('✅ Redis cache service initialized');
      } else {
        throw new Error('Unexpected ping response');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to connect to Redis');
      this.client = null;
      this.isConnected = false;
    }
  }

  /** Disconnect from Redis */
  async disconnect(): Promise<void> {
    // Upstash REST client doesn't require explicit disconnect
    this.client = null;
    this.isConnected = false;
    logger.info('👋 Redis disconnected');
  }

  /** Get value from cache */
  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) {
      return null;
    }

    try {
      // Upstash client automatically deserializes JSON stored as strings
      // So we fetch as unknown and let TypeScript handle the rest
      const value = await this.client.get<T>(key);
      return value;
    } catch (error) {
      logger.error({ error, key, errorMessage: error instanceof Error ? error.message : 'Unknown error' }, 'Cache get error');
      return null;
    }
  }

  /** Set value in cache with TTL */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      // Upstash client handles JSON serialization automatically
      // We store the value directly
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error({ error, key }, 'Cache set error');
    }
  }

  /** Delete value from cache */
  async delete(key: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      logger.error({ error, key }, 'Cache delete error');
    }
  }

  /** Check if key exists in cache */
  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ error, key }, 'Cache exists error');
      return false;
    }
  }

  /** Increment a counter */
  async increment(key: string, ttlSeconds?: number): Promise<number> {
    if (!this.client || !this.isConnected) {
      return 0;
    }

    try {
      const value = await this.client.incr(key);
      if (ttlSeconds && value === 1) {
        // Set TTL only on first increment
        await this.client.expire(key, ttlSeconds);
      }
      return value;
    } catch (error) {
      logger.error({ error, key }, 'Cache increment error');
      return 0;
    }
  }

  /** Get cache statistics */
  async getStats(): Promise<{ connected: boolean; keys?: number }> {
    if (!this.client || !this.isConnected) {
      return { connected: false };
    }

    try {
      const keys = await this.client.dbsize();
      return { connected: true, keys };
    } catch (error) {
      logger.error({ error }, 'Failed to get cache stats');
      return { connected: false };
    }
  }
}

/** Singleton instance */
export const cacheService = new CacheService();
