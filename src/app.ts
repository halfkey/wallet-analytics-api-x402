import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/index.js';
import { x402PaymentMiddleware } from './middleware/x402Payment.js';
import { validateWalletAddress } from './middleware/validation.js';
import { endpointPricing } from './config/pricing.js';
import { solanaService } from './services/solana.js';

/** Create and configure Fastify application */
export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.server.isDevelopment
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },
        }
      : true,
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
    trustProxy: true, // Required for rate limiting behind proxies
    requestTimeout: 30000, // 30 seconds
    connectionTimeout: 60000, // 60 seconds
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
      },
    },
  });

  // CORS configuration
  await app.register(cors, {
    origin: config.server.isDevelopment
      ? '*'
      : config.security.corsOrigins?.[0] === '*'
      ? '*'
      : config.security.corsOrigins || false,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  });

  // Rate limiting - protect against abuse
  await app.register(rateLimit, {
    max: config.rateLimit.maxRequestsBeforePayment,
    timeWindow: config.rateLimit.windowMs,
    cache: 10000, // Cache size for storing rate limit data
    allowList: ['127.0.0.1'], // Allow localhost in development
    skipOnError: false, // Don't skip rate limiting on errors
    keyGenerator: (request) => {
      // Use IP address for rate limiting
      return request.ip || 'unknown';
    },
    errorResponseBuilder: (_request, _context) => {
      return {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later or make a payment to increase your limit.',
        statusCode: 429,
      };
    },
  });

  // Register x402 payment middleware globally
  app.addHook('preHandler', x402PaymentMiddleware);

  // Health check endpoint (no payment required)
  app.get('/health', async (_request, reply) => {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.server.nodeEnv,
      dependencies: {
        solana: 'unknown',
        redis: 'unknown',
        database: 'unknown',
      },
    };

    // Check Solana RPC
    try {
      await solanaService.connection.getEpochInfo();
      health.dependencies.solana = 'healthy';
    } catch (error) {
      health.dependencies.solana = 'unhealthy';
      health.status = 'degraded';
      app.log.warn({ error }, 'Solana RPC health check failed');
    }

    // Check Redis (cache service)
    try {
      await import('./services/cache.js').then(async (m) => {
        const testKey = 'health:check';
        const testValue = { status: 'ok', timestamp: Date.now() };
        await m.cacheService.set(testKey, testValue, 10);
        const value = await m.cacheService.get<{ status: string; timestamp: number }>(testKey);
        if (value && value.status === 'ok') {
          health.dependencies.redis = 'healthy';
        } else {
          throw new Error('Cache read/write test failed');
        }
      });
    } catch (error) {
      health.dependencies.redis = 'unhealthy';
      health.status = 'degraded';
      app.log.warn({ error }, 'Redis health check failed');
    }

    // Check Database
    try {
      await import('./services/database.js').then(async (m) => {
        await m.databaseService.query('SELECT 1');
        health.dependencies.database = 'healthy';
      });
    } catch (error) {
      health.dependencies.database = 'unhealthy';
      health.status = 'degraded';
      app.log.warn({ error }, 'Database health check failed');
    }

    const statusCode = health.status === 'ok' ? 200 : 503;
    return reply.code(statusCode).send(health);
  });

  // Root endpoint
  app.get('/', async (_request, reply) => {
    return reply.send({
      name: 'Solana Wallet Analytics API',
      version: '1.0.0',
      description: 'Pay-per-use wallet analytics with x402 payment protocol',
      paymentMode: config.payment.mode,
      endpoints: Object.fromEntries(
        Object.entries(endpointPricing).map(([path, pricing]) => [
          pricing.description,
          {
            path,
            price: `${pricing.priceUSDC} USDC`,
            method: 'GET',
          },
        ])
      ),
      freeEndpoints: {
        health: 'GET /health',
        root: 'GET /',
      },
      paymentProtocol: 'x402',
      documentation: 'https://github.com/halfkey/wallet-analytics-api-x402',
    });
  });

  // RPC proxy endpoint (no payment required, for transaction preparation only)
  // This allows frontend to use Helius RPC without exposing API key
  app.post('/api/v1/rpc', async (request, reply) => {
    try {
      const body = request.body as { method: string; params?: any[] };

      // Only allow specific safe RPC methods needed for transaction creation
      const allowedMethods = [
        'getAccountInfo',
        'getLatestBlockhash',
        'sendTransaction',
        'getSignatureStatuses',
      ];

      if (!allowedMethods.includes(body.method)) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: `RPC method '${body.method}' is not allowed`,
          statusCode: 403,
        });
      }

      // Forward the request to Helius RPC
      const rpcUrl = config.solana.rpcUrl;
      if (!rpcUrl) {
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'RPC URL not configured',
          statusCode: 500,
        });
      }

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: body.method,
          params: body.params || [],
        }),
      });

      const data = await response.json();
      return reply.send(data);
    } catch (error) {
      app.log.error({ error }, 'RPC proxy error');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to proxy RPC request',
        statusCode: 500,
      });
    }
  });

  // Wallet overview endpoint
  app.get(
    '/api/v1/wallet/:address/overview',
    { preHandler: validateWalletAddress },
    async (request, reply) => {
      const { address } = request.params as { address: string };

      try {
        // Fetch real wallet data from Solana
        const overview = await solanaService.getWalletOverview(address);

        return reply.send({
          success: true,
          wallet: address,
          payment: (request as any).payment, // Payment info added by middleware
          data: overview,
        });
      } catch (error) {
        app.log.error({ error, address }, 'Error fetching wallet overview');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch wallet data',
          statusCode: 500,
        });
      }
    }
  );

  // Wallet portfolio endpoint
  app.get(
    '/api/v1/wallet/:address/portfolio',
    { preHandler: validateWalletAddress },
    async (request, reply) => {
      const { address } = request.params as { address: string };

      try {
        // Fetch detailed portfolio data
        const portfolio = await solanaService.getWalletPortfolio(address);

        return reply.send({
          success: true,
          wallet: address,
          payment: (request as any).payment,
          data: portfolio,
        });
      } catch (error) {
        app.log.error({ error, address }, 'Error fetching wallet portfolio');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch portfolio data',
          statusCode: 500,
        });
      }
    }
  );

  /**
   * Activity Endpoint - Get wallet transaction history ($0.10 USDC)
   */
  app.get(
    '/api/v1/wallet/:address/activity',
    { preHandler: validateWalletAddress },
    async (request, reply) => {
      const { address } = request.params as { address: string };

      try {
        // Fetch wallet activity data
        const activity = await solanaService.getWalletActivity(address);

        return reply.send({
          success: true,
          wallet: address,
          payment: (request as any).payment,
          data: activity,
        });
      } catch (error) {
        app.log.error({ error, address }, 'Error fetching wallet activity');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch activity data',
          statusCode: 500,
        });
      }
    }
  );

  /**
   * Risk Endpoint - Get wallet risk assessment ($0.10 USDC)
   */
  app.get(
    '/api/v1/wallet/:address/risk',
    { preHandler: validateWalletAddress },
    async (request, reply) => {
      const { address } = request.params as { address: string };

      try {
        // Fetch wallet risk assessment
        const risk = await solanaService.getWalletRisk(address);

        return reply.send({
          success: true,
          wallet: address,
          payment: (request as any).payment,
          data: risk,
        });
      } catch (error) {
        app.log.error({ error, address }, 'Error fetching wallet risk');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch risk assessment',
          statusCode: 500,
        });
      }
    }
  );

  // 404 handler
  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({
      error: 'Not Found',
      message: 'The requested endpoint does not exist',
      statusCode: 404,
    });
  });

  // Global error handler
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);

    // Don't leak error details in production
    const message = config.server.isProduction
      ? 'Internal Server Error'
      : error.message;

    return reply.code(error.statusCode || 500).send({
      error: error.name || 'InternalServerError',
      message,
      statusCode: error.statusCode || 500,
    });
  });

  return app;
}
