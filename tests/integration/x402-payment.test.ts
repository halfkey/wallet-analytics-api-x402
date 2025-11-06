import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createApp } from '../../src/app.js';
import { MockPaymentValidator } from '../../src/services/payment/mock.js';
import { cacheService } from '../../src/services/cache.js';
import { databaseService } from '../../src/services/database.js';
import type { FastifyInstance } from 'fastify';

describe('x402 Payment Middleware Integration', () => {
  let app: FastifyInstance;
  const testEndpoint = '/api/v1/wallet/test-address/overview';
  const testNonces: string[] = [];

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Clean up test nonces from cache and database
    for (const nonce of testNonces) {
      await cacheService.delete(`payment:nonce:${nonce}`);
      await cacheService.delete(`payment:validated:${nonce}`);
      await databaseService.query('DELETE FROM payment_proofs WHERE nonce = $1', [nonce]);
    }
    testNonces.length = 0;
  });

  describe('402 Payment Required', () => {
    it('should return 402 when no payment proof provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: testEndpoint,
      });

      expect(response.statusCode).toBe(402);
      expect(response.headers['x-payment-required']).toBe('x402');
      expect(response.headers['x-payment-amount']).toBeDefined();
      expect(response.headers['x-payment-currency']).toBe('USDC');
      expect(response.headers['x-payment-network']).toBe('solana');
      expect(response.headers['x-payment-challenge']).toBeDefined();

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Payment Required');
      expect(body.payment).toBeDefined();
      expect(body.payment.protocol).toBe('x402');
      expect(body.payment.amount).toBeGreaterThan(0);
      expect(body.payment.challenge).toBeDefined();
    });

    it('should include valid payment challenge in 402 response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: testEndpoint,
      });

      expect(response.statusCode).toBe(402);

      const body = JSON.parse(response.body);
      const challenge = body.payment.challenge;

      // Decode base64 challenge
      const decodedChallenge = JSON.parse(Buffer.from(challenge, 'base64').toString('utf-8'));

      expect(decodedChallenge.protocol).toBe('x402');
      expect(decodedChallenge.nonce).toMatch(/^nonce-/);
      expect(decodedChallenge.amount).toBeGreaterThan(0);
      expect(decodedChallenge.currency).toBe('USDC');
      expect(decodedChallenge.network).toBe('solana');
      expect(decodedChallenge.timestamp).toBeDefined();
      expect(decodedChallenge.expiresAt).toBeDefined();

      testNonces.push(decodedChallenge.nonce);
    });
  });

  describe('400 Bad Request', () => {
    it('should return 400 for invalid payment proof format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: testEndpoint,
        headers: {
          'x-payment-proof': 'invalid-base64-!@#$',
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toContain('Invalid payment proof');
    });

    it('should return 400 for malformed payment proof JSON', async () => {
      const invalidProof = Buffer.from('{"invalid": "json"').toString('base64');

      const response = await app.inject({
        method: 'GET',
        url: testEndpoint,
        headers: {
          'x-payment-proof': invalidProof,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('403 Payment Invalid', () => {
    it('should return 403 for payment with wrong amount', async () => {
      // First get a challenge to get the nonce
      const challengeResponse = await app.inject({
        method: 'GET',
        url: testEndpoint,
      });

      const challengeBody = JSON.parse(challengeResponse.body);
      const decodedChallenge = JSON.parse(
        Buffer.from(challengeBody.payment.challenge, 'base64').toString('utf-8')
      );
      testNonces.push(decodedChallenge.nonce);

      // Create payment proof with wrong amount
      const wrongProof = MockPaymentValidator.generateMockProof(0.001, 'TestWallet1234567890123456789012'); // Wrong amount (32 char wallet)
      wrongProof.nonce = decodedChallenge.nonce; // Use valid nonce

      const proofHeader = Buffer.from(JSON.stringify(wrongProof)).toString('base64');

      const response = await app.inject({
        method: 'GET',
        url: testEndpoint,
        headers: {
          'x-payment-proof': proofHeader,
        },
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Payment Invalid');
      expect(body.message).toContain('Amount mismatch');
    });

    it('should return 403 for expired payment proof', async () => {
      // Get challenge
      const challengeResponse = await app.inject({
        method: 'GET',
        url: testEndpoint,
      });

      const challengeBody = JSON.parse(challengeResponse.body);
      const decodedChallenge = JSON.parse(
        Buffer.from(challengeBody.payment.challenge, 'base64').toString('utf-8')
      );
      testNonces.push(decodedChallenge.nonce);

      // Create expired proof (10 minutes old)
      const expiredProof = MockPaymentValidator.generateMockProof(
        decodedChallenge.amount,
        'TestWallet1234567890123456789012' // 32 char wallet
      );
      expiredProof.nonce = decodedChallenge.nonce;
      expiredProof.timestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      const proofHeader = Buffer.from(JSON.stringify(expiredProof)).toString('base64');

      const response = await app.inject({
        method: 'GET',
        url: testEndpoint,
        headers: {
          'x-payment-proof': proofHeader,
        },
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.message).toContain('expired');
    });

    it('should return 403 for unknown nonce', async () => {
      // Create proof with nonce that was never issued
      const unknownProof = MockPaymentValidator.generateMockProof(0.05, 'TestWallet1234567890123456789012');
      unknownProof.nonce = 'nonce-unknown-12345';

      const proofHeader = Buffer.from(JSON.stringify(unknownProof)).toString('base64');

      const response = await app.inject({
        method: 'GET',
        url: testEndpoint,
        headers: {
          'x-payment-proof': proofHeader,
        },
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.message).toContain('nonce');
    });
  });

  describe('200 Success with Valid Payment', () => {
    it('should grant access with valid payment proof', async () => {
      // Step 1: Get payment challenge
      const challengeResponse = await app.inject({
        method: 'GET',
        url: testEndpoint,
      });

      expect(challengeResponse.statusCode).toBe(402);

      const challengeBody = JSON.parse(challengeResponse.body);
      const decodedChallenge = JSON.parse(
        Buffer.from(challengeBody.payment.challenge, 'base64').toString('utf-8')
      );
      testNonces.push(decodedChallenge.nonce);

      // Step 2: Create valid payment proof
      const validProof = MockPaymentValidator.generateMockProof(
        decodedChallenge.amount,
        'TestWallet1234567890123456789012' // 32 char wallet
      );
      validProof.nonce = decodedChallenge.nonce;

      const proofHeader = Buffer.from(JSON.stringify(validProof)).toString('base64');

      // Step 3: Make request with payment proof
      const response = await app.inject({
        method: 'GET',
        url: testEndpoint,
        headers: {
          'x-payment-proof': proofHeader,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.payment).toBeDefined();
      expect(body.payment.wallet).toBe('TestWallet1234567890123456789012');
      expect(body.payment.amount).toBe(decodedChallenge.amount);
    });

    it('should include payment info in request context', async () => {
      // Get challenge
      const challengeResponse = await app.inject({
        method: 'GET',
        url: testEndpoint,
      });

      const challengeBody = JSON.parse(challengeResponse.body);
      const decodedChallenge = JSON.parse(
        Buffer.from(challengeBody.payment.challenge, 'base64').toString('utf-8')
      );
      testNonces.push(decodedChallenge.nonce);

      // Create and send valid payment
      const validProof = MockPaymentValidator.generateMockProof(
        decodedChallenge.amount,
        'PaymentWallet123456789012345678' // 32 char wallet
      );
      validProof.nonce = decodedChallenge.nonce;

      const proofHeader = Buffer.from(JSON.stringify(validProof)).toString('base64');

      const response = await app.inject({
        method: 'GET',
        url: testEndpoint,
        headers: {
          'x-payment-proof': proofHeader,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.payment.wallet).toBe('PaymentWallet123456789012345678');
      expect(body.payment.currency).toBe('USDC');
      expect(body.payment.verifiedAt).toBeDefined();
    });
  });

  describe('Replay Attack Prevention', () => {
    it('should prevent reuse of payment proof', async () => {
      // Step 1: Get challenge
      const challengeResponse = await app.inject({
        method: 'GET',
        url: testEndpoint,
      });

      const challengeBody = JSON.parse(challengeResponse.body);
      const decodedChallenge = JSON.parse(
        Buffer.from(challengeBody.payment.challenge, 'base64').toString('utf-8')
      );
      testNonces.push(decodedChallenge.nonce);

      // Step 2: Create valid payment proof
      const validProof = MockPaymentValidator.generateMockProof(
        decodedChallenge.amount,
        'ReplayTestWallet12345678901234567' // 35 char wallet
      );
      validProof.nonce = decodedChallenge.nonce;

      const proofHeader = Buffer.from(JSON.stringify(validProof)).toString('base64');

      // Step 3: First request should succeed
      const response1 = await app.inject({
        method: 'GET',
        url: testEndpoint,
        headers: {
          'x-payment-proof': proofHeader,
        },
      });

      expect(response1.statusCode).toBe(200);

      // Step 4: Second request with same proof should fail (replay attack)
      const response2 = await app.inject({
        method: 'GET',
        url: testEndpoint,
        headers: {
          'x-payment-proof': proofHeader,
        },
      });

      expect(response2.statusCode).toBe(403);

      const body = JSON.parse(response2.body);
      expect(body.message).toContain('replay attack');
    });
  });

  describe('Free Endpoints', () => {
    it('should not require payment for health endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-payment-required']).toBeUndefined();
    });

    it('should not require payment for root endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-payment-required']).toBeUndefined();
    });
  });

  describe('Payment Caching', () => {
    it('should use cached validation for retry requests', async () => {
      // Get challenge
      const challengeResponse = await app.inject({
        method: 'GET',
        url: testEndpoint,
      });

      const challengeBody = JSON.parse(challengeResponse.body);
      const decodedChallenge = JSON.parse(
        Buffer.from(challengeBody.payment.challenge, 'base64').toString('utf-8')
      );
      testNonces.push(decodedChallenge.nonce);

      // Create valid payment
      const validProof = MockPaymentValidator.generateMockProof(
        decodedChallenge.amount,
        'CacheTestWallet12345678901234567' // 35 char wallet
      );
      validProof.nonce = decodedChallenge.nonce;

      const proofHeader = Buffer.from(JSON.stringify(validProof)).toString('base64');

      // First request - validates and caches
      const response1 = await app.inject({
        method: 'GET',
        url: testEndpoint,
        headers: {
          'x-payment-proof': proofHeader,
        },
      });

      expect(response1.statusCode).toBe(200);

      // The payment should now be in cache for retries
      // But it should also be marked as used in database
      // So subsequent requests should fail with replay error

      const response2 = await app.inject({
        method: 'GET',
        url: testEndpoint,
        headers: {
          'x-payment-proof': proofHeader,
        },
      });

      // Should fail because payment was already used and stored in DB
      expect(response2.statusCode).toBe(403);
    });
  });
});
