/**
 * k6 Load Testing Script
 *
 * This provides an alternative load testing approach using k6.
 * Install k6: https://k6.io/docs/getting-started/installation/
 *
 * Run with:
 *   k6 run k6-load-test.js
 *
 * For cloud testing:
 *   k6 cloud k6-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const overviewLatency = new Trend('overview_latency');
const portfolioLatency = new Trend('portfolio_latency');
const activityLatency = new Trend('activity_latency');
const riskLatency = new Trend('risk_latency');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 }, // Ramp up to 10 users
    { duration: '1m', target: 10 }, // Stay at 10 users
    { duration: '30s', target: 25 }, // Ramp up to 25 users
    { duration: '1m', target: 25 }, // Stay at 25 users
    { duration: '30s', target: 50 }, // Ramp up to 50 users
    { duration: '1m', target: 50 }, // Stay at 50 users
    { duration: '30s', target: 0 }, // Ramp down to 0 users
  ],
  thresholds: {
    'http_req_duration{endpoint:overview}': ['p(95)<200'], // Overview < 200ms
    'http_req_duration{endpoint:portfolio}': ['p(95)<800'], // Portfolio < 800ms
    'http_req_duration{endpoint:activity}': ['p(95)<1500'], // Activity < 1500ms
    'http_req_duration{endpoint:risk}': ['p(95)<1000'], // Risk < 1000ms
    'errors': ['rate<0.01'], // Error rate < 1%
    'http_req_failed': ['rate<0.01'], // Failed requests < 1%
  },
};

const BASE_URL = __ENV.TEST_URL || 'http://localhost:3000';
const TEST_WALLET = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';

export default function () {
  // Test Overview endpoint
  let response = http.get(`${BASE_URL}/api/v1/wallet/${TEST_WALLET}/overview`, {
    tags: { endpoint: 'overview' },
  });

  check(response, {
    'overview status is 200': (r) => r.status === 200,
    'overview has data': (r) => JSON.parse(r.body).data !== undefined,
  }) || errorRate.add(1);

  overviewLatency.add(response.timings.duration);
  sleep(1);

  // Test Portfolio endpoint
  response = http.get(`${BASE_URL}/api/v1/wallet/${TEST_WALLET}/portfolio`, {
    tags: { endpoint: 'portfolio' },
  });

  check(response, {
    'portfolio status is 200': (r) => r.status === 200,
    'portfolio has data': (r) => JSON.parse(r.body).data !== undefined,
  }) || errorRate.add(1);

  portfolioLatency.add(response.timings.duration);
  sleep(1);

  // Test Activity endpoint
  response = http.get(`${BASE_URL}/api/v1/wallet/${TEST_WALLET}/activity`, {
    tags: { endpoint: 'activity' },
  });

  check(response, {
    'activity status is 200': (r) => r.status === 200,
    'activity has data': (r) => JSON.parse(r.body).data !== undefined,
  }) || errorRate.add(1);

  activityLatency.add(response.timings.duration);
  sleep(1);

  // Test Risk endpoint
  response = http.get(`${BASE_URL}/api/v1/wallet/${TEST_WALLET}/risk`, {
    tags: { endpoint: 'risk' },
  });

  check(response, {
    'risk status is 200': (r) => r.status === 200,
    'risk has data': (r) => JSON.parse(r.body).data !== undefined,
  }) || errorRate.add(1);

  riskLatency.add(response.timings.duration);
  sleep(1);
}

export function handleSummary(data) {
  return {
    'k6-summary.json': JSON.stringify(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;

  let output = '\n';
  output += indent + '=== k6 Load Test Summary ===\n\n';

  // Overall metrics
  output += indent + 'Overall Performance:\n';
  output +=
    indent +
    `  Total Requests: ${data.metrics.http_reqs?.values?.count || 0}\n`;
  output +=
    indent +
    `  Failed Requests: ${data.metrics.http_req_failed?.values?.rate || 0}\n`;
  output +=
    indent +
    `  Request Duration (p95): ${data.metrics.http_req_duration?.values?.['p(95)'] || 0}ms\n`;
  output += '\n';

  // Endpoint-specific metrics
  output += indent + 'Endpoint Performance:\n';
  output +=
    indent +
    `  Overview p95: ${data.metrics['overview_latency']?.values?.['p(95)'] || 0}ms (target: <200ms)\n`;
  output +=
    indent +
    `  Portfolio p95: ${data.metrics['portfolio_latency']?.values?.['p(95)'] || 0}ms (target: <800ms)\n`;
  output +=
    indent +
    `  Activity p95: ${data.metrics['activity_latency']?.values?.['p(95)'] || 0}ms (target: <1500ms)\n`;
  output +=
    indent +
    `  Risk p95: ${data.metrics['risk_latency']?.values?.['p(95)'] || 0}ms (target: <1000ms)\n`;

  return output;
}
