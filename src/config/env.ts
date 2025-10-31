import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/** Environment configuration schema with Zod validation */
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default('3000'),
  HOST: z.string().default('0.0.0.0'),

  // Solana
  SOLANA_NETWORK: z.enum(['mainnet-beta', 'devnet', 'testnet']).default('mainnet-beta'),
  HELIUS_RPC_URL_MAINNET: z.string().url().optional(),
  HELIUS_RPC_URL_DEVNET: z.string().url().optional(),

  // Payment
  PAYMENT_MODE: z.enum(['mock', 'test', 'payai']).default('mock'),
  PAYAI_FACILITATOR_URL: z.string().url().optional(),
  PAYAI_PUBLIC_KEY: z.string().optional(),

  // Redis
  REDIS_URL: z.string().url().optional(),

  // PostgreSQL
  DATABASE_URL: z.string().url().optional(),

  // Security & Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),
  RATE_LIMIT_MAX_REQUESTS_BEFORE_PAYMENT: z.string().transform(Number).default('10'),
  RATE_LIMIT_MAX_REQUESTS_AFTER_PAYMENT: z.string().transform(Number).default('100'),

  // Logging
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  // Cache TTL (seconds)
  CACHE_TTL_WALLET_DATA: z.string().transform(Number).default('300'),
  CACHE_TTL_TOKEN_PRICES: z.string().transform(Number).default('120'),
  CACHE_TTL_NFT_FLOOR_PRICES: z.string().transform(Number).default('600'),
});

/** Parse and validate environment variables */
const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    throw new Error('Invalid environment configuration');
  }

  return result.data;
};

export const env = parseEnv();

export type Env = z.infer<typeof envSchema>;
