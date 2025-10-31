import { describe, it, expect, beforeEach } from 'vitest';
import { cacheService } from '../../../src/services/cache.js';

describe('CacheService', () => {
  const testKey = 'test:key';
  const testValue = { foo: 'bar', number: 42 };

  beforeEach(async () => {
    // Clean up test key before each test
    await cacheService.delete(testKey);
  });

  describe('set and get', () => {
    it('should store and retrieve a value', async () => {
      await cacheService.set(testKey, testValue);
      const retrieved = await cacheService.get<typeof testValue>(testKey);

      expect(retrieved).toEqual(testValue);
    });

    it('should return null for non-existent key', async () => {
      const retrieved = await cacheService.get('non:existent:key');
      expect(retrieved).toBeNull();
    });

    it('should store value with TTL', async () => {
      await cacheService.set(testKey, testValue, 1); // 1 second TTL
      const retrieved = await cacheService.get<typeof testValue>(testKey);
      expect(retrieved).toEqual(testValue);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const expired = await cacheService.get(testKey);
      expect(expired).toBeNull();
    });

    it('should handle complex objects', async () => {
      const complexValue = {
        string: 'test',
        number: 123,
        boolean: true,
        array: [1, 2, 3],
        nested: { foo: 'bar' },
        nullValue: null,
      };

      await cacheService.set(testKey, complexValue);
      const retrieved = await cacheService.get(testKey);
      expect(retrieved).toEqual(complexValue);
    });
  });

  describe('delete', () => {
    it('should delete a key', async () => {
      await cacheService.set(testKey, testValue);
      await cacheService.delete(testKey);
      const retrieved = await cacheService.get(testKey);
      expect(retrieved).toBeNull();
    });

    it('should not error when deleting non-existent key', async () => {
      await expect(cacheService.delete('non:existent:key')).resolves.not.toThrow();
    });
  });

  describe('exists', () => {
    it('should return true for existing key', async () => {
      await cacheService.set(testKey, testValue);
      const exists = await cacheService.exists(testKey);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const exists = await cacheService.exists('non:existent:key');
      expect(exists).toBe(false);
    });
  });

  describe('increment', () => {
    const counterKey = 'test:counter';

    beforeEach(async () => {
      await cacheService.delete(counterKey);
    });

    it('should increment a counter', async () => {
      const value1 = await cacheService.increment(counterKey);
      expect(value1).toBe(1);

      const value2 = await cacheService.increment(counterKey);
      expect(value2).toBe(2);

      const value3 = await cacheService.increment(counterKey);
      expect(value3).toBe(3);
    });

    it('should set TTL on first increment', async () => {
      await cacheService.increment(counterKey, 1); // 1 second TTL
      const exists = await cacheService.exists(counterKey);
      expect(exists).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const expired = await cacheService.exists(counterKey);
      expect(expired).toBe(false);
    });

    it('should not reset TTL on subsequent increments', async () => {
      await cacheService.increment(counterKey, 2); // 2 seconds TTL
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await cacheService.increment(counterKey, 2); // Should not reset TTL
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const expired = await cacheService.exists(counterKey);
      expect(expired).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return connection stats', async () => {
      const stats = await cacheService.getStats();
      expect(stats.connected).toBe(true);
      expect(typeof stats.keys).toBe('number');
    });
  });
});
