import { beforeAll, afterAll } from 'vitest';
import { cacheService } from '../src/services/cache.js';
import { databaseService } from '../src/services/database.js';

/** Setup before all tests */
beforeAll(async () => {
  // Connect to services for integration tests
  await Promise.all([cacheService.connect(), databaseService.connect()]);
});

/** Cleanup after all tests */
afterAll(async () => {
  // Disconnect from services
  await Promise.all([cacheService.disconnect(), databaseService.disconnect()]);
});
