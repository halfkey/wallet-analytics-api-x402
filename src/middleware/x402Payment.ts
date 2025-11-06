import type { FastifyRequest, FastifyReply } from 'fastify';
import { parsePaymentProofHeader, encodePaymentChallenge } from '../schemas/payment.js';
import { paymentValidator } from '../services/payment/validator.js';
import { getEndpointPrice, requiresPayment } from '../config/pricing.js';
import { logger } from '../utils/logger.js';

/**
 * x402 Payment middleware
 * Handles HTTP 402 Payment Required flow
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

  // Check for payment proof in header
  const paymentProofHeader = request.headers['x-payment-proof'] as string | undefined;

  // If no payment proof, return 402 with challenge
  if (!paymentProofHeader) {
    logger.info({ url, price }, 'No payment proof provided, returning 402 challenge');

    const challenge = await paymentValidator.createChallenge(url, price);
    const encodedChallenge = encodePaymentChallenge(challenge);

    return reply.code(402).headers({
      'X-Payment-Required': 'x402',
      'X-Payment-Amount': price.toString(),
      'X-Payment-Currency': 'USDC',
      'X-Payment-Network': 'solana',
      'X-Payment-Challenge': encodedChallenge,
    }).send({
      error: 'Payment Required',
      message: `This endpoint requires payment of ${price} USDC`,
      payment: {
        protocol: 'x402',
        amount: price,
        currency: 'USDC',
        network: 'solana',
        challenge: encodedChallenge,
      },
      statusCode: 402,
    });
  }

  // Parse and validate payment proof
  let paymentProof;
  try {
    paymentProof = parsePaymentProofHeader(paymentProofHeader);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn({ error: errorMessage }, 'Invalid payment proof format');
    return reply.code(400).send({
      error: 'Bad Request',
      message: `Invalid payment proof format: ${errorMessage}`,
      statusCode: 400,
    });
  }

  // Check if we have a cached validation for this nonce+endpoint (allow retries)
  // IMPORTANT: Cache key includes endpoint to prevent cross-endpoint reuse
  let validation = await paymentValidator.getCachedPayment(paymentProof.nonce, url);

  // If not cached, validate the payment
  if (!validation) {
    validation = await paymentValidator.validatePayment(paymentProof, price, url);

    // Cache the validation result (with endpoint-specific key)
    if (validation.valid) {
      await paymentValidator.cachePayment(validation, url);
    }
  }

  // If payment is invalid, return error
  if (!validation.valid) {
    logger.warn({
      nonce: paymentProof.nonce,
      error: validation.error,
    }, 'Payment validation failed');

    return reply.code(403).send({
      error: 'Payment Invalid',
      message: validation.error || 'Payment proof validation failed',
      statusCode: 403,
    });
  }

  // Payment is valid! Add payment info to request for analytics
  (request as any).payment = {
    wallet: validation.wallet,
    amount: validation.amount,
    currency: validation.currency,
    verifiedAt: validation.verifiedAt,
  };

  logger.info({
    wallet: validation.wallet,
    endpoint: url,
    amount: validation.amount,
  }, '✅ Payment validated, access granted');

  // Continue to route handler
}
