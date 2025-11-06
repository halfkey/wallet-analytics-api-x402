/**
 * Performance Monitoring Script
 *
 * This script continuously monitors API performance and logs metrics.
 * Useful for tracking performance trends over time.
 */

import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { performance } from 'perf_hooks';

const TEST_WALLET = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const MONITOR_INTERVAL = parseInt(process.env.MONITOR_INTERVAL || '60000', 10); // 1 minute default
const LOG_FILE = 'performance-monitor.jsonl'; // JSON Lines format

interface PerformanceMetric {
  timestamp: string;
  endpoint: string;
  latency: number;
  status: number;
  success: boolean;
  cacheHit?: boolean;
}

interface HealthStatus {
  timestamp: string;
  status: string;
  dependencies: {
    cache: string;
    database: string;
    rpc: string;
  };
}

async function checkHealth(): Promise<HealthStatus> {
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();

    return {
      timestamp: new Date().toISOString(),
      status: data.status,
      dependencies: data.dependencies,
    };
  } catch (error) {
    return {
      timestamp: new Date().toISOString(),
      status: 'error',
      dependencies: {
        cache: 'unknown',
        database: 'unknown',
        rpc: 'unknown',
      },
    };
  }
}

async function measureEndpoint(
  endpoint: string,
  path: string
): Promise<PerformanceMetric> {
  const url = `${BASE_URL}${path}`;
  const start = performance.now();

  try {
    const response = await fetch(url);
    const end = performance.now();

    const data = await response.json();
    const cacheHit = response.headers.get('x-cache-hit') === 'true';

    return {
      timestamp: new Date().toISOString(),
      endpoint,
      latency: end - start,
      status: response.status,
      success: response.ok,
      cacheHit,
    };
  } catch (error) {
    const end = performance.now();

    return {
      timestamp: new Date().toISOString(),
      endpoint,
      latency: end - start,
      status: 0,
      success: false,
    };
  }
}

async function collectMetrics(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Collecting metrics...`);

  // Check health
  const health = await checkHealth();
  console.log(
    `  Health: ${health.status} (Cache: ${health.dependencies.cache}, DB: ${health.dependencies.database}, RPC: ${health.dependencies.rpc})`
  );

  // Log health status
  appendFileSync(
    LOG_FILE,
    JSON.stringify({ type: 'health', ...health }) + '\n'
  );

  // Measure all endpoints
  const endpoints = [
    { name: 'overview', path: `/api/v1/wallet/${TEST_WALLET}/overview` },
    { name: 'portfolio', path: `/api/v1/wallet/${TEST_WALLET}/portfolio` },
    { name: 'activity', path: `/api/v1/wallet/${TEST_WALLET}/activity` },
    { name: 'risk', path: `/api/v1/wallet/${TEST_WALLET}/risk` },
  ];

  for (const endpoint of endpoints) {
    const metric = await measureEndpoint(endpoint.name, endpoint.path);

    console.log(
      `  ${endpoint.name}: ${metric.latency.toFixed(2)}ms (${metric.status}) ${metric.cacheHit ? '[CACHE HIT]' : '[CACHE MISS]'}`
    );

    // Log metric
    appendFileSync(
      LOG_FILE,
      JSON.stringify({ type: 'metric', ...metric }) + '\n'
    );

    // Small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log('');
}

async function generateReport(): Promise<void> {
  if (!existsSync(LOG_FILE)) {
    console.log('No monitoring data available yet.');
    return;
  }

  const fs = await import('fs');
  const lines = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean);

  const metrics: PerformanceMetric[] = [];
  const healthChecks: HealthStatus[] = [];

  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      if (data.type === 'metric') {
        metrics.push(data);
      } else if (data.type === 'health') {
        healthChecks.push(data);
      }
    } catch (error) {
      // Skip invalid lines
    }
  }

  console.log('\n=== Performance Monitoring Report ===\n');
  console.log(`Total metrics collected: ${metrics.length}`);
  console.log(`Total health checks: ${healthChecks.length}`);

  // Group metrics by endpoint
  const endpointMetrics = metrics.reduce(
    (acc, m) => {
      if (!acc[m.endpoint]) {
        acc[m.endpoint] = [];
      }
      acc[m.endpoint].push(m.latency);
      return acc;
    },
    {} as Record<string, number[]>
  );

  console.log('\n--- Latency Statistics (all time) ---\n');

  const stats = Object.entries(endpointMetrics).map(([endpoint, latencies]) => {
    latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    const min = latencies[0];
    const max = latencies[latencies.length - 1];
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    return {
      Endpoint: endpoint,
      Count: latencies.length,
      'Avg (ms)': avg.toFixed(2),
      'Min (ms)': min.toFixed(2),
      'Max (ms)': max.toFixed(2),
      'p50 (ms)': p50.toFixed(2),
      'p95 (ms)': p95.toFixed(2),
      'p99 (ms)': p99.toFixed(2),
    };
  });

  console.table(stats);

  // Calculate cache hit rate
  const cacheMetrics = metrics.filter((m) => m.cacheHit !== undefined);
  const cacheHits = cacheMetrics.filter((m) => m.cacheHit).length;
  const cacheHitRate = (cacheHits / cacheMetrics.length) * 100;

  console.log(`\nCache Hit Rate: ${cacheHitRate.toFixed(2)}%`);
  console.log(`  Hits: ${cacheHits}`);
  console.log(`  Misses: ${cacheMetrics.length - cacheHits}`);

  // Health status summary
  const healthyChecks = healthChecks.filter((h) => h.status === 'healthy').length;
  const healthRate = (healthyChecks / healthChecks.length) * 100;

  console.log(`\nHealth Status: ${healthRate.toFixed(2)}% healthy`);
  console.log(`  Healthy: ${healthyChecks}`);
  console.log(`  Degraded: ${healthChecks.length - healthyChecks}`);

  // Recent errors
  const recentErrors = metrics
    .filter((m) => !m.success)
    .slice(-10)
    .map((m) => ({
      Timestamp: m.timestamp,
      Endpoint: m.endpoint,
      Status: m.status,
    }));

  if (recentErrors.length > 0) {
    console.log('\n--- Recent Errors (last 10) ---\n');
    console.table(recentErrors);
  }

  console.log('\n=====================================\n');
}

async function startMonitoring(): Promise<void> {
  console.log('=== Performance Monitoring Started ===\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Wallet: ${TEST_WALLET}`);
  console.log(`Interval: ${MONITOR_INTERVAL}ms (${MONITOR_INTERVAL / 1000}s)`);
  console.log(`Log File: ${LOG_FILE}`);
  console.log('\nPress Ctrl+C to stop and generate report\n');

  // Initialize log file if it doesn't exist
  if (!existsSync(LOG_FILE)) {
    writeFileSync(LOG_FILE, '');
    console.log(`Created log file: ${LOG_FILE}\n`);
  }

  // Collect metrics immediately
  await collectMetrics();

  // Set up interval for continuous monitoring
  const interval = setInterval(async () => {
    await collectMetrics();
  }, MONITOR_INTERVAL);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nStopping monitoring...\n');
    clearInterval(interval);
    await generateReport();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\nStopping monitoring...\n');
    clearInterval(interval);
    await generateReport();
    process.exit(0);
  });
}

// Command line arguments
const args = process.argv.slice(2);

if (args.includes('--report')) {
  // Generate report from existing data
  generateReport().then(() => process.exit(0));
} else {
  // Start monitoring
  startMonitoring().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
