import type { PaymentProof } from '../../schemas/payment.js';
import type { ValidatedPayment } from '../../types/payment.js';
import { logger } from '../../utils/logger.js';

/** Mock payment validator for development and testing */
export class MockPaymentValidator {
  /**
   * Validate a payment proof in mock mode
   * In mock mode, we accept any properly formatted proof without blockchain verification
   */
  async validatePayment(
    proof: PaymentProof,
    expectedAmount: number,
    endpoint: string
  ): Promise<ValidatedPayment> {
    logger.info({
      nonce: proof.nonce,
      wallet: proof.wallet,
      amount: proof.amount,
      expectedAmount,
      endpoint,
    }, '🧪 Mock payment validation');

    // Validate proof structure (already done by Zod schema)
    // In mock mode, we just check basic requirements

    // Check amount matches (allow small variance for fees)
    const amountDifference = Math.abs(proof.amount - expectedAmount);
    if (amountDifference > 0.001) {
      return {
        valid: false,
        proof,
        wallet: proof.wallet,
        amount: proof.amount,
        currency: proof.currency,
        endpoint,
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        error: `Amount mismatch: expected ${expectedAmount}, got ${proof.amount}`,
      };
    }

    // Check timestamp is recent (within 5 minutes)
    const proofTimestamp = new Date(proof.timestamp);
    const now = new Date();
    const ageMinutes = (now.getTime() - proofTimestamp.getTime()) / 1000 / 60;

    if (ageMinutes > 5) {
      return {
        valid: false,
        proof,
        wallet: proof.wallet,
        amount: proof.amount,
        currency: proof.currency,
        endpoint,
        verifiedAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        error: `Payment proof expired (${ageMinutes.toFixed(1)} minutes old)`,
      };
    }

    // In mock mode, accept any signature that's not empty
    if (!proof.signature || proof.signature.length < 10) {
      return {
        valid: false,
        proof,
        wallet: proof.wallet,
        amount: proof.amount,
        currency: proof.currency,
        endpoint,
        verifiedAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        error: 'Invalid signature format',
      };
    }

    // Mock validation passed
    logger.info({
      nonce: proof.nonce,
      wallet: proof.wallet,
    }, '✅ Mock payment validated successfully');

    return {
      valid: true,
      proof,
      wallet: proof.wallet,
      amount: proof.amount,
      currency: proof.currency,
      endpoint,
      verifiedAt: now,
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
    };
  }

  /**
   * Generate a mock payment proof for testing
   */
  static generateMockProof(amount: number, wallet: string = 'MockWallet123'): PaymentProof {
    return {
      protocol: 'x402',
      nonce: `mock-nonce-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      signature: `mock-signature-${Math.random().toString(36).substring(2)}`,
      wallet,
      amount,
      currency: 'USDC',
      network: 'solana',
      timestamp: new Date().toISOString(),
    };
  }
}

/** Singleton instance */
export const mockPaymentValidator = new MockPaymentValidator();
