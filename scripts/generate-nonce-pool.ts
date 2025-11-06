/**
 * Nonce Pool Generator
 *
 * This script generates a pool of valid nonces by making 402 requests
 * to the API and extracting nonces from the payment challenges.
 *
 * Nonces are valid for 5 minutes, so the pool should be used quickly
 * after generation.
 */

import { writeFileSync } from 'fs';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TEST_WALLET = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';

interface NonceEntry {
  nonce: string;
  endpoint: string;
  amount: number;
  expiresAt: string;
  createdAt: string;
}

interface NoncePool {
  createdAt: string;
  expiresAt: string;
  baseUrl: string;
  testWallet: string;
  nonces: {
    overview: NonceEntry[];
    portfolio: NonceEntry[];
    activity: NonceEntry[];
    risk: NonceEntry[];
  };
  stats: {
    total: number;
    perEndpoint: number;
  };
}

/**
 * Get a payment challenge from an endpoint
 */
async function getChallenge(endpoint: string, path: string): Promise<NonceEntry | null> {
  try {
    const response = await fetch(`${BASE_URL}${path}`);

    if (response.status !== 402) {
      console.error(`  ❌ Expected 402, got ${response.status} for ${endpoint}`);
      return null;
    }

    const data = await response.json();

    if (!data.payment || !data.payment.challenge) {
      console.error(`  ❌ No challenge in response for ${endpoint}`);
      return null;
    }

    // Decode the challenge
    const challengeB64 = data.payment.challenge;
    const challengeJson = Buffer.from(challengeB64, 'base64').toString('utf-8');
    const challenge = JSON.parse(challengeJson);

    return {
      nonce: challenge.nonce,
      endpoint,
      amount: challenge.amount,
      expiresAt: challenge.expiresAt,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`  ❌ Error getting challenge for ${endpoint}:`, error);
    return null;
  }
}

/**
 * Generate nonce pool for all endpoints
 */
async function generateNoncePool(noncesPerEndpoint: number = 100): Promise<NoncePool> {
  console.log('=== Nonce Pool Generator ===\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Wallet: ${TEST_WALLET}`);
  console.log(`Nonces per endpoint: ${noncesPerEndpoint}`);
  console.log(`Total nonces to generate: ${noncesPerEndpoint * 4}\n`);

  const endpoints = [
    { name: 'overview', path: `/api/v1/wallet/${TEST_WALLET}/overview` },
    { name: 'portfolio', path: `/api/v1/wallet/${TEST_WALLET}/portfolio` },
    { name: 'activity', path: `/api/v1/wallet/${TEST_WALLET}/activity` },
    { name: 'risk', path: `/api/v1/wallet/${TEST_WALLET}/risk` },
  ];

  const pool: NoncePool = {
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
    baseUrl: BASE_URL,
    testWallet: TEST_WALLET,
    nonces: {
      overview: [],
      portfolio: [],
      activity: [],
      risk: [],
    },
    stats: {
      total: 0,
      perEndpoint: noncesPerEndpoint,
    },
  };

  // Generate nonces for each endpoint
  for (const endpoint of endpoints) {
    console.log(`\nGenerating nonces for ${endpoint.name}...`);
    const nonces: NonceEntry[] = [];

    for (let i = 0; i < noncesPerEndpoint; i++) {
      const challenge = await getChallenge(endpoint.name, endpoint.path);

      if (challenge) {
        nonces.push(challenge);
        if ((i + 1) % 10 === 0) {
          console.log(`  ✓ Generated ${i + 1}/${noncesPerEndpoint} nonces`);
        }
      } else {
        console.log(`  ⚠ Failed to get nonce ${i + 1}/${noncesPerEndpoint}`);
      }

      // Small delay to avoid overwhelming the server
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    pool.nonces[endpoint.name as keyof typeof pool.nonces] = nonces;
    console.log(`  ✅ ${endpoint.name}: ${nonces.length} nonces generated`);
  }

  pool.stats.total =
    pool.nonces.overview.length +
    pool.nonces.portfolio.length +
    pool.nonces.activity.length +
    pool.nonces.risk.length;

  return pool;
}

/**
 * Main execution
 */
async function main() {
  const noncesPerEndpoint = parseInt(process.env.NONCES_PER_ENDPOINT || '100', 10);

  console.log('Starting nonce pool generation...\n');

  const pool = await generateNoncePool(noncesPerEndpoint);

  // Save to file
  const filename = 'nonce-pool.json';
  writeFileSync(filename, JSON.stringify(pool, null, 2));

  console.log('\n=== Summary ===');
  console.log(`Total nonces generated: ${pool.stats.total}`);
  console.log(`  Overview: ${pool.nonces.overview.length}`);
  console.log(`  Portfolio: ${pool.nonces.portfolio.length}`);
  console.log(`  Activity: ${pool.nonces.activity.length}`);
  console.log(`  Risk: ${pool.nonces.risk.length}`);
  console.log(`\nNonce pool saved to: ${filename}`);
  console.log(`Pool expires at: ${pool.expiresAt}`);

  // Calculate time until expiry
  const expiresIn = new Date(pool.expiresAt).getTime() - Date.now();
  const minutesUntilExpiry = Math.floor(expiresIn / 1000 / 60);
  const secondsUntilExpiry = Math.floor((expiresIn / 1000) % 60);

  console.log(`\n⏰ Use within: ${minutesUntilExpiry}m ${secondsUntilExpiry}s`);
  console.log('\nRun load tests now:');
  console.log('  pnpm run load-test');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
