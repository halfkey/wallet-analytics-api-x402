/** x402 Payment Protocol Types */

/** Payment mode: mock, test (devnet), or production (mainnet) */
export type PaymentMode = 'mock' | 'test' | 'payai';

/** Payment network (blockchain) */
export type PaymentNetwork = 'solana' | 'ethereum' | 'base' | 'polygon';

/** Payment currency/token */
export type PaymentCurrency = 'USDC' | 'USDT' | 'SOL';

/** HTTP 402 Payment Required headers */
export interface PaymentChallenge {
  /** Payment protocol identifier */
  protocol: 'x402';
  /** Payment amount (in specified currency) */
  amount: number;
  /** Payment currency */
  currency: PaymentCurrency;
  /** Blockchain network */
  network: PaymentNetwork;
  /** Payment recipient address (facilitator or direct) */
  address: string;
  /** Unique nonce for replay protection */
  nonce: string;
  /** Optional facilitator URL for payment processing */
  facilitatorUrl?: string;
  /** Timestamp when challenge was created */
  timestamp: string;
  /** Challenge expiration (typically 5 minutes) */
  expiresAt: string;
}

/** Payment proof submitted by client */
export interface PaymentProof {
  /** Payment protocol version */
  protocol: 'x402';
  /** Original nonce from challenge */
  nonce: string;
  /** Transaction signature/hash on blockchain */
  signature: string;
  /** Wallet address that made the payment */
  wallet: string;
  /** Payment amount */
  amount: number;
  /** Payment currency */
  currency: PaymentCurrency;
  /** Blockchain network */
  network: PaymentNetwork;
  /** Timestamp of payment */
  timestamp: string;
  /** Facilitator signature (if using facilitator) */
  facilitatorSignature?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Validated payment proof */
export interface ValidatedPayment {
  /** Whether payment is valid */
  valid: boolean;
  /** Payment proof data */
  proof: PaymentProof;
  /** Wallet address that paid */
  wallet: string;
  /** Amount paid */
  amount: number;
  /** Currency used */
  currency: PaymentCurrency;
  /** Endpoint being accessed */
  endpoint: string;
  /** When payment was verified */
  verifiedAt: Date;
  /** When payment proof expires */
  expiresAt: Date;
  /** Optional error message if invalid */
  error?: string;
  /** On-chain transaction hash (if settled) */
  transactionHash?: string;
  /** Network ID where transaction was settled */
  networkId?: string;
}

/** Endpoint pricing configuration */
export interface EndpointPricing {
  /** Endpoint path pattern */
  path: string;
  /** Price in USDC */
  priceUSDC: number;
  /** Optional custom currency */
  currency?: PaymentCurrency;
  /** Human-readable description */
  description: string;
}

/** Payment database record */
export interface PaymentRecord {
  id: number;
  nonce: string;
  walletAddress: string;
  amountUsdc: number;
  endpoint: string;
  proofData: PaymentProof;
  verifiedAt: Date;
  expiresAt: Date;
  createdAt: Date;
}
