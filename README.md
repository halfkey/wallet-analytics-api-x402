# ChainScope API - Solana Wallet Analytics with x402

A production-ready REST API for analyzing Solana wallets with pay-per-use pricing via the x402 payment protocol. Built for the [Solana x402 Hackathon](https://solana.com/x402/hackathon).

**Live API:** https://api.chain-scope.dev
**Frontend Demo:** https://chain-scope.dev
**Frontend Repository:** https://github.com/halfkey/wallet-analytics-demo

## What is x402?

x402 is a revolutionary payment protocol that enables micropayments for API access. Instead of traditional API keys or subscription models, users pay per request using cryptocurrency (USDC on Solana). This creates a truly permissionless, pay-as-you-go API economy.

## Features

### x402 Payment Integration
- **Full x402 Protocol**: Complete implementation of HTTP 402 Payment Required
- **Two Payment Modes**: Mock (dev), On-chain (direct blockchain verification)
- **USDC Payments**: Mainnet USDC micropayments (0.01 - 0.10 per request)
- **Direct On-chain Verification**: Validates transactions directly on Solana blockchain
- **No Third Parties**: Fully decentralized payment verification

### Wallet Analytics
- **Wallet Overview**: SOL balance, token count, total portfolio value
- **Portfolio Analysis**: Detailed token holdings with real-time prices, NFTs, DeFi positions
- **Transaction History**: Comprehensive activity tracking with categorization
- **Risk Assessment**: Multi-factor security analysis and wallet age verification

### Production Features
- **High Performance**: Sub-100ms response times with Redis caching
- **Smart Rate Limiting**: Per-route rate limiting (analytics endpoints only, RPC proxy exempt)
- **Secure RPC Proxy**: Frontend access to Helius RPC without exposing API keys
- **Enhanced Error Handling**: Clear user feedback for payment failures and insufficient balance
- **Comprehensive Tests**: 35+ passing tests with 80%+ coverage
- **Docker Support**: Production-ready containerization
- **Health Monitoring**: Health checks and graceful shutdown
- **TypeScript**: Full type safety with Zod validation

## Prerequisites

- Node.js 18.0.0 or higher
- PostgreSQL 14 or higher
- Redis 6 or higher
- Helius RPC API key (available at [helius.dev](https://helius.dev))

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Fastify (high-performance HTTP server)
- **Database**: PostgreSQL (payment tracking)
- **Cache**: Redis (response caching)
- **Blockchain**: Solana Web3.js + Helius RPC
- **Validation**: Zod (environment and schema validation)

## Installation

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

## Configuration

### Environment Variables

See [.env.example](.env.example) for all available configuration options.

### Payment Modes

The API supports two payment verification modes:

- **mock**: Auto-approve all payments for development (no blockchain interaction)
  - Use for local testing and development
  - No real transactions required
  - Perfect for integration testing

- **onchain**: Direct on-chain verification via Solana blockchain (Production Mode)
  - Verifies transactions directly on Solana mainnet
  - No third-party payment processors
  - Maximum decentralization
  - Requires Helius RPC for transaction lookups
  - Validates amount, recipient, memo, and timestamp

## Development

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

## Project Structure

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

## Security

- **Zero Trust Architecture**: Every request requires valid payment proof
- **Smart Rate Limiting**: Per-route rate limiting applied only to paid analytics endpoints; RPC proxy exempt to enable transaction creation
- **Secure RPC Proxy**: Backend proxies Solana RPC calls, keeping Helius API key server-side and never exposed to browsers
- **Input Validation**: All inputs validated with Zod schemas
- **Secure Headers**: Helmet.js for HTTP security
- **No PII Collection**: Minimal data retention, GDPR compliant
- **Replay Attack Prevention**: Transaction memos tracked to prevent reuse

## API Endpoints

### Health Check
```
GET /health
No payment required
```

### RPC Proxy (New - Security Feature)
```
POST /api/v1/rpc
No payment required
Purpose: Proxy Solana RPC calls to keep Helius API key secure
Allowed methods: getAccountInfo, getLatestBlockhash, sendTransaction, getSignatureStatuses
```

This endpoint allows frontend applications to make Solana RPC calls through the backend, keeping the Helius API key secure and never exposing it to browsers. This is critical for the x402 payment flow, as users need to create and send transactions without requiring their own RPC credentials.

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

## x402 Implementation Details

This section explains how the x402 payment protocol is implemented in ChainScope.

### Payment Flow

1. **Initial Request**: Client makes GET request to protected endpoint
2. **402 Response**: Server returns HTTP 402 with payment challenge
3. **Payment Creation**: Client creates Solana transaction with:
   - Amount in USDC
   - Recipient (merchant wallet)
   - Memo (unique payment ID)
4. **Transaction Signature**: User signs transaction via wallet
5. **Blockchain Submission**: Transaction broadcast to Solana
6. **Retry with Proof**: Client retries request with X-PAYMENT header
7. **Verification**: Server verifies transaction on-chain
8. **Data Delivery**: Server returns requested data (HTTP 200)

### Payment Challenge Format

When a protected endpoint is accessed without payment, the server responds with:

```json
{
  "x402Version": 1,
  "paymentRequired": true,
  "acceptedCurrencies": ["USDC"],
  "amount": "0.05",
  "currency": "USDC",
  "recipient": "9xKsHQm7Vbr2Zzz...",
  "memo": "pay_1730912345_abc123",
  "endpoint": "/api/v1/wallet/{address}/portfolio",
  "network": "solana-mainnet"
}
```

### X-PAYMENT Header

Clients include payment proof in the `X-PAYMENT` header (Base64-encoded JSON):

```json
{
  "x402Version": 1,
  "payload": {
    "txSignature": "5j6F8kMx...",
    "fromAddress": "DYw8jCTf...",
    "toAddress": "9xKsHQ...",
    "amount": "0.05",
    "currency": "USDC",
    "memo": "pay_1730912345_abc123",
    "network": "solana-mainnet",
    "timestamp": "2025-11-06T12:34:56Z"
  }
}
```

### On-Chain Verification

The server verifies payments by:

1. **Signature Validation**: Check transaction signature exists on Solana (with 10 retries over 20 seconds to handle blockchain indexing delays)
2. **Amount Verification**: Confirm USDC amount matches price
3. **Recipient Check**: Verify payment sent to correct merchant wallet
4. **Memo Matching**: Ensure memo matches payment challenge
5. **Timestamp Check**: Transaction must be recent (< 5 minutes)
6. **Replay Prevention**: Check transaction hasn't been used before

**Note**: The verification process includes automatic retries with exponential backoff to handle Solana's transaction indexing delays. Most transactions verify within 1-2 seconds, but the system will wait up to 20 seconds for slower confirmation times.

### Code Structure

#### Middleware: [src/middleware/x402Payment.ts](src/middleware/x402Payment.ts)

The main x402 middleware that:
- Checks if endpoint requires payment
- Returns 402 challenges for unpaid requests
- Parses and validates X-PAYMENT headers
- Routes to appropriate verification method (mock/onchain)

#### Services:

- **[src/services/x402.ts](src/services/x402.ts)**: Core x402 protocol helpers
  - `createPaymentRequiredResponse()`: Generate 402 responses
  - `parsePaymentHeader()`: Parse X-PAYMENT headers
  - `createPaymentRequirement()`: Create payment challenges

- **[src/services/onChainVerification.ts](src/services/onChainVerification.ts)**: Direct blockchain verification
  - Fetches transactions from Solana via Helius RPC
  - Validates transaction details (amount, recipient, memo, timestamp)
  - Prevents replay attacks with memo tracking
  - No third-party payment processors required

#### Configuration: [src/config/pricing.ts](src/config/pricing.ts)

Defines endpoint pricing and payment requirements:

```typescript
export const ENDPOINT_PRICING = {
  '/api/v1/wallet/:address/overview': 0.01,
  '/api/v1/wallet/:address/portfolio': 0.05,
  '/api/v1/wallet/:address/activity': 0.10,
  '/api/v1/wallet/:address/risk': 0.10,
};
```

### Security Considerations

- **Replay Attack Prevention**: Memos include timestamp and random nonce
- **Amount Validation**: Exact amount matching required
- **Time Windows**: 5-minute window for transaction validity
- **Rate Limiting**: Both IP and wallet-based limits
- **No Stored Keys**: Merchant key only for verification, not signing

### Testing x402

Run the comprehensive test suite:

```bash
# All tests including x402 flow
pnpm test

# Specific x402 tests
pnpm test tests/integration/x402-payment.test.ts

# Test coverage
pnpm test:coverage
```

The test suite includes:
- Mock payment flow testing
- Payment header parsing
- Challenge generation
- Error handling scenarios

## Testing

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

## Deployment

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

## Architecture Highlights

- **Fastify**: High-performance HTTP framework (2x faster than Express)
- **Redis Caching**: Sub-100ms responses for cached data
- **PostgreSQL**: Payment tracking and analytics
- **Helius RPC**: Enhanced Solana RPC with transaction history
- **Docker**: Production containerization
- **TypeScript**: Full type safety throughout

## Performance Benchmarks

- Health check: < 10ms
- Cached response: < 100ms
- Fresh analytics (with payment): 500-1000ms
- Payment verification (on-chain): 2-5 seconds

## License

MIT

## Links

- **Live API**: https://api.chain-scope.dev
- **Frontend Demo**: https://chain-scope.dev
- **Frontend Repository**: https://github.com/halfkey/wallet-analytics-demo
- **x402 Hackathon**: https://solana.com/x402/hackathon

## Support

For issues or questions:
- Open a GitHub issue
- Check the [frontend repository](https://github.com/halfkey/wallet-analytics-demo) for client examples
- Review the x402 implementation details above

## Acknowledgments

Built for the Solana x402 Hackathon. Demonstrates production-ready implementation of the x402 payment protocol with direct on-chain verification, no API keys required.
