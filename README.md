# Solana Wallet Analytics API

A high-performance API for analyzing Solana wallet data with frictionless x402 cryptocurrency payment integration.

## 🚀 Features

- **x402 Payment Protocol**: Pay-per-use API access without accounts or API keys
- **Comprehensive Wallet Analytics**: Portfolio analysis, token holdings, NFT valuations, DeFi positions
- **Multiple Payment Modes**: Mock (dev), Test (devnet), and Production (mainnet)
- **Enterprise Security**: Rate limiting, input validation, audit logging
- **High Performance**: Redis caching, parallel data fetching, optimized RPC calls

## 📋 Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Helius API key (free tier: 100K credits/month)
- Upstash Redis account (optional for development)
- Neon PostgreSQL account (optional for development)

## 🛠️ Tech Stack

- **Runtime**: Node.js 20 + TypeScript 5.7
- **Framework**: Fastify 5.x
- **Validation**: Zod
- **Blockchain**: @solana/web3.js, @solana/spl-token
- **Caching**: Redis (ioredis)
- **Database**: PostgreSQL (pg)
- **Testing**: Vitest
- **Linting**: ESLint + Prettier

## 📦 Installation

```bash
# Clone the repository
git clone <repository-url>
cd wallet-analytics-api

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
nano .env
```

## ⚙️ Configuration

### Environment Variables

See [.env.example](.env.example) for all available configuration options.

### Payment Modes

- **mock**: Auto-approve payments for development (no blockchain interaction)
- **test**: Use Solana devnet for testing real payment flows
- **payai**: Production mode with mainnet USDC payments

## 🏃 Development

```bash
# Run development server with hot reload
pnpm dev

# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage

# Lint code
pnpm lint

# Fix lint issues
pnpm lint:fix

# Format code
pnpm format

# Type check
pnpm typecheck
```

## 🏗️ Project Structure

```
src/
├── config/           # Configuration and environment validation
├── middleware/       # Fastify middleware (x402, rate limiting, etc.)
├── routes/          # API route handlers
│   └── wallet/      # Wallet-related endpoints
├── services/        # Business logic
│   ├── solana/      # Solana RPC interactions
│   ├── pricing/     # Token price aggregation
│   └── payment/     # Payment validation
├── models/          # Database models
├── schemas/         # Zod validation schemas
├── types/           # TypeScript type definitions
└── utils/           # Utility functions

tests/
├── unit/            # Unit tests
├── integration/     # Integration tests
└── setup.ts         # Test setup and helpers

scripts/
└── setup-db.ts      # Database schema setup
```

## 🔒 Security

- **Zero Trust Architecture**: Every request requires valid payment proof
- **Rate Limiting**: IP-based (before payment) and wallet-based (after payment)
- **Input Validation**: All inputs validated with Zod schemas
- **Secure Headers**: Helmet.js for HTTP security
- **No PII Collection**: Minimal data retention, GDPR compliant

## 📊 API Endpoints

### Health Check
```
GET /health
No payment required
```

### Wallet Overview
```
GET /api/v1/wallet/{address}/overview
Price: 0.01 USDC
Returns: Basic wallet stats (SOL balance, token count, total value)
```

### Portfolio Analysis
```
GET /api/v1/wallet/{address}/portfolio
Price: 0.05 USDC
Returns: Detailed token holdings with prices, NFTs, DeFi positions
```

### Activity Analysis
```
GET /api/v1/wallet/{address}/activity
Price: 0.10 USDC
Returns: Transaction history and activity metrics
```

### Risk Assessment
```
GET /api/v1/wallet/{address}/risk
Price: 0.10 USDC
Returns: Risk score and security analysis
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test --watch

# Specific test file
pnpm test tests/unit/services/solana.test.ts

# Coverage report
pnpm test:coverage
```

## 🚢 Deployment

### Railway (Recommended for MVP)

1. Push code to GitHub
2. Connect repository to Railway
3. Add environment variables
4. Deploy automatically

### Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Launch app
flyctl launch

# Deploy
flyctl deploy
```

## 📈 Roadmap

- [x] Phase 1: Foundation & x402 payment integration
- [ ] Phase 2: Enhanced features (NFTs, DeFi positions)
- [ ] Phase 3: Advanced analytics (activity, risk scoring)
- [ ] Phase 4: Production hardening (monitoring, multi-region)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

MIT

## 🆘 Support

For issues and questions, please open a GitHub issue.

---

Built with ❤️ using the x402 payment protocol
