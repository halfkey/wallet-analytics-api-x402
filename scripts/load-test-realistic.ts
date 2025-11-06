/**
 * Realistic Load Testing Script
 *
 * This script performs load testing with mock payment validation.
 * In mock mode, nonces are generated dynamically without requiring Redis.
 * This tests the full end-to-end performance including payment validation
 * and actual endpoint logic.
 */

import { performance } from 'perf_hooks';
import { writeFileSync } from 'fs';

/** Generate a fresh mock payment proof */
function generateMockPaymentProof(amount: number, wallet: string) {
  const nonce = `test-nonce-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const signature = `mock-signature-${Math.random().toString(36).substring(2, 20)}`;

  return {
    protocol: 'x402',
    nonce,
    signature,
    wallet,
    amount,
    currency: 'USDC',
    network: 'solana',
    timestamp: new Date().toISOString(),
  };
}

/** Encode payment proof for header */
function encodePaymentProof(proof: any): string {
  return Buffer.from(JSON.stringify(proof)).toString('base64');
}

/** Get endpoint price */
function getEndpointPrice(endpoint: string): number {
  const prices: Record<string, number> = {
    overview: 0.01,
    portfolio: 0.05,
    activity: 0.10,
    risk: 0.10, // Fixed: was 0.03, should be 0.10
  };
  return prices[endpoint] || 0.01;
}

const TEST_WALLET = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

const PERFORMANCE_TARGETS = {
  overview: 200,
  portfolio: 800,
  activity: 1500,
  risk: 1000,
};

interface RequestResult {
  latency: number;
  status: number;
  success: boolean;
}

interface EndpointResults {
  endpoint: string;
  target: number;
  requests: number;
  successful: number;
  failed: number;
  latencies: number[];
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  p50: number;
  p95: number;
  p99: number;
  passed: boolean;
}

/**
 * Test a single endpoint with realistic payment flow
 */
async function testEndpoint(
  endpoint: 'overview' | 'portfolio' | 'activity' | 'risk',
  path: string,
  requestCount: number
): Promise<EndpointResults> {
  console.log(`\nTesting ${endpoint}...`);
  console.log(`  URL: ${BASE_URL}${path}`);
  console.log(`  Requests: ${requestCount}`);
  console.log(`  Target p95: ${PERFORMANCE_TARGETS[endpoint]}ms`);

  const price = getEndpointPrice(endpoint);
  const results: RequestResult[] = [];

  for (let i = 0; i < requestCount; i++) {
    try {
      // Generate fresh payment proof for mock mode
      const proof = generateMockPaymentProof(price, TEST_WALLET);
      const encodedProof = encodePaymentProof(proof);

      // Make request
      const start = performance.now();
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: {
          'X-Payment-Proof': encodedProof,
        },
      });
      const end = performance.now();

      const latency = end - start;
      results.push({
        latency,
        status: response.status,
        success: response.ok,
      });

      if ((i + 1) % 5 === 0) {
        console.log(`  Progress: ${i + 1}/${requestCount} (${((i + 1) / requestCount * 100).toFixed(0)}%)`);
      }
    } catch (error) {
      console.error(`  Request ${i + 1} failed:`, error);
      results.push({
        latency: 0,
        status: 0,
        success: false,
      });
    }
  }

  // Calculate statistics
  const latencies = results.map((r) => r.latency).sort((a, b) => a - b);
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
  const minLatency = latencies[0];
  const maxLatency = latencies[latencies.length - 1];

  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  const passed = p95 <= PERFORMANCE_TARGETS[endpoint];

  console.log(`\n  Results:`);
  console.log(`    Successful: ${successful}/${requestCount}`);
  console.log(`    Failed: ${failed}`);
  console.log(`    Average: ${avgLatency.toFixed(2)}ms`);
  console.log(`    p50: ${p50.toFixed(2)}ms`);
  console.log(`    p95: ${p95.toFixed(2)}ms ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`    p99: ${p99.toFixed(2)}ms`);

  return {
    endpoint,
    target: PERFORMANCE_TARGETS[endpoint],
    requests: requestCount,
    successful,
    failed,
    latencies,
    avgLatency,
    minLatency,
    maxLatency,
    p50,
    p95,
    p99,
    passed,
  };
}

async function main() {
  console.log('=== Realistic Load Testing (Mock Mode) ===\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Wallet: ${TEST_WALLET}`);
  console.log(`Payment Mode: Mock (no nonce pool required)\n`);

  const requestsPerEndpoint = 20;
  const results: EndpointResults[] = [];

  // Test each endpoint
  results.push(
    await testEndpoint(
      'overview',
      `/api/v1/wallet/${TEST_WALLET}/overview`,
      requestsPerEndpoint
    )
  );

  results.push(
    await testEndpoint(
      'portfolio',
      `/api/v1/wallet/${TEST_WALLET}/portfolio`,
      requestsPerEndpoint
    )
  );

  results.push(
    await testEndpoint(
      'activity',
      `/api/v1/wallet/${TEST_WALLET}/activity`,
      requestsPerEndpoint
    )
  );

  results.push(
    await testEndpoint(
      'risk',
      `/api/v1/wallet/${TEST_WALLET}/risk`,
      requestsPerEndpoint
    )
  );

  // Summary
  console.log('\n\n=== SUMMARY ===\n');

  const summary = results.map((r) => ({
    Endpoint: r.endpoint,
    'Target p95': `${r.target}ms`,
    'Actual p95': `${r.p95.toFixed(2)}ms`,
    Status: r.passed ? '✅ PASS' : '❌ FAIL',
    'Success Rate': `${((r.successful / r.requests) * 100).toFixed(1)}%`,
  }));

  console.table(summary);

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\nOverall: ${passedCount}/${results.length} tests passed`);

  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `load-test-realistic-${timestamp}.json`;

  writeFileSync(
    filename,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        testWallet: TEST_WALLET,
        baseUrl: BASE_URL,
        requestsPerEndpoint,
        summary: {
          total: results.length,
          passed: passedCount,
          failed: results.length - passedCount,
        },
        results,
      },
      null,
      2
    )
  );

  console.log(`\nDetailed results saved to: ${filename}`);

  // Exit with error if any tests failed
  if (passedCount < results.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
