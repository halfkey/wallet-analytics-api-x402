import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { config } from './config/index.js';

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
    origin: config.server.isDevelopment ? '*' : false, // Restrict in production
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  // Health check endpoint (no payment required)
  app.get('/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.server.nodeEnv,
    });
  });

  // Root endpoint
  app.get('/', async (_request, reply) => {
    return reply.send({
      name: 'Solana Wallet Analytics API',
      version: '1.0.0',
      description: 'Pay-per-use wallet analytics with x402 payment protocol',
      endpoints: {
        health: 'GET /health',
        overview: 'GET /api/v1/wallet/{address}/overview',
        portfolio: 'GET /api/v1/wallet/{address}/portfolio',
        activity: 'GET /api/v1/wallet/{address}/activity',
        risk: 'GET /api/v1/wallet/{address}/risk',
      },
      paymentProtocol: 'x402',
      documentation: 'https://github.com/your-repo/wallet-analytics-api',
    });
  });

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
