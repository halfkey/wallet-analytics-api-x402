/**
 * Load Testing Script
 *
 * This script performs load testing on all API endpoints to validate
 * performance targets specified in the implementation guide:
 * - Overview endpoint: < 200ms (p95)
 * - Portfolio endpoint: < 800ms (p95)
 * - Activity endpoint: < 1500ms (p95)
 * - Risk endpoint: < 1000ms (p95)
 */

import autocannon from 'autocannon';
import { writeFileSync } from 'fs';
import { generatePaymentHeader, getEndpointPrice } from './test-utils.js';

// Test wallet address (should be a real wallet with data for accurate testing)
const TEST_WALLET = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK'; // Example Solana wallet

// Performance targets (p95 in milliseconds)
const PERFORMANCE_TARGETS = {
  overview: 200,
  portfolio: 800,
  activity: 1500,
  risk: 1000,
};

interface TestResult {
  endpoint: string;
  url: string;
  duration: number;
  connections: number;
  pipelining: number;
  requests: {
    total: number;
    average: number;
    mean: number;
    stddev: number;
    min: number;
    max: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  latency: {
    average: number;
    mean: number;
    stddev: number;
    min: number;
    max: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  throughput: {
    average: number;
    mean: number;
    stddev: number;
    min: number;
    max: number;
  };
  errors: number;
  timeouts: number;
  non2xx: number;
  targetP95: number;
  actualP95: number;
  passed: boolean;
}

interface TestConfig {
  endpoint: string;
  path: string;
  target: number;
  price: number;
  duration?: number;
  connections?: number;
  pipelining?: number;
}

async function runLoadTest(config: TestConfig): Promise<TestResult> {
  const {
    endpoint,
    path,
    target,
    price,
    duration = 10, // 10 seconds default
    connections = 10, // 10 concurrent connections
    pipelining = 1,
  } = config;

  const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
  const url = `${baseUrl}${path}`;

  // Generate payment proof for this endpoint
  const paymentProof = generatePaymentHeader(price, TEST_WALLET);

  console.log(`\nTesting ${endpoint}...`);
  console.log(`  URL: ${url}`);
  console.log(`  Target p95: ${target}ms`);
  console.log(`  Duration: ${duration}s`);
  console.log(`  Connections: ${connections}`);
  console.log(`  Payment: ${price} USDC (mock mode)`);

  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url,
        connections,
        pipelining,
        duration,
        headers: {
          'Content-Type': 'application/json',
          'X-Payment-Proof': paymentProof,
        },
      },
      (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        const p95Latency = result.latency.p95;
        const passed = p95Latency <= target;

        const testResult: TestResult = {
          endpoint,
          url,
          duration,
          connections,
          pipelining,
          requests: {
            total: result.requests.total,
            average: result.requests.average,
            mean: result.requests.mean,
            stddev: result.requests.stddev,
            min: result.requests.min,
            max: result.requests.max,
            p50: result.requests.p50,
            p75: result.requests.p75,
            p90: result.requests.p90,
            p95: result.requests.p95,
            p99: result.requests.p99,
          },
          latency: {
            average: result.latency.average,
            mean: result.latency.mean,
            stddev: result.latency.stddev,
            min: result.latency.min,
            max: result.latency.max,
            p50: result.latency.p50,
            p75: result.latency.p75,
            p90: result.latency.p90,
            p95: result.latency.p95,
            p99: result.latency.p99,
          },
          throughput: {
            average: result.throughput.average,
            mean: result.throughput.mean,
            stddev: result.throughput.stddev,
            min: result.throughput.min,
            max: result.throughput.max,
          },
          errors: result.errors,
          timeouts: result.timeouts,
          non2xx: result.non2xx,
          targetP95: target,
          actualP95: p95Latency,
          passed,
        };

        console.log(`  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  Actual p95: ${p95Latency}ms`);
        console.log(`  Requests/sec: ${result.requests.average.toFixed(2)}`);
        console.log(`  Throughput: ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);

        resolve(testResult);
      }
    );

    autocannon.track(instance, { renderProgressBar: true });
  });
}

async function runAllTests(): Promise<void> {
  console.log('=== Wallet Analytics API Load Testing ===\n');
  console.log(`Test Wallet: ${TEST_WALLET}`);
  console.log(`Base URL: ${process.env.TEST_URL || 'http://localhost:3000'}`);

  const tests: TestConfig[] = [
    {
      endpoint: 'Overview',
      path: `/api/v1/wallet/${TEST_WALLET}/overview`,
      target: PERFORMANCE_TARGETS.overview,
      price: getEndpointPrice('overview'),
      duration: 10,
      connections: 10,
    },
    {
      endpoint: 'Portfolio',
      path: `/api/v1/wallet/${TEST_WALLET}/portfolio`,
      target: PERFORMANCE_TARGETS.portfolio,
      price: getEndpointPrice('portfolio'),
      duration: 10,
      connections: 10,
    },
    {
      endpoint: 'Activity',
      path: `/api/v1/wallet/${TEST_WALLET}/activity`,
      target: PERFORMANCE_TARGETS.activity,
      price: getEndpointPrice('activity'),
      duration: 10,
      connections: 10,
    },
    {
      endpoint: 'Risk',
      path: `/api/v1/wallet/${TEST_WALLET}/risk`,
      target: PERFORMANCE_TARGETS.risk,
      price: getEndpointPrice('risk'),
      duration: 10,
      connections: 10,
    },
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    try {
      const result = await runLoadTest(test);
      results.push(result);

      // Wait 2 seconds between tests to avoid overwhelming the service
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`\n❌ Error testing ${test.endpoint}:`, error);
    }
  }

  // Generate summary report
  console.log('\n\n=== LOAD TEST SUMMARY ===\n');

  const table = results.map((r) => ({
    Endpoint: r.endpoint,
    'Target p95': `${r.targetP95}ms`,
    'Actual p95': `${r.actualP95}ms`,
    Status: r.passed ? '✅ PASS' : '❌ FAIL',
    'Req/sec': r.requests.average.toFixed(2),
    Errors: r.errors,
    Timeouts: r.timeouts,
  }));

  console.table(table);

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  console.log(`\nOverall: ${passedCount}/${totalCount} tests passed`);

  // Save detailed results to JSON
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `load-test-results-${timestamp}.json`;

  writeFileSync(
    filename,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        testWallet: TEST_WALLET,
        baseUrl: process.env.TEST_URL || 'http://localhost:3000',
        summary: {
          total: totalCount,
          passed: passedCount,
          failed: totalCount - passedCount,
        },
        results,
      },
      null,
      2
    )
  );

  console.log(`\nDetailed results saved to: ${filename}`);

  // Exit with error code if any tests failed
  if (passedCount < totalCount) {
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
