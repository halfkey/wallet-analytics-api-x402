# API Documentation

## Base URL

```
Development: http://localhost:3000
Production: https://your-domain.com
```

## Authentication

All paid endpoints use the x402 payment protocol. Each request follows a two-step process:

1. Initial request returns a 402 Payment Required response with a challenge
2. Subsequent request includes payment proof in the `X-Payment-Proof` header

## Response Format

### Success Response

```json
{
  "success": true,
  "wallet": "string",
  "payment": {
    "amount": "number",
    "currency": "string",
    "timestamp": "string (ISO 8601)"
  },
  "data": {}
}
```

### Error Response

```json
{
  "error": "string",
  "message": "string",
  "statusCode": "number",
  "details": "string (optional)"
}
```

## Endpoints

### GET /health

Check service health and dependency status.

**No payment required**

#### Response 200 - Healthy

```json
{
  "status": "ok",
  "timestamp": "2025-10-31T12:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "dependencies": {
    "solana": "healthy",
    "redis": "healthy",
    "database": "healthy"
  }
}
```

#### Response 503 - Degraded

```json
{
  "status": "degraded",
  "timestamp": "2025-10-31T12:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "dependencies": {
    "solana": "healthy",
    "redis": "unhealthy",
    "database": "unhealthy"
  }
}
```

---

### GET /api/v1/wallet/:address/overview

Get basic wallet metrics and overview.

**Price: 0.01 USDC**

#### Parameters

- `address` (path, required): Solana wallet address (base58-encoded public key)

#### Response 200

```json
{
  "success": true,
  "wallet": "GcwtkeCZezXzkvm7WZcCAmQmDC1oCTuL9vMwa8kQEPd9",
  "payment": {
    "amount": 0.01,
    "currency": "USDC",
    "timestamp": "2025-10-31T12:00:00.000Z"
  },
  "data": {
    "address": "string",
    "solBalance": 1.5,
    "solBalanceUSD": 150.0,
    "totalValueUSD": 1500.0,
    "tokenCount": 25,
    "nftCount": 10,
    "isActive": true,
    "topTokens": [
      {
        "mint": "string",
        "symbol": "USDC",
        "name": "USD Coin",
        "balance": 1000,
        "uiAmount": 1000.0,
        "decimals": 6,
        "valueUSD": 1000.0
      }
    ]
  }
}
```

#### Error Responses

- `400 Bad Request`: Invalid Solana address
- `402 Payment Required`: Payment challenge (initial request)
- `403 Forbidden`: Invalid payment proof
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

---

### GET /api/v1/wallet/:address/portfolio

Get detailed portfolio analysis including all tokens and NFTs.

**Price: 0.05 USDC**

#### Parameters

- `address` (path, required): Solana wallet address

#### Response 200

```json
{
  "success": true,
  "wallet": "GcwtkeCZezXzkvm7WZcCAmQmDC1oCTuL9vMwa8kQEPd9",
  "payment": {
    "amount": 0.05,
    "currency": "USDC",
    "timestamp": "2025-10-31T12:00:00.000Z"
  },
  "data": {
    "address": "string",
    "totalValueUSD": 1500.0,
    "solBalance": 1.5,
    "solBalanceUSD": 150.0,
    "tokens": [
      {
        "mint": "string",
        "symbol": "USDC",
        "name": "USD Coin",
        "balance": 1000000000,
        "uiAmount": 1000.0,
        "decimals": 6,
        "valueUSD": 1000.0
      }
    ],
    "nfts": [
      {
        "mint": "string",
        "name": "NFT Name",
        "symbol": "SYMBOL",
        "uri": "https://...",
        "verified": true,
        "collection": "string"
      }
    ],
    "breakdown": {
      "sol": 150.0,
      "tokens": 1000.0,
      "nfts": 350.0
    }
  }
}
```

---

### GET /api/v1/wallet/:address/activity

Get transaction history and activity metrics.

**Price: 0.10 USDC**

#### Parameters

- `address` (path, required): Solana wallet address

#### Response 200

```json
{
  "success": true,
  "wallet": "GcwtkeCZezXzkvm7WZcCAmQmDC1oCTuL9vMwa8kQEPd9",
  "payment": {
    "amount": 0.10,
    "currency": "USDC",
    "timestamp": "2025-10-31T12:00:00.000Z"
  },
  "data": {
    "address": "string",
    "transactionCount": 1000,
    "firstTransaction": "2021-01-01T00:00:00.000Z",
    "lastTransaction": "2025-10-31T12:00:00.000Z",
    "recentTransactions": [
      {
        "signature": "string",
        "timestamp": 1635724800,
        "type": "transfer",
        "status": "success",
        "fee": 0.000005,
        "description": "Transfer SOL"
      }
    ]
  }
}
```

---

### GET /api/v1/wallet/:address/risk

Get risk assessment and security analysis.

**Price: 0.10 USDC**

#### Parameters

- `address` (path, required): Solana wallet address

#### Response 200

```json
{
  "success": true,
  "wallet": "GcwtkeCZezXzkvm7WZcCAmQmDC1oCTuL9vMwa8kQEPd9",
  "payment": {
    "amount": 0.10,
    "currency": "USDC",
    "timestamp": "2025-10-31T12:00:00.000Z"
  },
  "data": {
    "address": "string",
    "riskScore": 0,
    "riskLevel": "low",
    "factors": [
      {
        "type": "wallet_age",
        "severity": "low",
        "description": "Wallet age: 1446 days",
        "impact": 0
      }
    ],
    "warnings": []
  }
}
```

#### Risk Levels

- **low**: riskScore < 30
- **medium**: 30 ≤ riskScore < 60
- **high**: riskScore ≥ 60

#### Risk Factors

- `wallet_age`: Newer wallets have higher risk
- `low_activity`: Very low transaction count
- `high_activity`: Suspicious high activity
- `empty_wallet`: Minimal or no holdings
- `concentrated_portfolio`: Single token concentration
- `high_value`: Potential honeypot detection
- `inactive`: No recent activity

---

## Rate Limiting

### Before Payment

- 10 requests per minute per IP address
- Applies to all endpoints

### After Payment

- 100 requests per minute per IP address
- Resets every 60 seconds

### Rate Limit Headers

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: 1635724800
```

### Rate Limit Response

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later or make a payment to increase your limit.",
  "statusCode": 429
}
```

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request - Invalid input |
| 402 | Payment Required - Payment challenge |
| 403 | Forbidden - Invalid payment proof |
| 404 | Not Found - Endpoint does not exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server error |
| 503 | Service Unavailable - Service degraded |

## Example Requests

### cURL

```bash
# Get wallet overview
curl -X GET "http://localhost:3000/api/v1/wallet/GcwtkeCZezXzkvm7WZcCAmQmDC1oCTuL9vMwa8kQEPd9/overview"

# Response: 402 Payment Required with challenge

# Make payment and get proof
# (In mock mode, any valid proof format works)

# Retry with payment proof
curl -X GET "http://localhost:3000/api/v1/wallet/GcwtkeCZezXzkvm7WZcCAmQmDC1oCTuL9vMwa8kQEPd9/overview" \
  -H "X-Payment-Proof: base64_encoded_proof"
```

### JavaScript/TypeScript

```typescript
// Initial request
const response1 = await fetch('http://localhost:3000/api/v1/wallet/YOUR_WALLET/overview');
const challenge = await response1.json();

// Get payment proof (implementation depends on payment mode)
const proof = createPaymentProof(challenge.payment.challenge);

// Request with payment
const response2 = await fetch('http://localhost:3000/api/v1/wallet/YOUR_WALLET/overview', {
  headers: {
    'X-Payment-Proof': Buffer.from(JSON.stringify(proof)).toString('base64')
  }
});

const data = await response2.json();
console.log(data);
```

### Python

```python
import requests
import json
import base64

# Initial request
url = "http://localhost:3000/api/v1/wallet/YOUR_WALLET/overview"
response1 = requests.get(url)
challenge = response1.json()

# Create payment proof
proof = create_payment_proof(challenge['payment']['challenge'])

# Request with payment
headers = {
    'X-Payment-Proof': base64.b64encode(json.dumps(proof).encode()).decode()
}
response2 = requests.get(url, headers=headers)
data = response2.json()
print(data)
```

## Caching

The API implements intelligent caching to improve performance:

| Data Type | Cache Duration |
|-----------|----------------|
| Wallet Data | 5 minutes |
| Token Prices | 2 minutes |
| NFT Floor Prices | 10 minutes |
| Risk Assessments | 10 minutes |

Cached responses include the same payment information but are served faster.
