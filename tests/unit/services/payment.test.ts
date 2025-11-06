import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { paymentValidator } from '../../../src/services/payment/validator.js';
import { MockPaymentValidator, mockPaymentValidator } from '../../../src/services/payment/mock.js';
import { cacheService } from '../../../src/services/cache.js';
import { databaseService } from '../../../src/services/database.js';
import type { PaymentProof } from '../../../src/schemas/payment.js';

describe('Payment System', () => {
  describe('PaymentValidator', () => {
    describe('nonce generation', () => {
      it('should generate unique nonces', () => {
        const nonce1 = paymentValidator.generateNonce();
        const nonce2 = paymentValidator.generateNonce();

        expect(nonce1).toBeTruthy();
        expect(nonce2).toBeTruthy();
        expect(nonce1).not.toBe(nonce2);
        expect(nonce1).toMatch(/^nonce-\d+-[a-f0-9]{32}$/);
      });
    });

    describe('challenge creation', () => {
      let nonce: string;

      afterEach(async () => {
        if (nonce) {
          await cacheService.delete(`payment:nonce:${nonce}`);
        }
      });

      it('should create a payment challenge', async () => {
        const endpoint = '/api/v1/wallet/test/overview';
        const amount = 0.05;

        const challenge = await paymentValidator.createChallenge(endpoint, amount);

        expect(challenge).toBeDefined();
        expect(challenge.protocol).toBe('x402');
        expect(challenge.amount).toBe(amount);
        expect(challenge.currency).toBe('USDC');
        expect(challenge.network).toBe('solana');
        expect(challenge.nonce).toMatch(/^nonce-\d+-[a-f0-9]{32}$/);
        expect(challenge.timestamp).toBeDefined();
        expect(challenge.expiresAt).toBeDefined();

        nonce = challenge.nonce;

        // Verify nonce is stored in cache
        const cachedNonce = await cacheService.get(`payment:nonce:${nonce}`);
        expect(cachedNonce).toBeDefined();
      });

      it('should set TTL on cached nonce', async () => {
        const challenge = await paymentValidator.createChallenge('/test', 0.01);
        nonce = challenge.nonce;

        const exists = await cacheService.exists(`payment:nonce:${nonce}`);
        expect(exists).toBe(true);
      });
    });

    describe('payment caching', () => {
      const testNonce = `test-cache-${Date.now()}`;

      afterEach(async () => {
        await cacheService.delete(`payment:validated:${testNonce}`);
      });

      it('should cache validated payment', async () => {
        const validatedPayment = {
          valid: true,
          proof: {
            protocol: 'x402' as const,
            nonce: testNonce,
            signature: 'test-sig',
            wallet: 'TestWallet123',
            amount: 0.05,
            currency: 'USDC' as const,
            network: 'solana' as const,
            timestamp: new Date().toISOString(),
          },
          wallet: 'TestWallet123',
          amount: 0.05,
          currency: 'USDC' as const,
          endpoint: '/test',
          verifiedAt: new Date(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        };

        await paymentValidator.cachePayment(validatedPayment);

        const cached = await paymentValidator.getCachedPayment(testNonce);
        expect(cached).toBeDefined();
        expect(cached?.valid).toBe(true);
        expect(cached?.wallet).toBe('TestWallet123');
      });

      it('should return null for non-existent cached payment', async () => {
        const cached = await paymentValidator.getCachedPayment('nonexistent-nonce');
        expect(cached).toBeNull();
      });
    });
  });

  describe('MockPaymentValidator', () => {
    describe('mock proof generation', () => {
      it('should generate valid mock proof', () => {
        const amount = 0.05;
        const wallet = 'TestWallet123';

        const proof = MockPaymentValidator.generateMockProof(amount, wallet);

        expect(proof.protocol).toBe('x402');
        expect(proof.amount).toBe(amount);
        expect(proof.wallet).toBe(wallet);
        expect(proof.currency).toBe('USDC');
        expect(proof.network).toBe('solana');
        expect(proof.nonce).toMatch(/^mock-nonce-/);
        expect(proof.signature).toMatch(/^mock-signature-/);
        expect(proof.timestamp).toBeDefined();
      });

      it('should use default wallet if not provided', () => {
        const proof = MockPaymentValidator.generateMockProof(0.01);
        expect(proof.wallet).toBe('MockWallet123');
      });
    });

    describe('payment validation', () => {
      it('should validate correct payment', async () => {
        const proof: PaymentProof = {
          protocol: 'x402',
          nonce: `test-nonce-${Date.now()}`,
          signature: 'valid-signature-longer-than-10-chars',
          wallet: 'TestWallet123',
          amount: 0.05,
          currency: 'USDC',
          network: 'solana',
          timestamp: new Date().toISOString(),
        };

        const result = await mockPaymentValidator.validatePayment(
          proof,
          0.05,
          '/api/v1/wallet/test/overview'
        );

        expect(result.valid).toBe(true);
        expect(result.wallet).toBe('TestWallet123');
        expect(result.amount).toBe(0.05);
        expect(result.verifiedAt).toBeDefined();
        expect(result.expiresAt).toBeDefined();
      });

      it('should reject payment with amount mismatch', async () => {
        const proof: PaymentProof = {
          protocol: 'x402',
          nonce: `test-nonce-${Date.now()}`,
          signature: 'valid-signature',
          wallet: 'TestWallet123',
          amount: 0.01, // Different from expected
          currency: 'USDC',
          network: 'solana',
          timestamp: new Date().toISOString(),
        };

        const result = await mockPaymentValidator.validatePayment(
          proof,
          0.05, // Expected amount
          '/test'
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Amount mismatch');
      });

      it('should reject payment with expired timestamp', async () => {
        const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

        const proof: PaymentProof = {
          protocol: 'x402',
          nonce: `test-nonce-${Date.now()}`,
          signature: 'valid-signature',
          wallet: 'TestWallet123',
          amount: 0.05,
          currency: 'USDC',
          network: 'solana',
          timestamp: oldTimestamp.toISOString(),
        };

        const result = await mockPaymentValidator.validatePayment(proof, 0.05, '/test');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('expired');
      });

      it('should reject payment with invalid signature', async () => {
        const proof: PaymentProof = {
          protocol: 'x402',
          nonce: `test-nonce-${Date.now()}`,
          signature: 'short', // Too short
          wallet: 'TestWallet123',
          amount: 0.05,
          currency: 'USDC',
          network: 'solana',
          timestamp: new Date().toISOString(),
        };

        const result = await mockPaymentValidator.validatePayment(proof, 0.05, '/test');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid signature');
      });

      it('should allow small variance for fees', async () => {
        const proof: PaymentProof = {
          protocol: 'x402',
          nonce: `test-nonce-${Date.now()}`,
          signature: 'valid-signature',
          wallet: 'TestWallet123',
          amount: 0.0499, // 0.0001 difference (within variance)
          currency: 'USDC',
          network: 'solana',
          timestamp: new Date().toISOString(),
        };

        const result = await mockPaymentValidator.validatePayment(proof, 0.05, '/test');

        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Integration - Full Payment Flow', () => {
    let challengeNonce: string;
    let paymentNonce: string;

    afterEach(async () => {
      // Clean up cache
      if (challengeNonce) {
        await cacheService.delete(`payment:nonce:${challengeNonce}`);
      }
      if (paymentNonce) {
        await cacheService.delete(`payment:nonce:${paymentNonce}`);
        await cacheService.delete(`payment:validated:${paymentNonce}`);

        // Clean up database
        await databaseService.query('DELETE FROM payment_proofs WHERE nonce = $1', [paymentNonce]);
      }
    });

    it('should complete full payment flow', async () => {
      // Step 1: Create challenge
      const endpoint = '/api/v1/wallet/test/overview';
      const amount = 0.05;
      const challenge = await paymentValidator.createChallenge(endpoint, amount);
      challengeNonce = challenge.nonce;

      expect(challenge.nonce).toBeDefined();

      // Step 2: Client creates payment proof using challenge nonce
      const paymentProof: PaymentProof = {
        protocol: 'x402',
        nonce: challenge.nonce,
        signature: 'client-signature-would-be-here',
        wallet: 'ClientWallet123',
        amount: challenge.amount,
        currency: challenge.currency,
        network: challenge.network,
        timestamp: new Date().toISOString(),
      };
      paymentNonce = paymentProof.nonce;

      // Step 3: Validate payment proof
      const validation = await paymentValidator.validatePayment(paymentProof, amount, endpoint);

      expect(validation.valid).toBe(true);
      expect(validation.wallet).toBe('ClientWallet123');

      // Step 4: Verify payment is stored in database
      const stored = await databaseService.query(
        'SELECT * FROM payment_proofs WHERE nonce = $1',
        [paymentProof.nonce]
      );

      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0]?.wallet_address).toBe('ClientWallet123');

      // Step 5: Verify nonce is removed from cache (replay protection)
      const nonceExists = await cacheService.exists(`payment:nonce:${paymentProof.nonce}`);
      expect(nonceExists).toBe(false);
    });

    it('should prevent replay attacks', async () => {
      // Step 1: Create and validate first payment
      const endpoint = '/test';
      const amount = 0.01;
      const challenge = await paymentValidator.createChallenge(endpoint, amount);
      challengeNonce = challenge.nonce;

      const proof: PaymentProof = {
        protocol: 'x402',
        nonce: challenge.nonce,
        signature: 'test-signature',
        wallet: 'TestWallet',
        amount,
        currency: 'USDC',
        network: 'solana',
        timestamp: new Date().toISOString(),
      };
      paymentNonce = proof.nonce;

      const validation1 = await paymentValidator.validatePayment(proof, amount, endpoint);
      expect(validation1.valid).toBe(true);

      // Step 2: Try to reuse the same nonce (replay attack)
      const validation2 = await paymentValidator.validatePayment(proof, amount, endpoint);
      expect(validation2.valid).toBe(false);
      expect(validation2.error).toContain('replay attack');
    });
  });
});
