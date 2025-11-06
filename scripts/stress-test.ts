/**
 * Stress Testing Script
 *
 * This script performs stress testing to identify system breaking points
 * and validate behavior under extreme load conditions.
 */

import autocannon from 'autocannon';
import { writeFileSync } from 'fs';

const TEST_WALLET = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';

interface StressTestPhase {
  name: string;
  connections: number;
  duration: number;
  pipelining?: number;
}

interface StressTestResult {
  phase: string;
  connections: number;
  duration: number;
  requestsPerSecond: number;
  latencyP95: number;
  latencyP99: number;
  errors: number;
  timeouts: number;
  throughputMBps: number;
  success: boolean;
}

async function runStressPhase(
  endpoint: string,
  phase: StressTestPhase
): Promise<StressTestResult> {
  const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
  const url = `${baseUrl}${endpoint}`;

  console.log(`\n--- Phase: ${phase.name} ---`);
  console.log(`  Connections: ${phase.connections}`);
  console.log(`  Duration: ${phase.duration}s`);

  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url,
        connections: phase.connections,
        pipelining: phase.pipelining || 1,
        duration: phase.duration,
        headers: {
          'Content-Type': 'application/json',
        },
      },
      (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        const success = result.errors === 0 && result.timeouts === 0;

        const testResult: StressTestResult = {
          phase: phase.name,
          connections: phase.connections,
          duration: phase.duration,
          requestsPerSecond: result.requests.average,
          latencyP95: result.latency.p95,
          latencyP99: result.latency.p99,
          errors: result.errors,
          timeouts: result.timeouts,
          throughputMBps: result.throughput.average / 1024 / 1024,
          success,
        };

        console.log(`  Requests/sec: ${result.requests.average.toFixed(2)}`);
        console.log(`  Latency p95: ${result.latency.p95}ms`);
        console.log(`  Errors: ${result.errors}`);
        console.log(`  Timeouts: ${result.timeouts}`);
        console.log(`  Status: ${success ? '✅ Stable' : '⚠️  Degraded'}`);

        resolve(testResult);
      }
    );

    autocannon.track(instance, { renderProgressBar: true });
  });
}

async function runStressTest(endpoint: string, endpointName: string): Promise<void> {
  console.log(`\n\n=== Stress Testing: ${endpointName} ===`);
  console.log(`Endpoint: ${endpoint}`);

  // Gradually increase load to find breaking point
  const phases: StressTestPhase[] = [
    { name: 'Baseline (10 connections)', connections: 10, duration: 15 },
    { name: 'Medium Load (25 connections)', connections: 25, duration: 15 },
    { name: 'High Load (50 connections)', connections: 50, duration: 15 },
    { name: 'Heavy Load (100 connections)', connections: 100, duration: 15 },
    { name: 'Extreme Load (200 connections)', connections: 200, duration: 15 },
  ];

  const results: StressTestResult[] = [];

  for (const phase of phases) {
    try {
      const result = await runStressPhase(endpoint, phase);
      results.push(result);

      // If the system starts failing, stop the test
      if (!result.success) {
        console.log('\n⚠️  System degradation detected. Stopping stress test.');
        break;
      }

      // Wait between phases
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`\n❌ Error in phase ${phase.name}:`, error);
      break;
    }
  }

  // Analyze results
  console.log(`\n\n--- ${endpointName} Stress Test Summary ---`);
  console.table(
    results.map((r) => ({
      Phase: r.phase,
      Connections: r.connections,
      'Req/sec': r.requestsPerSecond.toFixed(2),
      'p95 (ms)': r.latencyP95,
      'p99 (ms)': r.latencyP99,
      Errors: r.errors,
      Timeouts: r.timeouts,
      Status: r.success ? '✅' : '⚠️',
    }))
  );

  // Find maximum stable throughput
  const stableResults = results.filter((r) => r.success);
  if (stableResults.length > 0) {
    const maxThroughput = Math.max(...stableResults.map((r) => r.requestsPerSecond));
    const maxStablePhase = stableResults.find((r) => r.requestsPerSecond === maxThroughput);
    console.log(`\nMaximum Stable Throughput: ${maxThroughput.toFixed(2)} req/sec`);
    console.log(`Achieved at: ${maxStablePhase?.connections} concurrent connections`);
  }

  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `stress-test-${endpointName.toLowerCase()}-${timestamp}.json`;

  writeFileSync(
    filename,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        endpoint: endpointName,
        url: endpoint,
        phases: results,
        maxStableThroughput: stableResults.length
          ? Math.max(...stableResults.map((r) => r.requestsPerSecond))
          : 0,
      },
      null,
      2
    )
  );

  console.log(`\nResults saved to: ${filename}`);
}

async function runAllStressTests(): Promise<void> {
  console.log('=== Wallet Analytics API Stress Testing ===\n');
  console.log(`Test Wallet: ${TEST_WALLET}`);
  console.log(`Base URL: ${process.env.TEST_URL || 'http://localhost:3000'}`);

  const endpoints = [
    { path: `/api/v1/wallet/${TEST_WALLET}/overview`, name: 'Overview' },
    { path: `/api/v1/wallet/${TEST_WALLET}/portfolio`, name: 'Portfolio' },
    { path: `/api/v1/wallet/${TEST_WALLET}/activity`, name: 'Activity' },
    { path: `/api/v1/wallet/${TEST_WALLET}/risk`, name: 'Risk' },
  ];

  for (const endpoint of endpoints) {
    await runStressTest(endpoint.path, endpoint.name);

    // Wait between endpoint tests
    console.log('\n\n⏸️  Waiting 10 seconds before next endpoint...');
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  console.log('\n\n=== All Stress Tests Complete ===');
}

// Run stress tests
runAllStressTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
