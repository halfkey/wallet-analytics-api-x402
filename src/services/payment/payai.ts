import { config } from '../../config/index.js';
import type { PaymentProof } from '../../schemas/payment.js';
import type { ValidatedPayment } from '../../types/payment.js';
import { logger } from '../../utils/logger.js';

/** PayAI facilitator API response schemas */
interface VerifyResponse {
  isValid: boolean;
  invalidReason: string | null;
}

interface SettleResponse {
  success: boolean;
  error: string | null;
  txHash: string | null;
  networkId: string | null;
}

/** PayAI payment requirements for x402 protocol */
interface PaymentRequirements {
  scheme: 'solana-transfer' | 'evm-transfer';
  network: string;
  maxAmountRequired: string; // Amount in atomic units (lamports for Solana, wei for EVM)
  asset: string; // Token mint address (Solana) or contract address (EVM)
  payTo: string; // Recipient wallet address
  extra?: Record<string, unknown>;
}

/** PayAI payment validator for production/test modes */
export class PayAIPaymentValidator {
  private readonly facilitatorUrl: string;
  private readonly x402Version = 1;

  constructor(facilitatorUrl?: string) {
    this.facilitatorUrl = facilitatorUrl || config.payment.facilitatorUrl || 'https://facilitator.payai.network';
  }

  /**
   * Validate a payment proof using PayAI facilitator
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
      facilitator: this.facilitatorUrl,
    }, '🌐 Validating payment with PayAI facilitator');

    try {
      // Convert payment proof to x402 payment header format
      const paymentHeader = this.encodePaymentHeader(proof);

      // Create payment requirements
      const paymentRequirements = this.createPaymentRequirements(
        proof,
        expectedAmount
      );

      // Call PayAI /verify endpoint
      const verifyResponse = await this.callVerifyEndpoint(
        paymentHeader,
        paymentRequirements
      );

      if (!verifyResponse.isValid) {
        logger.warn({
          nonce: proof.nonce,
          reason: verifyResponse.invalidReason,
        }, 'Payment verification failed');

        return {
          valid: false,
          proof,
          wallet: proof.wallet,
          amount: proof.amount,
          currency: proof.currency,
          endpoint,
          verifiedAt: new Date(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          error: verifyResponse.invalidReason || 'Payment verification failed',
        };
      }

      // Payment is valid, now settle it on-chain
      const settleResponse = await this.callSettleEndpoint(
        paymentHeader,
        paymentRequirements
      );

      if (!settleResponse.success) {
        logger.error({
          nonce: proof.nonce,
          error: settleResponse.error,
        }, 'Payment settlement failed');

        return {
          valid: false,
          proof,
          wallet: proof.wallet,
          amount: proof.amount,
          currency: proof.currency,
          endpoint,
          verifiedAt: new Date(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          error: settleResponse.error || 'Payment settlement failed',
        };
      }

      // Payment validated and settled successfully
      logger.info({
        nonce: proof.nonce,
        wallet: proof.wallet,
        txHash: settleResponse.txHash,
        networkId: settleResponse.networkId,
      }, '✅ Payment validated and settled on-chain');

      return {
        valid: true,
        proof,
        wallet: proof.wallet,
        amount: proof.amount,
        currency: proof.currency,
        endpoint,
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        transactionHash: settleResponse.txHash || undefined,
        networkId: settleResponse.networkId || undefined,
      };
    } catch (error) {
      logger.error({
        error,
        nonce: proof.nonce,
      }, 'PayAI facilitator error');

      return {
        valid: false,
        proof,
        wallet: proof.wallet,
        amount: proof.amount,
        currency: proof.currency,
        endpoint,
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        error: `Facilitator error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Encode payment proof as base64 payment header
   */
  private encodePaymentHeader(proof: PaymentProof): string {
    const headerData = {
      protocol: proof.protocol,
      nonce: proof.nonce,
      signature: proof.signature,
      wallet: proof.wallet,
      amount: proof.amount,
      currency: proof.currency,
      network: proof.network,
      timestamp: proof.timestamp,
      facilitatorSignature: proof.facilitatorSignature,
      metadata: proof.metadata,
    };

    return Buffer.from(JSON.stringify(headerData)).toString('base64');
  }

  /**
   * Create payment requirements for facilitator
   */
  private createPaymentRequirements(
    proof: PaymentProof,
    expectedAmount: number
  ): PaymentRequirements {
    // Convert USDC amount to atomic units (6 decimals for USDC)
    const atomicAmount = Math.floor(expectedAmount * 1_000_000).toString();

    if (proof.network === 'solana') {
      return {
        scheme: 'solana-transfer',
        network: config.payment.mode === 'test' ? 'solana-devnet' : 'solana-mainnet',
        maxAmountRequired: atomicAmount,
        asset: this.getSolanaUSDCMint(),
        payTo: config.payment.recipientAddress || proof.wallet,
        extra: {
          tokenProgram: 'Token2022', // or 'TokenProgram' for SPL
        },
      };
    }

    // EVM networks (Base, Polygon, etc.)
    return {
      scheme: 'evm-transfer',
      network: proof.network,
      maxAmountRequired: atomicAmount,
      asset: this.getEVMUSDCContract(proof.network),
      payTo: config.payment.recipientAddress || proof.wallet,
    };
  }

  /**
   * Get Solana USDC mint address based on network
   */
  private getSolanaUSDCMint(): string {
    // Devnet USDC mint
    if (config.payment.mode === 'test') {
      return '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // USDC devnet
    }

    // Mainnet USDC mint (Circle's official USDC)
    return 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  }

  /**
   * Get EVM USDC contract address based on network
   */
  private getEVMUSDCContract(network: string): string {
    const contracts: Record<string, string> = {
      base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base mainnet USDC
      'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
      polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Polygon mainnet USDC
      'polygon-amoy': '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', // Polygon Amoy testnet
      ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum mainnet USDC
    };

    return contracts[network] || contracts['base'] || ''; // Default to Base
  }

  /**
   * Call PayAI facilitator /verify endpoint
   */
  private async callVerifyEndpoint(
    paymentHeader: string,
    paymentRequirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    const response = await fetch(`${this.facilitatorUrl}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        x402Version: this.x402Version,
        paymentHeader,
        paymentRequirements,
      }),
    });

    if (!response.ok) {
      throw new Error(`Facilitator /verify returned ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as VerifyResponse;
  }

  /**
   * Call PayAI facilitator /settle endpoint
   */
  private async callSettleEndpoint(
    paymentHeader: string,
    paymentRequirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const response = await fetch(`${this.facilitatorUrl}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        x402Version: this.x402Version,
        paymentHeader,
        paymentRequirements,
      }),
    });

    if (!response.ok) {
      throw new Error(`Facilitator /settle returned ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as SettleResponse;
  }
}

/** Singleton instance */
export const payAIPaymentValidator = new PayAIPaymentValidator();
