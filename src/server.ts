import { createApp } from './app.js';
import { config } from './config/index.js';
import { cacheService } from './services/cache.js';
import { databaseService } from './services/database.js';
import { solanaService } from './services/solana.js';
import { logger } from './utils/logger.js';

/** Start the server */
async function start() {
  try {
    logger.info('🚀 Starting Solana Wallet Analytics API...\n');

    // Initialize services
    logger.info('📡 Connecting to services...');
    await Promise.all([cacheService.connect(), databaseService.connect()]);

    // Warm up Solana service to avoid cold start latency
    await solanaService.warmup();

    // Create Fastify app
    const app = await createApp();

    // Start listening
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.info('\n✨ Server is running!\n');
    logger.info(`📍 Environment: ${config.server.nodeEnv}`);
    logger.info(`🌐 URL: http://${config.server.host}:${config.server.port}`);
    logger.info(`💳 Payment Mode: ${config.payment.mode}`);
    logger.info(`⛓️  Solana Network: ${config.solana.network}\n`);

    // Graceful shutdown
    let isShuttingDown = false;
    const shutdown = async (signal: string) => {
      if (isShuttingDown) {
        logger.warn('Shutdown already in progress...');
        return;
      }

      isShuttingDown = true;
      logger.info(`\n${signal} received, shutting down gracefully...`);

      try {
        // Stop accepting new connections
        await app.close();
        logger.info('✓ Stopped accepting new connections');

        // Disconnect from services
        await Promise.all([
          cacheService.disconnect(),
          databaseService.disconnect(),
        ]);
        logger.info('✓ Disconnected from services');

        logger.info('👋 Server stopped');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught exception');
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.fatal({ reason, promise }, 'Unhandled rejection');
      shutdown('UNHANDLED_REJECTION');
    });
  } catch (error) {
    logger.error({ error }, '❌ Failed to start server');
    process.exit(1);
  }
}

// Start the server
start();
