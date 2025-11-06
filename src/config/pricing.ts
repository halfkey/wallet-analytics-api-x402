import type { EndpointPricing } from '../schemas/payment.js';

/** Endpoint pricing configuration */
export const endpointPricing: Record<string, EndpointPricing> = {
  '/api/v1/wallet/:address/overview': {
    path: '/api/v1/wallet/:address/overview',
    priceUSDC: 0.01,
    description: 'Basic wallet overview (SOL balance, token count, total value)',
  },
  '/api/v1/wallet/:address/portfolio': {
    path: '/api/v1/wallet/:address/portfolio',
    priceUSDC: 0.05,
    description: 'Detailed portfolio analysis (tokens, NFTs, DeFi positions)',
  },
  '/api/v1/wallet/:address/activity': {
    path: '/api/v1/wallet/:address/activity',
    priceUSDC: 0.10,
    description: 'Transaction history and activity metrics',
  },
  '/api/v1/wallet/:address/risk': {
    path: '/api/v1/wallet/:address/risk',
    priceUSDC: 0.10,
    description: 'Risk assessment and security analysis',
  },
};

/** Get pricing for an endpoint */
export function getEndpointPrice(path: string): number {
  // Try direct match first
  let pricing = endpointPricing[path];

  // If no direct match, try to normalize path (replace address-like params with :address)
  if (!pricing) {
    // Match any segment between slashes that looks like it could be an address param
    // This handles both real Solana addresses (32-44 chars) and test addresses
    const normalizedPath = path.replace(/\/[A-Za-z0-9_-]+\/(overview|portfolio|activity|risk)/, '/:address/$1');
    pricing = endpointPricing[normalizedPath];
  }

  if (!pricing) {
    throw new Error(`No pricing configured for endpoint: ${path}`);
  }

  return pricing.priceUSDC;
}

/** Check if endpoint requires payment */
export function requiresPayment(path: string): boolean {
  // Health and root endpoints are free
  if (path === '/' || path === '/health') {
    return false;
  }

  // All /api/* endpoints require payment
  return path.startsWith('/api/');
}
