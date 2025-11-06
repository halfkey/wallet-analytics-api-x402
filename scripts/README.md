# Scripts Directory

This directory contains utility scripts for database setup, load testing, and performance monitoring.

## Database Scripts

### [setup-db.ts](setup-db.ts)

Sets up the PostgreSQL database schema for payment logging.

**Usage**:
```bash
pnpm run db:migrate
```

**What it does**:
- Creates `payment_logs` table
- Creates indexes for efficient querying
- Sets up database constraints

## Load Testing Scripts

### [load-test.ts](load-test.ts)

Main load testing script that validates performance targets.

**Usage**:
```bash
pnpm run load-test

# Test against different URL
TEST_URL=https://staging-api.example.com pnpm run load-test
```

**Performance targets**:
- Overview: < 200ms (p95)
- Portfolio: < 800ms (p95)
- Activity: < 1500ms (p95)
- Risk: < 1000ms (p95)

**Output**:
- Console summary table
- JSON file: `load-test-results-{timestamp}.json`

### [stress-test.ts](stress-test.ts)

Stress testing script that finds system breaking points.

**Usage**:
```bash
pnpm run stress-test
```

**What it does**:
- Progressive load testing (10 → 200 connections)
- Identifies maximum stable throughput
- Stops when system degrades
- Tests each endpoint separately

**Output**:
- Console progress and summary
- JSON files per endpoint: `stress-test-{endpoint}-{timestamp}.json`

### [benchmark.ts](benchmark.ts)

Detailed performance benchmarking with cache analysis.

**Usage**:
```bash
pnpm run benchmark
```

**What it does**:
- Cold start testing (5-minute wait)
- Warm cache testing
- Cache speedup calculation
- Performance target compliance

**Output**:
- Console summary and statistics
- JSON file: `benchmark-results-{timestamp}.json`

### [monitor-performance.ts](monitor-performance.ts)

Continuous performance monitoring tool.

**Usage**:
```bash
# Start monitoring (default: 60s interval)
pnpm run monitor

# Custom interval (30 seconds)
MONITOR_INTERVAL=30000 pnpm run monitor

# Generate report from existing logs
pnpm run monitor:report
```

**What it does**:
- Monitors all endpoints continuously
- Tracks health status
- Calculates cache hit rates
- Logs to JSONL file
- Generates summary on Ctrl+C

**Output**:
- Real-time console output
- JSONL log: `performance-monitor.jsonl`
- Summary report on exit

## Test Configuration

All load testing scripts use these defaults:

**Test wallet**:
```
DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK
```

**Base URL**:
```
http://localhost:3000
```

**Environment variables**:
- `TEST_URL` - Override base URL
- `MONITOR_INTERVAL` - Monitoring interval in milliseconds

## Running Tests

### Prerequisites

1. API server must be running:
```bash
pnpm run dev
```

2. Dependencies must be healthy:
   - Redis cache connected
   - PostgreSQL database connected
   - Helius RPC accessible

### Test Sequence

**Quick validation**:
```bash
# 1. Start API
pnpm run dev

# 2. Run load test (in another terminal)
pnpm run load-test
```

**Full performance analysis**:
```bash
# 1. Run benchmark (includes cold/warm cache)
pnpm run benchmark

# 2. Run load test
pnpm run load-test

# 3. Run stress test
pnpm run stress-test
```

**Continuous monitoring**:
```bash
# Start monitoring and let it run
pnpm run monitor

# Ctrl+C when done to see report
```

## Result Files

All test results are saved with timestamps:

```
load-test-results-2025-10-31T12-00-00-000Z.json
stress-test-overview-2025-10-31T12-00-00-000Z.json
stress-test-portfolio-2025-10-31T12-00-00-000Z.json
stress-test-activity-2025-10-31T12-00-00-000Z.json
stress-test-risk-2025-10-31T12-00-00-000Z.json
benchmark-results-2025-10-31T12-00-00-000Z.json
performance-monitor.jsonl
```

All result files are automatically ignored by git (see [../.gitignore](../.gitignore)).

## Documentation

See [../LOAD_TESTING.md](../LOAD_TESTING.md) for complete load testing guide including:
- Detailed usage instructions
- Performance optimization tips
- Troubleshooting guide
- CI/CD integration
- Best practices

See [../LOAD_TESTING_SETUP.md](../LOAD_TESTING_SETUP.md) for setup summary.

## Troubleshooting

### "Connection refused"
API is not running. Start it with `pnpm run dev`.

### Tests fail immediately
Check health endpoint: `curl http://localhost:3000/health`

### High latency
First test is cold start. Run again for warm cache results.

### Timeouts
- Check Helius RPC connectivity
- Verify Redis connection
- Check database connection

### 429 errors
Adjust rate limits in `.env`:
```bash
RATE_LIMIT_MAX_REQUESTS_AFTER_PAYMENT=100
```

## Support

For more help, see:
- [Load Testing Guide](../LOAD_TESTING.md)
- [Implementation Status](../IMPLEMENTATION_STATUS.md)
- [API Documentation](../docs/API.md)
