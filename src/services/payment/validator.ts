import crypto from 'crypto';
import { config } from '../../config/index.js';
import type { PaymentProof, PaymentChallenge } from '../../schemas/payment.js';
import type { ValidatedPayment } from '../../types/payment.js';
import { cacheService } from '../cache.js';
import { databaseService } from '../database.js';
import { mockPaymentValidator } from './mock.js';
import { payAIPaymentValidator } from './payai.js';
import { logger } from '../../utils/logger.js';

/** Payment validator service */
export class PaymentValidator {
  /** Generate a unique nonce for payment challenge */
  generateNonce(): string {
    return `nonce-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
  }

  /** Create a payment challenge for an endpoint */
  async createChallenge(endpoint: string, amount: number): Promise<PaymentChallenge> {
    const nonce = this.generateNonce();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

    const challenge: PaymentChallenge = {
      protocol: 'x402',
      amount,
      currency: 'USDC',
      network: 'solana',
      address: config.payment.facilitatorUrl || 'PayAI-Facilitator',
      nonce,
      facilitatorUrl: config.payment.facilitatorUrl,
      timestamp: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    // Store nonce in cache with TTL to prevent replay attacks
    await cacheService.set(`payment:nonce:${nonce}`, {
      created: now.toISOString(),
      endpoint,
      amount,
    }, 300); // 5 minutes TTL (matches payment expiry)

    logger.debug({ nonce, endpoint, amount }, 'Payment challenge created');

    return challenge;
  }

  /** Validate a payment proof */
  async validatePayment(
    proof: PaymentProof,
    expectedAmount: number,
    endpoint: string
  ): Promise<ValidatedPayment> {
    const nonceKey = `payment:nonce:${proof.nonce}`;

    // In mock mode, skip nonce validation from cache (for testing without Redis)
    // In production modes, always validate nonce from cache
    if (config.payment.mode !== 'mock') {
      // Check if nonce has been used before (replay protection)
      const nonceData = await cacheService.get<{ created: string; endpoint: string; amount: number }>(nonceKey);

      if (!nonceData) {
        logger.warn({ nonce: proof.nonce }, 'Payment proof with unknown or expired nonce');
        return {
          valid: false,
          proof,
          wallet: proof.wallet,
          amount: proof.amount,
          currency: proof.currency,
          endpoint,
          verifiedAt: new Date(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          error: 'Invalid or expired nonce',
        };
      }
    }

    // Check if payment has already been used (from database)
    const existingPayment = await this.getPaymentByNonce(proof.nonce);
    if (existingPayment) {
      logger.warn({ nonce: proof.nonce }, 'Attempted replay attack - nonce already used');
      return {
        valid: false,
        proof,
        wallet: proof.wallet,
        amount: proof.amount,
        currency: proof.currency,
        endpoint,
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        error: 'Payment proof already used (replay attack prevented)',
      };
    }

    // Route to appropriate validator based on payment mode
    let validation: ValidatedPayment;

    switch (config.payment.mode) {
      case 'mock':
        validation = await mockPaymentValidator.validatePayment(proof, expectedAmount, endpoint);
        break;

      case 'test':
        // Test mode uses PayAI facilitator on devnet
        validation = await payAIPaymentValidator.validatePayment(proof, expectedAmount, endpoint);
        break;

      case 'payai':
        // Production mode uses PayAI facilitator on mainnet
        validation = await payAIPaymentValidator.validatePayment(proof, expectedAmount, endpoint);
        break;

      default:
        throw new Error(`Unknown payment mode: ${config.payment.mode}`);
    }

    // If payment is valid, store it in database
    if (validation.valid) {
      await this.storePayment(validation);
      // Delete nonce from cache so it can't be reused
      await cacheService.delete(nonceKey);
    }

    return validation;
  }

  /** Store validated payment in database */
  private async storePayment(payment: ValidatedPayment): Promise<void> {
    try {
      await databaseService.query(
        `INSERT INTO payment_proofs
         (nonce, wallet_address, amount_usdc, endpoint, proof_data, verified_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          payment.proof.nonce,
          payment.wallet,
          payment.amount,
          payment.endpoint,
          JSON.stringify(payment.proof),
          payment.verifiedAt,
          payment.expiresAt,
        ]
      );

      logger.info({
        nonce: payment.proof.nonce,
        wallet: payment.wallet,
      }, 'Payment stored in database');
    } catch (error) {
      logger.error({ error }, 'Failed to store payment in database');
      // Don't fail the request if database storage fails
      // Payment was already validated
    }
  }

  /** Get payment by nonce from database */
  private async getPaymentByNonce(nonce: string): Promise<boolean> {
    try {
      const result = await databaseService.query(
        'SELECT id FROM payment_proofs WHERE nonce = $1 LIMIT 1',
        [nonce]
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error({ error }, 'Error checking payment nonce');
      return false;
    }
  }

  /** Check if payment proof is cached (for retries within TTL) */
  async getCachedPayment(nonce: string, endpoint: string): Promise<ValidatedPayment | null> {
    // Cache key includes endpoint to prevent cross-endpoint reuse
    const cacheKey = `payment:validated:${nonce}:${endpoint}`;
    const cached = await cacheService.get<ValidatedPayment>(cacheKey);
    if (cached) {
      logger.debug({ nonce, endpoint }, 'Using cached payment validation');
    }
    return cached;
  }

  /** Cache validated payment for retries */
  async cachePayment(payment: ValidatedPayment, endpoint: string): Promise<void> {
    // Cache key includes endpoint to prevent cross-endpoint reuse
    const cacheKey = `payment:validated:${payment.proof.nonce}:${endpoint}`;
    await cacheService.set(
      cacheKey,
      payment,
      300 // 5 minutes
    );
  }
}

/** Singleton instance */
export const paymentValidator = new PaymentValidator();
