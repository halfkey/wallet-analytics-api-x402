import { env } from './env.js';

/** Centralized application configuration */
export const config = {
  server: {
    port: env.PORT,
    host: env.HOST,
    nodeEnv: env.NODE_ENV,
    isDevelopment: env.NODE_ENV === 'development',
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
  },

  solana: {
    network: env.SOLANA_NETWORK,
    rpcUrl:
      env.SOLANA_NETWORK === 'mainnet-beta'
        ? env.HELIUS_RPC_URL_MAINNET
        : env.HELIUS_RPC_URL_DEVNET,
    heliusRpcUrlMainnet: env.HELIUS_RPC_URL_MAINNET,
    heliusRpcUrlDevnet: env.HELIUS_RPC_URL_DEVNET,
    commitment: 'confirmed' as const,
  },

  payment: {
    mode: env.PAYMENT_MODE,
    facilitatorUrl: env.PAYAI_FACILITATOR_URL,
    publicKey: env.PAYAI_PUBLIC_KEY,
    recipientAddress: env.PAYMENT_RECIPIENT_ADDRESS,
  },

  redis: {
    restUrl: env.UPSTASH_REDIS_REST_URL,
    restToken: env.UPSTASH_REDIS_REST_TOKEN,
  },

  database: {
    url: env.DATABASE_URL,
  },

  security: {
    corsOrigins: env.CORS_ORIGINS,
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequestsBeforePayment: env.RATE_LIMIT_MAX_REQUESTS_BEFORE_PAYMENT,
    maxRequestsAfterPayment: env.RATE_LIMIT_MAX_REQUESTS_AFTER_PAYMENT,
  },

  logging: {
    level: env.LOG_LEVEL,
  },

  cache: {
    ttl: {
      walletData: env.CACHE_TTL_WALLET_DATA,
      tokenPrices: env.CACHE_TTL_TOKEN_PRICES,
      nftFloorPrices: env.CACHE_TTL_NFT_FLOOR_PRICES,
    },
  },
} as const;

export { env } from './env.js';
