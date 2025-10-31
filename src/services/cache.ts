import { Redis } from 'ioredis';
import { config } from '../config/index.js';

/** Redis cache service for distributed caching */
class CacheService {
  private client: Redis | null = null;
  private isConnected = false;

  /** Initialize Redis connection */
  async connect(): Promise<void> {
    if (!config.redis.url) {
      console.warn('⚠️  Redis URL not configured. Running without cache.');
      return;
    }

    try {
      this.client = new Redis(config.redis.url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
        tls: {
          rejectUnauthorized: false, // Upstash requires TLS
        },
      });

      await this.client.connect();

      this.client.on('error', (error: Error) => {
        console.error('❌ Redis connection error:', error);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('✅ Redis connected');
        this.isConnected = true;
      });

      this.isConnected = true;
      console.log('✅ Redis cache service initialized');
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      this.client = null;
    }
  }

  /** Disconnect from Redis */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      console.log('👋 Redis disconnected');
    }
  }

  /** Get value from cache */
  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`❌ Cache get error for key "${key}":`, error);
      return null;
    }
  }

  /** Set value in cache with TTL */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      console.error(`❌ Cache set error for key "${key}":`, error);
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
      console.error(`❌ Cache delete error for key "${key}":`, error);
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
      console.error(`❌ Cache exists error for key "${key}":`, error);
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
      console.error(`❌ Cache increment error for key "${key}":`, error);
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
      console.error('❌ Failed to get cache stats:', error);
      return { connected: false };
    }
  }
}

/** Singleton instance */
export const cacheService = new CacheService();
