# Production Deployment Guide

**System Status:** ✅ Production-ready
**Last Updated:** 2025-11-03

---

## Pre-Deployment Checklist

### ✅ Completed Items

- [x] All 4 API endpoints implemented and tested
- [x] x402 payment integration with security fixes
- [x] Redis caching (Upstash REST API) - production-ready
- [x] PostgreSQL database configured
- [x] Load testing completed (100% success rate)
- [x] Performance optimization (Risk: 21s → 1.4s)
- [x] Security audit completed (all critical issues fixed)
- [x] API documentation ([docs/API.md](docs/API.md))
- [x] Cross-endpoint replay protection
- [x] Rate limiting configured
- [x] Error handling and logging (Pino)
- [x] Health check endpoint (`/health`)

### ⚠️ Pending Items

- [ ] Production environment setup
- [ ] Production secrets configuration
- [ ] CI/CD pipeline setup
- [ ] Production monitoring (Grafana/Prometheus)
- [ ] Domain and SSL certificate
- [ ] Production database migration
- [ ] Backup and disaster recovery plan

---

## Deployment Options

### Option 1: Docker + Docker Compose (Recommended)

**Pros:**
- Easy to deploy and scale
- Consistent environment
- Built-in orchestration
- Works on any platform

**Deployment platforms:**
- Railway
- Render
- DigitalOcean App Platform
- AWS ECS/Fargate
- Google Cloud Run
- Azure Container Apps

### Option 2: Platform-as-a-Service (Easiest)

**Pros:**
- Zero devops required
- Automatic scaling
- Built-in monitoring

**Recommended platforms:**
- **Railway** (easiest, auto-deploy from git)
- **Render** (free tier, good for testing)
- **Fly.io** (edge deployment, low latency)

### Option 3: Traditional VPS

**Pros:**
- Full control
- Cost-effective for stable load
- No platform fees

**Platforms:**
- DigitalOcean Droplet
- Linode
- Vultr
- AWS EC2

---

## Quick Start: Docker Deployment

### 1. Create Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@9.15.0 && pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.15.0

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "dist/server.js"]
```

### 2. Create docker-compose.yml

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOST=0.0.0.0

      # Solana
      - SOLANA_NETWORK=mainnet-beta
      - HELIUS_RPC_URL_MAINNET=${HELIUS_RPC_URL_MAINNET}

      # Payment
      - PAYMENT_MODE=payai
      - PAYAI_FACILITATOR_URL=${PAYAI_FACILITATOR_URL}
      - PAYAI_PUBLIC_KEY=${PAYAI_PUBLIC_KEY}

      # Database
      - DATABASE_URL=${DATABASE_URL}

      # Redis (Upstash)
      - UPSTASH_REDIS_REST_URL=${UPSTASH_REDIS_REST_URL}
      - UPSTASH_REDIS_REST_TOKEN=${UPSTASH_REDIS_REST_TOKEN}

      # Logging
      - LOG_LEVEL=info

    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Optional: Local PostgreSQL (if not using external database)
  # db:
  #   image: postgres:16-alpine
  #   environment:
  #     POSTGRES_DB: wallet_analytics
  #     POSTGRES_USER: postgres
  #     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  #   volumes:
  #     - postgres_data:/var/lib/postgresql/data
  #   ports:
  #     - "5432:5432"

# volumes:
#   postgres_data:
```

### 3. Create .env.production

```bash
# Server
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Solana
SOLANA_NETWORK=mainnet-beta
HELIUS_RPC_URL_MAINNET=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY_HERE

# Payment (Switch to real payment in production)
PAYMENT_MODE=payai
PAYAI_FACILITATOR_URL=https://facilitator.payai.network
PAYAI_PUBLIC_KEY=YOUR_PAYAI_PUBLIC_KEY

# Database (Production)
DATABASE_URL=postgresql://user:password@host:5432/wallet_analytics

# Redis (Upstash Production)
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR_UPSTASH_TOKEN

# Logging
LOG_LEVEL=info
```

### 4. Deploy Commands

```bash
# Build and start
docker-compose --env-file .env.production up -d

# Check logs
docker-compose logs -f api

# Check health
curl http://localhost:3000/health

# Stop
docker-compose down
```

---

## Railway Deployment (Recommended for Quick Start)

### 1. Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### 2. Initialize Project

```bash
railway init
railway link
```

### 3. Set Environment Variables

```bash
# Solana
railway variables set SOLANA_NETWORK=mainnet-beta
railway variables set HELIUS_RPC_URL_MAINNET=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# Payment
railway variables set PAYMENT_MODE=payai
railway variables set PAYAI_FACILITATOR_URL=https://facilitator.payai.network
railway variables set PAYAI_PUBLIC_KEY=YOUR_KEY

# Database (Railway will provision PostgreSQL)
# No need to set DATABASE_URL - Railway auto-injects it

# Redis (Upstash)
railway variables set UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
railway variables set UPSTASH_REDIS_REST_TOKEN=YOUR_TOKEN

# Logging
railway variables set LOG_LEVEL=info
```

### 4. Add railway.json

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install && pnpm run build"
  },
  "deploy": {
    "startCommand": "node dist/server.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### 5. Deploy

```bash
# Deploy to Railway
railway up

# Check status
railway status

# View logs
railway logs

# Get URL
railway domain
```

---

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `PORT` | Server port | `3000` |
| `SOLANA_NETWORK` | Solana network | `mainnet-beta` |
| `HELIUS_RPC_URL_MAINNET` | Helius RPC endpoint | `https://mainnet.helius-rpc.com/?api-key=xxx` |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@host:5432/db` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | `AXuuAAIncD...` |

### Payment Variables (Production)

| Variable | Description | Example |
|----------|-------------|---------|
| `PAYMENT_MODE` | Payment mode | `payai` (production) or `mock` (dev) |
| `PAYAI_FACILITATOR_URL` | PayAI facilitator | `https://facilitator.payai.network` |
| `PAYAI_PUBLIC_KEY` | PayAI public key | Your PayAI public key |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging level | `info` |
| `HOST` | Bind host | `0.0.0.0` |

---

## Database Migration

### 1. Run Migrations (Production)

```bash
# Using DATABASE_URL from environment
pnpm run db:migrate

# Or specify database
DATABASE_URL=postgresql://user:pass@host:5432/db pnpm run db:migrate
```

### 2. Verify Database

```bash
# Check tables exist
psql $DATABASE_URL -c "\dt"

# Should show:
# - payment_proofs
# - nonces
# - (other tables)
```

---

## Post-Deployment Checklist

### 1. Verify Health Check

```bash
curl https://your-domain.com/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2025-11-03T00:00:00.000Z",
  "uptime": 123.45,
  "environment": "production",
  "dependencies": {
    "solana": "healthy",
    "redis": "healthy",
    "database": "healthy"
  }
}
```

### 2. Test API Endpoints

```bash
# Test overview endpoint (should get 402 Payment Required)
curl https://your-domain.com/api/v1/wallet/DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK/overview

# Expected: 402 with X-Payment-Challenge header
```

### 3. Monitor Logs

```bash
# Check for errors
docker-compose logs -f api | grep ERROR

# Or Railway
railway logs | grep ERROR
```

### 4. Set Up Monitoring

#### Option 1: Built-in Platform Monitoring
- Railway: Built-in metrics dashboard
- Render: Built-in resource monitoring
- Fly.io: Prometheus metrics

#### Option 2: External Monitoring
- **Uptime monitoring:** UptimeRobot, Pingdom
- **Application monitoring:** Sentry, LogRocket
- **Performance monitoring:** New Relic, Datadog

### 5. Configure Alerts

**Recommended alerts:**
- ❌ Health check failing (> 1 minute)
- ❌ Error rate > 1%
- ⚠️ p50 latency > 800ms
- ⚠️ CPU > 80%
- ⚠️ Memory > 90%

---

## Scaling Considerations

### Horizontal Scaling

**When to scale:**
- CPU consistently > 70%
- Request queue building up
- p50 latency > 800ms

**How to scale:**
```bash
# Docker Compose
docker-compose up --scale api=3

# Railway
railway scale --replicas 3

# Kubernetes
kubectl scale deployment api --replicas=3
```

### Vertical Scaling

**Recommended resources:**
- **Minimum:** 1 CPU, 512MB RAM
- **Recommended:** 2 CPU, 1GB RAM
- **High traffic:** 4 CPU, 2GB RAM

### Database Scaling

**Connection pooling configured:**
- Min: 2 connections
- Max: 10 connections

**For high traffic:**
- Increase max connections
- Use read replicas
- Add connection pooler (PgBouncer)

---

## Security Checklist

### Pre-Production

- [x] All secrets in environment variables (not in code)
- [x] Rate limiting enabled
- [x] CORS configured properly
- [x] Security headers (Helmet.js)
- [x] Input validation (Zod)
- [x] SQL injection prevention (parameterized queries)
- [x] Payment replay protection
- [ ] SSL/TLS certificate configured
- [ ] Firewall rules configured
- [ ] Database credentials rotated

### Post-Deployment

- [ ] Monitor error logs for suspicious activity
- [ ] Set up intrusion detection
- [ ] Regular security updates (dependencies)
- [ ] Backup database regularly
- [ ] Test disaster recovery plan

---

## Troubleshooting

### Server Won't Start

**Check logs:**
```bash
docker-compose logs api
railway logs
```

**Common issues:**
- Missing environment variables
- Database connection failed
- Redis connection failed
- Port already in use

### High Latency

**Check:**
1. Redis connection (should be < 50ms)
2. Database connection (should be < 100ms)
3. RPC endpoint health (check Helius status)
4. Cache hit rate (should be > 80%)

**Fix:**
```bash
# Check Redis
curl https://your-redis-instance.upstash.io

# Check database
psql $DATABASE_URL -c "SELECT 1"

# Check RPC
curl $HELIUS_RPC_URL_MAINNET
```

### Payment Errors

**Check:**
1. `PAYMENT_MODE` is set correctly
2. `PAYAI_FACILITATOR_URL` is accessible
3. `PAYAI_PUBLIC_KEY` is valid
4. Database has payment_proofs table

### Database Connection Errors

**Check:**
```bash
# Test connection
psql $DATABASE_URL -c "SELECT version()"

# Check connection string format
# Should be: postgresql://user:password@host:port/database
```

---

## Rollback Procedure

### Docker Deployment

```bash
# Rollback to previous version
docker-compose down
git checkout <previous-commit>
docker-compose up -d
```

### Railway Deployment

```bash
# Rollback via Railway dashboard
railway rollback

# Or redeploy previous commit
git checkout <previous-commit>
railway up
```

---

## Maintenance

### Regular Tasks

**Daily:**
- Check error logs
- Monitor latency metrics
- Verify health check

**Weekly:**
- Review performance metrics
- Check disk space
- Update dependencies (security patches)

**Monthly:**
- Database backup verification
- Load testing
- Security audit
- Cost optimization review

### Backup Strategy

**Database:**
```bash
# Daily automated backups
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Upload to S3/GCS
aws s3 cp backup_*.sql s3://your-bucket/backups/
```

**Recovery:**
```bash
# Restore from backup
psql $DATABASE_URL < backup_20251103.sql
```

---

## Cost Optimization

### Estimated Monthly Costs (Starter)

| Service | Provider | Cost |
|---------|----------|------|
| Hosting | Railway Starter | $5 |
| Database | Railway PostgreSQL | $5 |
| Redis | Upstash (10K requests/day) | Free |
| RPC | Helius (100K credits) | Free |
| **Total** | | **~$10/month** |

### Estimated Costs (Production - 100K req/month)

| Service | Provider | Cost |
|---------|----------|------|
| Hosting | Railway Pro | $20 |
| Database | Railway PostgreSQL | $10 |
| Redis | Upstash (500K req/month) | $10 |
| RPC | Helius (1M credits) | $49 |
| Monitoring | Sentry | $26 |
| **Total** | | **~$115/month** |

---

## Next Steps

1. ✅ **Choose deployment platform** (Railway recommended)
2. ✅ **Set up production secrets**
3. ✅ **Deploy to production**
4. ✅ **Run smoke tests**
5. ✅ **Set up monitoring**
6. ✅ **Configure domain + SSL**
7. ✅ **Submit to x402.org directory**

---

## Support Resources

- **Documentation:** [docs/API.md](docs/API.md)
- **Performance:** [PERFORMANCE_FINAL.md](PERFORMANCE_FINAL.md)
- **Security:** [AUDIT_REPORT.md](AUDIT_REPORT.md)
- **Implementation Status:** [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)

---

**Ready to deploy!** 🚀

For questions or issues, refer to the troubleshooting section or check the documentation.
