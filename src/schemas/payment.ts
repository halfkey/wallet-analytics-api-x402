import { z } from 'zod';

/** Payment network schema */
export const paymentNetworkSchema = z.enum(['solana', 'ethereum', 'base', 'polygon']);

/** Payment currency schema */
export const paymentCurrencySchema = z.enum(['USDC', 'USDT', 'SOL']);

/** Payment proof schema */
export const paymentProofSchema = z.object({
  protocol: z.literal('x402'),
  nonce: z.string().min(16).max(128),
  signature: z.string().min(1).max(256),
  wallet: z.string().min(32).max(64), // Solana addresses are 32-44 chars
  amount: z.number().positive().max(1000), // Max 1000 USDC per request
  currency: paymentCurrencySchema,
  network: paymentNetworkSchema,
  timestamp: z.string().datetime(),
  facilitatorSignature: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** Payment challenge schema */
export const paymentChallengeSchema = z.object({
  protocol: z.literal('x402'),
  amount: z.number().positive().max(1000),
  currency: paymentCurrencySchema,
  network: paymentNetworkSchema,
  address: z.string().min(1).max(128), // Payment destination address or identifier
  nonce: z.string().min(16).max(128),
  facilitatorUrl: z.string().url().optional(),
  timestamp: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

/** Endpoint pricing schema */
export const endpointPricingSchema = z.object({
  path: z.string(),
  priceUSDC: z.number().positive(),
  currency: paymentCurrencySchema.optional(),
  description: z.string(),
});

/** Helper to parse and validate payment proof from header */
export function parsePaymentProofHeader(header: string) {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    return paymentProofSchema.parse(parsed);
  } catch (error) {
    throw new Error(`Invalid payment proof: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/** Helper to encode payment challenge for header */
export function encodePaymentChallenge(challenge: z.infer<typeof paymentChallengeSchema>): string {
  const validated = paymentChallengeSchema.parse(challenge);
  const json = JSON.stringify(validated);
  return Buffer.from(json).toString('base64');
}

/** Type exports */
export type PaymentProof = z.infer<typeof paymentProofSchema>;
export type PaymentChallenge = z.infer<typeof paymentChallengeSchema>;
export type EndpointPricing = z.infer<typeof endpointPricingSchema>;
