import type { FastifyRequest, FastifyReply } from 'fastify';
import { getEndpointPrice, requiresPayment } from '../config/pricing.js';
import { logger } from '../utils/logger.js';
import {
  createPaymentRequiredResponse,
  parsePaymentHeader,
  verifyPayment,
  settlePayment,
  createPaymentRequirement,
  type X402Payment,
} from '../services/x402.js';
import { verifyOnChainPayment } from '../services/onChainVerification.js';
import { config } from '../config/index.js';

/**
 * x402 Payment middleware
 * Handles HTTP 402 Payment Required flow according to x402 protocol
 */
export async function x402PaymentMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { url } = request;

  // Skip payment for free endpoints
  if (!requiresPayment(url)) {
    return; // Continue to handler
  }

  logger.debug({ url }, 'Checking payment for protected endpoint');

  // Get pricing for this endpoint
  let price: number;
  try {
    price = getEndpointPrice(url);
  } catch (error) {
    logger.warn({ url }, 'Endpoint has no pricing configured');
    return reply.code(404).send({
      error: 'Not Found',
      message: 'This endpoint does not exist or is not yet implemented',
    });
  }

  // Check for X-PAYMENT header (proper x402 format)
  const paymentHeader = request.headers['x-payment'] as string | undefined;

  // If no payment, return 402 with proper x402 payment requirements
  if (!paymentHeader) {
    logger.info({ url, price }, 'No payment provided, returning x402 payment requirements');

    const paymentRequired = createPaymentRequiredResponse(url, price);

    return reply.code(402).send(paymentRequired);
  }

  // Parse payment header
  let payment: X402Payment | null;
  try {
    payment = parsePaymentHeader(paymentHeader);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn({ error: errorMessage }, 'Invalid X-PAYMENT header format');
    return reply.code(400).send({
      x402Version: 1,
      error: `Invalid payment header format: ${errorMessage}`,
    });
  }

  if (!payment) {
    logger.warn('Failed to parse X-PAYMENT header');
    return reply.code(400).send({
      x402Version: 1,
      error: 'Invalid payment header',
    });
  }

  // Validate payment version
  if (payment.x402Version !== 1) {
    logger.warn({ version: payment.x402Version }, 'Unsupported x402 version');
    return reply.code(400).send({
      x402Version: 1,
      error: `Unsupported x402 version: ${payment.x402Version}`,
    });
  }

  // Create payment requirement for verification
  const requirement = createPaymentRequirement(url, price);

  // In mock mode, skip facilitator and validate locally
  if (config.payment.mode === 'mock') {
    logger.info({ mode: 'mock' }, 'Mock mode: Skipping payment verification');

    // Add mock payment info to request
    (request as any).payment = {
      wallet: payment.payload.fromAddress || 'mock-wallet',
      amount: price,
      currency: 'USDC',
      verifiedAt: new Date().toISOString(),
      mode: 'mock',
    };

    return; // Continue to handler
  }

  // On-chain verification mode (verify directly on Solana blockchain)
  if (config.payment.mode === 'onchain') {
    logger.info({ url, price }, 'Verifying payment on-chain (Solana blockchain)');

    const verificationResult = await verifyOnChainPayment(payment, requirement);

    if (!verificationResult.isValid) {
      logger.warn({
        payment,
        reason: verificationResult.reason,
      }, 'On-chain payment verification failed');

      return reply.code(402).send({
        ...createPaymentRequiredResponse(url, price),
        error: `Payment verification failed: ${verificationResult.reason}`,
      });
    }

    // Payment is valid!
    logger.info({
      txHash: verificationResult.txHash,
      amount: verificationResult.amount,
      sender: verificationResult.sender,
      endpoint: url,
    }, '✅ On-chain payment verified, access granted');

    // Add payment info to request for analytics
    (request as any).payment = {
      wallet: payment.payload.fromAddress,
      amount: price,
      currency: 'USDC',
      verifiedAt: new Date().toISOString(),
      txHash: verificationResult.txHash,
      network: 'solana-mainnet',
      mode: 'onchain',
    };

    // Add X-PAYMENT-RESPONSE header to response
    const paymentResponse = Buffer.from(
      JSON.stringify({
        success: true,
        txHash: verificationResult.txHash,
        networkId: 'solana-mainnet',
      })
    ).toString('base64');

    reply.header('X-PAYMENT-RESPONSE', paymentResponse);

    return; // Continue to handler
  }

  // PayAI facilitator mode
  logger.info({ url, price }, 'Verifying payment via PayAI facilitator');

  const isValid = await verifyPayment(payment, requirement);

  if (!isValid) {
    logger.warn({ payment }, 'Payment verification failed');
    return reply.code(402).send(createPaymentRequiredResponse(url, price));
  }

  // Settle payment via PayAI facilitator
  logger.info({ url, price }, 'Settling payment via PayAI facilitator');

  const settlementResponse = await settlePayment(payment);

  if (!settlementResponse || !settlementResponse.success) {
    logger.error({ settlementResponse }, 'Payment settlement failed');
    return reply.code(500).send({
      x402Version: 1,
      error: 'Payment settlement failed',
    });
  }

  // Payment is valid and settled!
  logger.info({
    txHash: settlementResponse.txHash,
    network: settlementResponse.networkId,
    endpoint: url,
    amount: price,
  }, '✅ Payment verified and settled, access granted');

  // Add payment info to request for analytics
  (request as any).payment = {
    wallet: payment.payload.fromAddress,
    amount: price,
    currency: 'USDC',
    verifiedAt: new Date().toISOString(),
    txHash: settlementResponse.txHash,
    network: settlementResponse.networkId,
  };

  // Add X-PAYMENT-RESPONSE header to response
  const paymentResponse = Buffer.from(
    JSON.stringify({
      success: true,
      txHash: settlementResponse.txHash,
      networkId: settlementResponse.networkId,
    })
  ).toString('base64');

  reply.header('X-PAYMENT-RESPONSE', paymentResponse);

  // Continue to route handler
}
