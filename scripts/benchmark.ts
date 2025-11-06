/**
 * Performance Benchmarking Script
 *
 * This script performs detailed performance benchmarking including:
 * - Cold start vs warm cache performance
 * - Cache hit rate analysis
 * - Database query performance
 * - External API latency measurement
 */

import { performance } from 'perf_hooks';
import { writeFileSync } from 'fs';

const TEST_WALLET = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

interface BenchmarkResult {
  test: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
}

async function makeRequest(url: string): Promise<number> {
  const start = performance.now();

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    await response.json();
  } catch (error) {
    console.error(`Request failed: ${error}`);
    throw error;
  }

  const end = performance.now();
  return end - start;
}

async function clearCache(): Promise<void> {
  // Note: This requires the API to have a cache clearing endpoint
  // For now, we'll wait long enough for cache to expire
  console.log('  Waiting for cache to expire (5 minutes)...');
  await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
}

async function runBenchmark(
  name: string,
  url: string,
  iterations: number = 10,
  clearCacheBefore: boolean = false
): Promise<BenchmarkResult> {
  console.log(`\nRunning benchmark: ${name}`);
  console.log(`  URL: ${url}`);
  console.log(`  Iterations: ${iterations}`);
  console.log(`  Clear cache: ${clearCacheBefore}`);

  if (clearCacheBefore) {
    await clearCache();
  }

  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    try {
      const time = await makeRequest(url);
      times.push(time);
      console.log(`  Iteration ${i + 1}/${iterations}: ${time.toFixed(2)}ms`);

      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`  Iteration ${i + 1} failed:`, error);
    }
  }

  // Calculate statistics
  times.sort((a, b) => a - b);
  const totalTime = times.reduce((sum, t) => sum + t, 0);
  const avgTime = totalTime / times.length;
  const minTime = times[0];
  const maxTime = times[times.length - 1];

  const p50Index = Math.floor(times.length * 0.5);
  const p95Index = Math.floor(times.length * 0.95);
  const p99Index = Math.floor(times.length * 0.99);

  const p50 = times[p50Index] || 0;
  const p95 = times[p95Index] || 0;
  const p99 = times[p99Index] || 0;

  const result: BenchmarkResult = {
    test: name,
    iterations: times.length,
    totalTime,
    avgTime,
    minTime,
    maxTime,
    p50,
    p95,
    p99,
  };

  console.log('\n  Results:');
  console.log(`    Average: ${avgTime.toFixed(2)}ms`);
  console.log(`    Min: ${minTime.toFixed(2)}ms`);
  console.log(`    Max: ${maxTime.toFixed(2)}ms`);
  console.log(`    p50: ${p50.toFixed(2)}ms`);
  console.log(`    p95: ${p95.toFixed(2)}ms`);
  console.log(`    p99: ${p99.toFixed(2)}ms`);

  return result;
}

async function runAllBenchmarks(): Promise<void> {
  console.log('=== Performance Benchmarking ===\n');
  console.log(`Test Wallet: ${TEST_WALLET}`);
  console.log(`Base URL: ${BASE_URL}`);

  const results: BenchmarkResult[] = [];

  // Benchmark 1: Cold start (cache cleared)
  console.log('\n\n=== Cold Start Performance ===');
  results.push(
    await runBenchmark(
      'Overview (Cold)',
      `${BASE_URL}/api/v1/wallet/${TEST_WALLET}/overview`,
      5,
      true
    )
  );

  // Benchmark 2: Warm cache
  console.log('\n\n=== Warm Cache Performance ===');
  results.push(
    await runBenchmark(
      'Overview (Warm)',
      `${BASE_URL}/api/v1/wallet/${TEST_WALLET}/overview`,
      20,
      false
    )
  );

  // Benchmark 3: Portfolio endpoint
  results.push(
    await runBenchmark(
      'Portfolio (Warm)',
      `${BASE_URL}/api/v1/wallet/${TEST_WALLET}/portfolio`,
      20,
      false
    )
  );

  // Benchmark 4: Activity endpoint
  results.push(
    await runBenchmark(
      'Activity (Warm)',
      `${BASE_URL}/api/v1/wallet/${TEST_WALLET}/activity`,
      20,
      false
    )
  );

  // Benchmark 5: Risk endpoint
  results.push(
    await runBenchmark(
      'Risk (Warm)',
      `${BASE_URL}/api/v1/wallet/${TEST_WALLET}/risk`,
      20,
      false
    )
  );

  // Summary
  console.log('\n\n=== Benchmark Summary ===\n');

  console.table(
    results.map((r) => ({
      Test: r.test,
      Iterations: r.iterations,
      'Avg (ms)': r.avgTime.toFixed(2),
      'Min (ms)': r.minTime.toFixed(2),
      'Max (ms)': r.maxTime.toFixed(2),
      'p95 (ms)': r.p95.toFixed(2),
    }))
  );

  // Analyze cache performance
  const coldOverview = results.find((r) => r.test === 'Overview (Cold)');
  const warmOverview = results.find((r) => r.test === 'Overview (Warm)');

  if (coldOverview && warmOverview) {
    const cacheSpeedup = coldOverview.avgTime / warmOverview.avgTime;
    console.log('\n=== Cache Performance ===');
    console.log(`Cold start average: ${coldOverview.avgTime.toFixed(2)}ms`);
    console.log(`Warm cache average: ${warmOverview.avgTime.toFixed(2)}ms`);
    console.log(`Cache speedup: ${cacheSpeedup.toFixed(2)}x`);
  }

  // Check performance targets
  console.log('\n=== Performance Target Compliance ===');

  const targets = {
    'Overview (Warm)': 200,
    'Portfolio (Warm)': 800,
    'Activity (Warm)': 1500,
    'Risk (Warm)': 1000,
  };

  const compliance = results
    .filter((r) => r.test in targets)
    .map((r) => {
      const target = targets[r.test as keyof typeof targets];
      const passed = r.p95 <= target;
      return {
        Endpoint: r.test.replace(' (Warm)', ''),
        'Target (ms)': target,
        'Actual p95 (ms)': r.p95.toFixed(2),
        Status: passed ? '✅ PASS' : '❌ FAIL',
      };
    });

  console.table(compliance);

  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `benchmark-results-${timestamp}.json`;

  writeFileSync(
    filename,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        testWallet: TEST_WALLET,
        baseUrl: BASE_URL,
        results,
        compliance,
      },
      null,
      2
    )
  );

  console.log(`\nResults saved to: ${filename}`);
}

// Run benchmarks
runAllBenchmarks().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
