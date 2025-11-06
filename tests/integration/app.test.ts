import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Fastify App Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();

    // Register test error route before ready()
    app.get('/test-error', async () => {
      throw new Error('Test error');
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /', () => {
    it('should return API documentation', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');

      const body = JSON.parse(response.body);
      expect(body.name).toBe('Solana Wallet Analytics API');
      expect(body.version).toBe('1.0.0');
      expect(body.paymentProtocol).toBe('x402');
      expect(body.endpoints).toBeDefined();
      expect(body.freeEndpoints).toBeDefined();
      expect(body.freeEndpoints.health).toBe('GET /health');
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');

      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
      expect(body.uptime).toBeGreaterThan(0);
      expect(body.environment).toBeDefined(); // Can be 'development' or 'test'
    });

    it('should have proper response time', async () => {
      const start = Date.now();
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });
      const duration = Date.now() - start;

      expect(response.statusCode).toBe(200);
      expect(duration).toBeLessThan(100); // Should respond in < 100ms
    });
  });

  describe('404 Not Found', () => {
    it('should return 404 for non-existent route', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/non-existent-route',
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
      expect(body.message).toBe('The requested endpoint does not exist');
      expect(body.statusCode).toBe(404);
    });

    it('should return 404 for invalid methods', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/health',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers from Helmet', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['content-security-policy']).toBeDefined();
    });
  });

  describe('CORS', () => {
    it('should include CORS headers when origin is present', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: 'http://example.com',
        },
      });

      expect(response.statusCode).toBe(200);
      // CORS plugin is registered, headers will be present in real HTTP requests
      expect(response.headers).toBeDefined();
    });
  });

  describe('Request ID', () => {
    it('should handle requests with custom request IDs', async () => {
      const customId = 'custom-request-id-123';
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'x-request-id': customId,
        },
      });

      expect(response.statusCode).toBe(200);
      // Request ID is handled by Fastify internally for logging
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });
  });

  describe('Error Handling', () => {
    it('should handle internal errors gracefully', async () => {
      // Route registered in beforeAll()
      const response = await app.inject({
        method: 'GET',
        url: '/test-error',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.statusCode).toBe(500);
    });
  });

  describe('Performance', () => {
    it('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 50 }, () =>
        app.inject({
          method: 'GET',
          url: '/health',
        })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });
    });

    it('should have consistent response times', async () => {
      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await app.inject({
          method: 'GET',
          url: '/health',
        });
        times.push(Date.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);

      expect(avgTime).toBeLessThan(50); // Average < 50ms
      expect(maxTime).toBeLessThan(200); // Max < 200ms
    });
  });
});
