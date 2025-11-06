import type { FastifyRequest, FastifyReply } from 'fastify';
import { PublicKey } from '@solana/web3.js';

/**
 * Validate Solana wallet address format
 */
export function validateSolanaAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  // Check length (Solana addresses are 32-44 characters)
  if (address.length < 32 || address.length > 44) {
    return false;
  }

  // Check if valid base58 characters
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (!base58Regex.test(address)) {
    return false;
  }

  // Try to create a PublicKey to validate
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Middleware to validate wallet address parameter
 */
export async function validateWalletAddress(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { address } = request.params as { address?: string };

  if (!address) {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Wallet address is required',
      statusCode: 400,
    });
  }

  if (!validateSolanaAddress(address)) {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Invalid Solana wallet address format',
      statusCode: 400,
      details: 'Address must be a valid base58-encoded Solana public key',
    });
  }
}

/**
 * Sanitize input to prevent XSS and injection attacks
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove any HTML tags
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

/**
 * Validate query parameters
 */
export function validateQueryParams(
  request: FastifyRequest,
  reply: FastifyReply,
  allowedParams: string[]
): boolean {
  const queryParams = Object.keys(request.query as object);

  for (const param of queryParams) {
    if (!allowedParams.includes(param)) {
      reply.code(400).send({
        error: 'Bad Request',
        message: `Invalid query parameter: ${param}`,
        statusCode: 400,
        details: `Allowed parameters: ${allowedParams.join(', ')}`,
      });
      return false;
    }
  }

  return true;
}
